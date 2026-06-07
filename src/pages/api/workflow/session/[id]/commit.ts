// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// POST /api/workflow/session/:id/commit – Session speichern + schliessen
//
// Empfängt die vom Browser modifizierte Geometrie als GeoJSON, konvertiert
// sie serverseitig in GML (via PostGIS ST_GeomFromGeoJSON + ST_AsGML),
// schreibt sie per WFS-T in den GeoServer und schliesst die Session.
//
// Ablauf:
//   1. Auth + Session validieren
//   2. Feature-Attribute aus DB lesen (p2d2_grabflure)
//   3. GeoJSON-Geometrie aus dem Body in GML konvertieren
//   4. WFS-T-Insert an GeoServer senden → version_id
//   5. Session schliessen (Snapshot + completed + qs1_ausstehend)

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
  resolveVersionTable,
  getDomainFields,
  quoteIdent,
} from "../../../../../lib/workflow/utils";
import { hasPermission } from "../../../../../config/roles";
import { insertVersionWfst } from "../../../../../lib/workflow/wfst";
import type { WfstConfig } from "../../../../../lib/workflow/wfst";
import { closeSession } from "../../../../../lib/workflow/db";
import type { CloseSessionParams } from "../../../../../lib/workflow/db";

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
  let body: { geometry?: any; edit_comment?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Body ist kein gueltiges JSON");
  }

  if (!body.geometry || typeof body.geometry !== "object") {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "geometry (GeoJSON) ist erforderlich",
    );
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

  // -----------------------------------------------------------------------
  // 6. Feature-UUID aus der Version-0-Tabelle ermitteln
  //    (generisch: FK-Spalte aus featureType + session_id ohne Domänenwissen)
  // -----------------------------------------------------------------------
  const versionTable = resolveVersionTable(featureType);
  const fkCol = `${featureType}_id`;

  const [versionRow] = await sql`
    SELECT ${sql(fkCol)} AS feature_uuid
    FROM ${sql(schema)}.${sql(versionTable)}
    WHERE session_id = ${sessionId}
      AND version_nr = 0
    LIMIT 1
  `;

  if (!versionRow) {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Version 0 in Versionentabelle nicht gefunden",
    );
  }

  const featureUuid = versionRow.feature_uuid as string;

  // -----------------------------------------------------------------------
  // 7. Feature-Attribute aus DB lesen (Domain-Felder ohne Geometrie)
  // -----------------------------------------------------------------------
  const sourceTable = resolveSourceTable(featureType);
  const domainFields = await getDomainFields(sql, schema, featureType);
  const domainColList = domainFields
    .map((c: string) => quoteIdent(c))
    .join(", ");
  const qualifiedTable = `${quoteIdent(schema)}.${quoteIdent(sourceTable)}`;

  const attrQuery = `
    SELECT ${domainColList}
    FROM ${qualifiedTable}
    WHERE p2d2_uuid = $1
    LIMIT 1
  `;

  const [attrRow] = await sql.unsafe(attrQuery, [featureUuid]);
  if (!attrRow) {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Feature-Attribute nicht gefunden",
    );
  }

  const attributes: Record<string, unknown> = {};
  for (const col of domainFields) {
    attributes[col] = attrRow[col] ?? null;
  }

  // -----------------------------------------------------------------------
  // 8. Browser-Geometrie (GeoJSON) → GML konvertieren (via PostGIS)
  // -----------------------------------------------------------------------
  const geometryJson = JSON.stringify(body.geometry);

  const [gmlRow] = await sql`
    SELECT ST_AsGML(3, ST_GeomFromGeoJSON(${geometryJson}), 6, 1) AS geom_gml
  `;

  if (!gmlRow || !gmlRow.geom_gml) {
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

  // -----------------------------------------------------------------------
  // 9. WFS-T-Config aus Umgebungsvariablen
  // -----------------------------------------------------------------------
  const stageKey = stage.toUpperCase();
  let wfstEndpoint =
    process.env[`WFST_ENDPOINT_${stageKey}`] ?? process.env.WFST_ENDPOINT ?? "";
  // Workspace-spezifischen Endpoint sicherstellen
  // (/geoserver/ows → /geoserver/{geoPrefix}/ows)
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
  // 10. WFS-T-Insert an GeoServer senden
  // -----------------------------------------------------------------------
  let versionId: string;
  try {
    versionId = await insertVersionWfst(
      geoPrefix,
      featureType,
      sessionId,
      userEmail,
      body.edit_comment ?? "",
      featureUuid,
      featureData,
      wfstConfig,
    );
  } catch (wfstError: unknown) {
    const msg =
      wfstError instanceof Error ? wfstError.message : String(wfstError);
    // Session auf aborted setzen (Kompensation – 'error' existiert nicht im Enum)
    try {
      await sql`
        UPDATE ${sql(schema)}.${sql("wf_sessions")}
        SET state = 'aborted'
        WHERE id = ${sessionId}
      `;
    } catch {
      // Nicht kritisch – Session bleibt 'active' und wird durch Cleanup-Job bereinigt
    }
    return errorResponse(500, "WFS_T_ERROR", msg.slice(0, 1000));
  }

  // -----------------------------------------------------------------------
  // 11. Session schliessen (Snapshot + completed + qs1_ausstehend)
  // -----------------------------------------------------------------------
  try {
    const closeParams: CloseSessionParams = {
      sql,
      schema,
      sessionId,
      versionId,
      featureType,
      featureUuid,
      userEmail,
    };

    const result: SessionCloseResponse = await closeSession(closeParams);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (closeError: unknown) {
    // WFS-T war erfolgreich, aber Session-Finalisierung fehlgeschlagen
    const msg =
      closeError instanceof Error ? closeError.message : String(closeError);
    try {
      await sql`
        UPDATE ${sql(schema)}.${sql("wf_sessions")}
        SET state = 'aborted'
        WHERE id = ${sessionId}
      `;
    } catch {
      // Nicht kritisch – Session bleibt 'active' und wird durch Cleanup-Job bereinigt
    }
    return errorResponse(
      500,
      "FINALIZATION_ERROR",
      `WFS-T erfolgreich, aber Finalisierung fehlgeschlagen: ${msg.slice(0, 500)}`,
    );
  }
};
