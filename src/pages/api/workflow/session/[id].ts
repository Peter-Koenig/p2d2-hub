// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// PATCH /api/workflow/session/:id – Session schliessen (Schritte 5–6)
//
// Setzt voraus, dass der Browser bereits Schritt 4 (WFS-T-Insert an
// GeoServer) ausgeführt hat und die version_id aus der WFS-T-Response
// im Request-Body uebergeben wird.
//
// Validierungen vor der DB-Transaktion:
//   - Session existiert, gehoert dem User, ist im State 'active'
//   - version_id existiert in der Versionentabelle mit passender session_id
//
// Schritte 5–6 in einer DB-Transaktion:
//   5. Snapshot finalisieren (wf_snapshots, is_final=true)
//   6. Session schliessen + Feature-Status → 'qs1_ausstehend'
//
// Themenunabhaengig: feature_type wird aus dem Session-Record gelesen,
// die Versionentabelle daraus abgeleitet (resolveVersionTable).

import type { APIRoute } from "astro";

import type {
  SessionCloseRequest,
  SessionCloseResponse,
  WorkflowSessionError,
} from "../../../../types/workflow";

import { getDb } from "../../../../lib/db";
import {
  resolveStageFromUrl,
  resolveVersionTable,
} from "../../../../lib/workflow/utils";
import { hasPermission } from "../../../../config/roles";
import { closeSession } from "../../../../lib/workflow/db";
import type { CloseSessionParams } from "../../../../lib/workflow/db";

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

export const PATCH: APIRoute = async ({ params, request, locals }) => {
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
  let body: SessionCloseRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Body ist kein gueltiges JSON");
  }

  if (!body.version_id || typeof body.version_id !== "string") {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "version_id (string) ist erforderlich",
    );
  }

  // -----------------------------------------------------------------------
  // 4. Stage aus URL ableiten + DB-Verbindung
  // -----------------------------------------------------------------------
  const hostname = new URL(request.url).hostname;
  const { stage } = resolveStageFromUrl(hostname);
  const schema = `p2d2_${stage}`;
  const sql = getDb();

  // -----------------------------------------------------------------------
  // 5a. Session-Record abrufen und validieren
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

  // -----------------------------------------------------------------------
  // 5b. Version-Record validieren + feature_uuid extrahieren
  // -----------------------------------------------------------------------
  const featureType = session.feature_type as string;
  const versionTable = resolveVersionTable(featureType);
  const fkCol = `${featureType}_id`;

  const [version] = await sql`
    SELECT ${sql(fkCol)} AS feature_uuid
    FROM ${sql(schema)}.${sql(versionTable)}
    WHERE version_id = ${body.version_id}
      AND session_id = ${sessionId}
    LIMIT 1
  `;

  if (!version) {
    return errorResponse(
      422,
      "VERSION_NOT_FOUND",
      `version_id ${body.version_id} in ${versionTable} nicht gefunden`,
    );
  }

  const featureUuid = version.feature_uuid as string;

  // -----------------------------------------------------------------------
  // 6. Session schliessen (Schritte 5–6 in einer Transaktion)
  // -----------------------------------------------------------------------
  try {
    const params: CloseSessionParams = {
      sql,
      schema,
      sessionId,
      versionId: body.version_id,
      featureType,
      featureUuid,
      userEmail,
    };

    const result: SessionCloseResponse = await closeSession(params);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const apiErr = err as { code?: string; cause?: Error };
    const msg =
      apiErr.cause instanceof Error
        ? apiErr.cause.message
        : String(apiErr.cause ?? err);
    return errorResponse(500, "INTERNAL_ERROR", msg.slice(0, 1000));
  }
};
