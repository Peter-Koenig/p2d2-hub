// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// POST /api/workflow/session – Generischer Session-Workflow
//
// Kapselt die 6 Backend-Schritte (Version 0, Session, Feature-Status,
// WFS-T-Insert, Snapshot, Abschluss) in einer einzigen HTTP-Ressource.
//
// Themenunabhängig:
//   - feature_type kommt aus dem Request-Body
//   - Tabellen-/Spaltennamen werden dynamisch abgeleitet
//   - Keine grabflur-spezifischen Bezeichner im Code
//
// Ablauf:
//   1. sql.begin() für Schritte 1–3 (DB)
//   2. WFS-T (HTTP, konzeptionell außerhalb der DB-Transaktion)
//   3. sql.begin() für Schritte 5–6 (DB)
//
// Bei Fehler in Schritt 4 (WFS-T) werden die DB-Änderungen aus
// Schritt 1–3 zurückgerollt. Ist WFS-T erfolgreich, Schritt 5 oder 6
// schlagen jedoch fehl, bleibt ein verwaister Eintrag im GeoServer
// (nicht rollbackbarer Seiteneffekt – wird durch Hintergrund-Job
// bereinigt).

import type { APIRoute } from "astro";

import type {
  WorkflowSessionRequest,
  WorkflowSessionResponse,
  WorkflowSessionError,
} from "../../../types/workflow";
import { SessionConflictError } from "../../../types/workflow";

import { getDb } from "../../../lib/db";
import {
  getFeatureData,
  resolveStageFromUrl,
} from "../../../lib/workflow/utils";

import {
  ensureVersion0,
  openSession,
  setFeatureStatus,
  finalizeSnapshot,
  closeSession,
} from "../../../lib/workflow/db";
import { insertVersionWfst } from "../../../lib/workflow/wfst";
import type { WfstConfig } from "../../../lib/workflow/wfst";

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

/**
 * Validiert den Request-Body gegen das WorkflowSessionRequest-Schema.
 * Gibt bei Erfolg null zurück, bei Fehler eine Fehler-Response.
 */
function validateBody(
  data: Record<string, unknown>,
): WorkflowSessionRequest | Response {
  const errors: string[] = [];

  if (!data.feature_type || typeof data.feature_type !== "string") {
    errors.push("feature_type (string) ist erforderlich");
  }
  if (!data.feature_uuid || typeof data.feature_uuid !== "string") {
    errors.push("feature_uuid (string) ist erforderlich");
  }
  if (!data.feature_set_id || typeof data.feature_set_id !== "string") {
    errors.push("feature_set_id (string) ist erforderlich");
  }
  if (
    !data.context ||
    typeof data.context !== "object" ||
    !(data.context as Record<string, unknown>).key ||
    !(data.context as Record<string, unknown>).label ||
    !(data.context as Record<string, unknown>).value
  ) {
    errors.push("context (object mit key, label, value) ist erforderlich");
  }
  if (!data.wpname || typeof data.wpname !== "string") {
    errors.push("wpname (string) ist erforderlich");
  }
  if (!data.municipality || typeof data.municipality !== "string") {
    errors.push("municipality (string) ist erforderlich");
  }
  if (typeof data.edit_comment !== "string") {
    errors.push("edit_comment (string) ist erforderlich");
  }

  if (errors.length > 0) {
    const errorBody: WorkflowSessionError = {
      error: "VALIDATION_ERROR",
      message: errors.join("; "),
    };
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Typ-Assertion nach erfolgreicher Validierung
  return {
    feature_type: data.feature_type as string,
    feature_uuid: data.feature_uuid as string,
    feature_set_id: data.feature_set_id as string,
    context: data.context as {
      key: string;
      label: string;
      value: string;
    },
    wpname: data.wpname as string,
    municipality: data.municipality as string,
    edit_comment: data.edit_comment as string,
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  // -----------------------------------------------------------------------
  // 1. Request-Body parsen und validieren
  // -----------------------------------------------------------------------
  let body: WorkflowSessionRequest;
  try {
    const raw: Record<string, unknown> = await request.json();
    const validated = validateBody(raw);

    if (validated instanceof Response) {
      return validated; // 400 Validation Error
    }

    body = validated;
  } catch {
    const errorBody: WorkflowSessionError = {
      error: "INVALID_JSON",
      message: "Der Request-Body ist kein gültiges JSON",
    };
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------------
  // 2. Benutzer + Stage aus Request ableiten
  // -----------------------------------------------------------------------
  // userEmail vom Reverse Proxy gesetzt, stage aus der aufgerufenen URL
  const userEmail = request.headers.get("x-user-email") ?? "";
  const hostname = new URL(request.url).hostname;
  const { stage, geoPrefix } = resolveStageFromUrl(hostname);
  const schema = `p2d2_${stage}`;

  // -----------------------------------------------------------------------
  // 3. WFS-T-Config aus Umgebungsvariablen
  // -----------------------------------------------------------------------
  const wfstConfig: WfstConfig = {
    endpoint: process.env[`WFST_ENDPOINT_${stage.toUpperCase()}`] ?? "",
    username: process.env[`WFST_USER_${stage.toUpperCase()}`] ?? "",
    password: process.env[`WFST_PW_${stage.toUpperCase()}`] ?? "",
  };

  if (!wfstConfig.endpoint || !wfstConfig.username || !wfstConfig.password) {
    const errorBody: WorkflowSessionError = {
      error: "CONFIG_ERROR",
      message: `Stage '${stage}' hat keine WFS-T-Konfiguration`,
    };
    return new Response(JSON.stringify(errorBody), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -----------------------------------------------------------------------
  // 4. DB-Verbindung holen (Pool-Singleton)
  // -----------------------------------------------------------------------
  const sql = getDb();

  // -----------------------------------------------------------------------
  // 5. Workflow ausführen
  // -----------------------------------------------------------------------
  try {
    // ------------------------------------------------------------------
    // (Version 0, Session öffnen, Feature-Status setzen)
    // ------------------------------------------------------------------
    const sessionId = await sql.begin(async (tx) => {
      // Schritt 1: Version 0 anlegen (idempotent)
      await ensureVersion0(tx, schema, body.feature_type, body.feature_uuid);

      // Schritt 2: Session öffnen
      const sid = await openSession(tx, schema, body, userEmail);

      // Schritt 3: Feature-Status → 'in_bearbeitung'
      await setFeatureStatus(
        tx,
        schema,
        body.feature_type,
        body.feature_uuid,
        sid,
      );

      return sid;
    });

    // ------------------------------------------------------------------
    // Schritt 4: WFS-T (außerhalb der DB-Transaktion)
    //
    // Die Feature-Daten werden in einer eigenen DB-Transaktion gelesen,
    // da der WFS-T-Aufruf nicht rollbackbar ist und wir keine
    // Transaktions-isolation für reine Leseoperationen benötigen.
    // ------------------------------------------------------------------
    let versionId: string;

    try {
      // Feature-Daten für das WFS-T-XML laden (einfacher SELECT, keine Transaktion nötig)
      const featureData = await getFeatureData(
        sql,
        schema,
        body.feature_type,
        body.feature_uuid,
      );

      // WFS-T-Insert an GeoServer senden
      versionId = await insertVersionWfst(
        geoPrefix,
        body.feature_type,
        sessionId,
        userEmail,
        body.edit_comment,
        body.feature_uuid,
        featureData,
        wfstConfig,
      );
    } catch (wfstError: unknown) {
      // WFS-T oder Daten-Lese-Fehler:
      // Session nachträglich auf 'error' setzen (Kompensation)
      const msg =
        wfstError instanceof Error ? wfstError.message : String(wfstError);

      try {
        await sql`
          UPDATE ${sql(schema, "wf_sessions")}
          SET state = 'error'
          WHERE id = ${sessionId}
        `;
      } catch {
        // Kompensationsfehler sind nicht kritisch – der Session-Eintrag
        // bleibt als 'active' erhalten und wird durch Hintergrund-Job
        // bereinigt.
      }

      const errorBody: WorkflowSessionError = {
        error: "WFS_T_ERROR",
        message: msg.slice(0, 1000),
      };
      return new Response(JSON.stringify(errorBody), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // Transaktion 2: Schritte 5–6
    // (Snapshot finalisieren, Session + Status abschließen)
    // ------------------------------------------------------------------
    let snapshotId: number;

    try {
      const result = await sql.begin(async (tx) => {
        // Schritt 5: Snapshot finalisieren
        const snapId = await finalizeSnapshot(
          tx,
          schema,
          body.feature_type,
          sessionId,
          body.feature_uuid,
          versionId,
          userEmail,
        );

        // Schritt 6: Session + Feature-Status abschließen
        await closeSession(
          tx,
          schema,
          body.feature_type,
          sessionId,
          body.feature_uuid,
          userEmail,
        );

        return snapId;
      });

      snapshotId = result;
    } catch (finalTxError: unknown) {
      // WFS-T war erfolgreich, aber die DB-Nachbereitung ist fehlgeschlagen.
      // GeoServer hat den Insert bereits verarbeitet – der Session-Eintrag
      // bleibt als 'active' und muss durch Hintergrund-Job bereinigt werden.
      const msg =
        finalTxError instanceof Error
          ? finalTxError.message
          : String(finalTxError);

      // Session auf 'error' setzen als Fallback
      try {
        await sql`
          UPDATE ${sql(schema, "wf_sessions")}
          SET state = 'error'
          WHERE id = ${sessionId}
        `;
      } catch {
        // Nicht kritisch
      }

      const errorBody: WorkflowSessionError = {
        error: "FINALIZATION_ERROR",
        message: `WFS-T erfolgreich, aber DB-Finalisierung fehlgeschlagen: ${msg.slice(0, 500)}`,
      };
      return new Response(JSON.stringify(errorBody), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // Erfolg: Response bauen
    // ------------------------------------------------------------------
    const response: WorkflowSessionResponse = {
      session_id: sessionId,
      version_id: versionId,
      snapshot_id: snapshotId,
      workflow_status: "qs1_ausstehend",
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    // ------------------------------------------------------------------
    // Globale Fehlerbehandlung
    // ------------------------------------------------------------------

    // SessionConflictError → 409 Conflict
    if (err instanceof SessionConflictError) {
      const errorBody: WorkflowSessionError = {
        error: "SESSION_CONFLICT",
        message: err.message,
      };
      return new Response(JSON.stringify(errorBody), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Alle anderen Fehler → 500
    const msg = err instanceof Error ? err.message : String(err);
    const errorBody: WorkflowSessionError = {
      error: "INTERNAL_ERROR",
      message: msg.slice(0, 1000),
    };

    return new Response(JSON.stringify(errorBody), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
