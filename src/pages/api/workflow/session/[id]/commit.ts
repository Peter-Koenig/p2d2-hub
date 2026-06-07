// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// POST /api/workflow/session/:id/commit – Container-Version speichern + schliessen
//
// Empfängt ein Array von Features (GeoJSON-Geometrien + UUIDs), konvertiert
// sie serverseitig einzeln in GML (via PostGIS ST_GeomFromGeoJSON + ST_AsGML),
// schreibt sie per WFS-T in den GeoServer und finalisiert die Container-
// Version in der Datenbank.
//
// Ablauf:
//   1. Auth + Session validieren
//   2. Für jedes Feature: Attribute lesen → GML konvertieren → WFS-T-Insert
//   3. Container-Version finalisieren (commitContainerVersion)
//   4. Bei WFS-T-Fehler: Rollback der bereits erfolgten Inserts

import type { APIRoute } from "astro";

import type {
  FeatureData,
  SessionCloseResponse,
  WorkflowSessionError,
} from "../../../../../types/workflow";

import { getDb } from "../../../../../lib/db";
import {
  resolveStageFromUrl,
  resolveSourceTable,
  getDomainFields,
  quoteIdent,
} from "../../../../../lib/workflow/utils";
import { hasPermission } from "../../../../../config/roles";
import {
  insertVersionWfst,
  deleteVersionsWfst,
} from "../../../../../lib/workflow/wfst";
import type { WfstConfig } from "../../../../../lib/workflow/wfst";
import { commitContainerVersion } from "../../../../../lib/workflow/db";
import type { CommitContainerParams } from "../../../../../lib/workflow/db";

// ---------------------------------------------------------------------------
// Request-Body-Typ
// ---------------------------------------------------------------------------

interface CommitBody {
  features: Array<{ feature_uuid: string; geometry: any }>;
  edit_comment?: string;
}

// ---------------------------------------------------------------------------
// Error-Response-Helfer
// ---------------------------------------------------------------------------

function errorResponse(
  status: number,
  error: string,
  message?: string,
): Response {
  const body: WorkflowSessionError = { error, message: message ?? error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ params, request, locals }) => {
  // -----------------------------------------------------------------------
  // 1. Authentifizierung prüfen
  // -----------------------------------------------------------------------
  if (!locals.isAuthenticated) {
    return errorResponse(401, "UNAUTHORIZED", "Nicht authentisiert");
  }
  if (!locals.user?.email) {
    return errorResponse(
      401,
      "UNAUTHORIZED",
      "Kein authentifizierter Benutzer",
    );
  }
  if (!hasPermission(locals.user?.roles ?? [], "closeSession")) {
    return errorResponse(
      403,
      "FORBIDDEN",
      "Keine Berechtigung für closeSession",
    );
  }

  const userEmail = locals.user.email;

  // -----------------------------------------------------------------------
  // 2. Session-ID aus der URL validieren
  // -----------------------------------------------------------------------
  const rawId = params.id;
  if (!rawId || !/^\d+$/.test(rawId)) {
    return errorResponse(400, "BAD_REQUEST", "Ungueltige Session-ID");
  }
  const sessionId = parseInt(rawId, 10);

  // -----------------------------------------------------------------------
  // 3. Request-Body parsen und validieren
  // -----------------------------------------------------------------------
  let body: CommitBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Body ist kein gueltiges JSON");
  }

  if (!Array.isArray(body.features) || body.features.length === 0) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "features (Array) ist erforderlich und muss mindestens ein Element enthalten",
    );
  }

  for (let i = 0; i < body.features.length; i++) {
    const f = body.features[i];
    if (
      !f.feature_uuid ||
      typeof f.feature_uuid !== "string" ||
      !f.geometry ||
      typeof f.geometry !== "object"
    ) {
      return errorResponse(
        400,
        "BAD_REQUEST",
        `features[${i}] benötigt feature_uuid (string) und geometry (object)`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. Stage aus URL ableiten + DB-Verbindung
  // -----------------------------------------------------------------------
  const hostname = new URL(request.url).hostname;
  const { stage, geoPrefix } = resolveStageFromUrl(hostname);
  const schema = `p2d2_${stage}`;
  const sql = getDb();

  // -----------------------------------------------------------------------
  // 5. Session-Record abrufen und validieren
  // -----------------------------------------------------------------------
  const [session] = await sql`
    SELECT feature_type, feature_set_id, state, started_by
    FROM ${sql(schema)}.${sql("wf_sessions")}
    WHERE id = ${sessionId}
    LIMIT 1
  `;

  if (!session) {
    return errorResponse(404, "NOT_FOUND", "Session nicht gefunden");
  }

  if (session.started_by !== userEmail) {
    return errorResponse(
      403,
      "FORBIDDEN",
      "Session gehoert einem anderen Benutzer",
    );
  }

  if (session.state !== "active") {
    return errorResponse(
      422,
      "SESSION_NOT_ACTIVE",
      `Session ${sessionId} ist nicht aktiv (state=${session.state})`,
    );
  }

  const featureType = session.feature_type as string;
  const featureSetId = session.feature_set_id as string;

  // -----------------------------------------------------------------------
  // 6. WFS-T-Config aus Umgebungsvariablen
  // -----------------------------------------------------------------------
  const stageKey = stage.toUpperCase();
  let wfstEndpoint =
    process.env[`WFST_ENDPOINT_${stageKey}`] ?? process.env.WFST_ENDPOINT ?? "";
  wfstEndpoint = wfstEndpoint.replace(
    "/geoserver/ows",
    `/geoserver/${geoPrefix}/ows`,
  );
  const wfstConfig: WfstConfig = {
    endpoint: wfstEndpoint,
    username:
      process.env[`WFST_USER_${stageKey}`] ?? process.env.WFST_USERNAME ?? "",
    password:
      process.env[`WFST_PW_${stageKey}`] ?? process.env.WFST_PASSWORD ?? "",
  };

  if (!wfstConfig.endpoint || !wfstConfig.username || !wfstConfig.password) {
    return errorResponse(
      500,
      "CONFIG_ERROR",
      `Stage '${stage}' hat keine WFS-T-Konfiguration`,
    );
  }

  // -----------------------------------------------------------------------
  // 7. Feature-Attribute + Domain-Felder ermitteln (themenweit identisch)
  // -----------------------------------------------------------------------
  const sourceTable = resolveSourceTable(featureType);
  const domainFields = await getDomainFields(sql, schema, featureType);
  const domainColList = domainFields
    .map((c: string) => quoteIdent(c))
    .join(", ");
  const qualifiedTable = `${quoteIdent(schema)}.${quoteIdent(sourceTable)}`;

  // -----------------------------------------------------------------------
  // 8. WFS-T-Inserts für jedes modifizierte Feature
  // -----------------------------------------------------------------------
  const modifiedUuids: string[] = [];
  const insertedVersionIds: string[] = [];
  let wfstFailed = false;

  for (const feat of body.features) {
    const featureUuid = feat.feature_uuid;
    modifiedUuids.push(featureUuid);

    // --- 8a. Feature-Attribute aus DB lesen ---
    const attrQuery = `
      SELECT ${domainColList}
      FROM ${qualifiedTable}
      WHERE p2d2_uuid = $1
      LIMIT 1
    `;

    const [attrRow] = await sql.unsafe(attrQuery, [featureUuid]);
    if (!attrRow) {
      // Feature existiert nicht in Quelltabelle → WFS-T-Rollback + Fehler
      await deleteVersionsWfst(
        geoPrefix,
        featureType,
        insertedVersionIds,
        wfstConfig,
      );
      await sql`
        UPDATE ${sql(schema)}.${sql("wf_sessions")}
        SET state = 'aborted'
        WHERE id = ${sessionId}
      `;
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        `Feature ${featureUuid} in Tabelle ${sourceTable} nicht gefunden`,
      );
    }

    const attributes: Record<string, unknown> = {};
    for (const col of domainFields) {
      attributes[col] = attrRow[col] ?? null;
    }

    // --- 8b. GeoJSON → GML konvertieren (via PostGIS) ---
    const geometryJson = JSON.stringify(feat.geometry);

    const [gmlRow] = await sql`
      SELECT ST_AsGML(3, ST_GeomFromGeoJSON(${geometryJson}), 6, 0) AS geom_gml
    `;

    if (!gmlRow || !gmlRow.geom_gml) {
      await deleteVersionsWfst(
        geoPrefix,
        featureType,
        insertedVersionIds,
        wfstConfig,
      );
      await sql`
        UPDATE ${sql(schema)}.${sql("wf_sessions")}
        SET state = 'aborted'
        WHERE id = ${sessionId}
      `;
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "Geometrie-Konvertierung fehlgeschlagen",
      );
    }

    const featureData: FeatureData = {
      geom_gml: gmlRow.geom_gml as string,
      attributes,
    };

    // --- 8c. WFS-T-Insert an GeoServer senden ---
    try {
      const versionId = await insertVersionWfst(
        geoPrefix,
        featureType,
        sessionId,
        userEmail,
        body.edit_comment ?? "",
        featureUuid,
        featureData,
        wfstConfig,
        1, // versionNr = 1 (Platzhalter, wird nach Commit per DB-Update überschrieben)
      );
      insertedVersionIds.push(versionId);
    } catch (wfstError: unknown) {
      wfstFailed = true;
      const msg =
        wfstError instanceof Error ? wfstError.message : String(wfstError);

      // Rollback: bereits erfolgte WFS-T-Inserts rückgängig machen
      try {
        await deleteVersionsWfst(
          geoPrefix,
          featureType,
          insertedVersionIds,
          wfstConfig,
        );
      } catch {
        // Rollback-Fehler sind nicht kritisch – der Hauptfehler hat Vorrang
      }

      // Session auf aborted setzen
      try {
        await sql`
          UPDATE ${sql(schema)}.${sql("wf_sessions")}
          SET state = 'aborted'
          WHERE id = ${sessionId}
        `;
      } catch {
        // Nicht kritisch
      }

      return errorResponse(500, "WFS_T_ERROR", msg.slice(0, 1000));
    }
  }

  // -----------------------------------------------------------------------
  // 9. Container-Version finalisieren (DB-Transaktion)
  // -----------------------------------------------------------------------
  try {
    const commitParams: CommitContainerParams = {
      sql,
      schema,
      sessionId,
      featureType,
      featureSetId,
      modifiedUuids,
      insertedVersionIds,
      userEmail,
      editComment: body.edit_comment ?? "",
    };

    const result = await commitContainerVersion(commitParams);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (closeError: unknown) {
    // WFS-T war erfolgreich, aber DB-Finalisierung fehlgeschlagen
    // → WFS-T-Inserts rückgängig machen
    const msg =
      closeError instanceof Error ? closeError.message : String(closeError);

    try {
      await deleteVersionsWfst(
        geoPrefix,
        featureType,
        insertedVersionIds,
        wfstConfig,
      );
    } catch {
      // Rollback-Fehler loggen, aber nicht überschreiben
    }

    try {
      await sql`
        UPDATE ${sql(schema)}.${sql("wf_sessions")}
        SET state = 'aborted'
        WHERE id = ${sessionId}
      `;
    } catch {
      // Nicht kritisch
    }

    return errorResponse(
      500,
      "FINALIZATION_ERROR",
      `WFS-T erfolgreich, aber Finalisierung fehlgeschlagen: ${msg.slice(0, 500)}`,
    );
  }
};
