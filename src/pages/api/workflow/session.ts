// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// POST /api/workflow/session – Session oeffnen (Schritte 1–3)
//
// Nur noch Schritte 1-3 (Version 0, Session, Feature-Status).
// Schritt 4 (WFS-T) fuehrt der Browser direkt gegen den GeoServer aus.
// Schritte 5-6 (Snapshot, Session schliessen) erfolgen ueber
// PATCH /api/workflow/session/:id.
//
// Themenunabhaengig: feature_type kommt aus dem Request-Body.
// Auth ueber locals.user (Zitadel-Session-Cookie, kein x-user-email-Header mehr).

import type { APIRoute } from "astro";

import type {
  WorkflowSessionRequest,
  WorkflowSessionError,
} from "../../../types/workflow";

import { getDb } from "../../../lib/db";
import { resolveStageFromUrl } from "../../../lib/workflow/utils";
import { hasPermission } from "../../../config/roles";
import { openSession } from "../../../lib/workflow/db";
import type { OpenSessionParams } from "../../../lib/workflow/db";

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
// Validierung
// ---------------------------------------------------------------------------

/**
 * Validiert den Request-Body gegen das WorkflowSessionRequest-Schema.
 * Gibt bei Erfolg das validierte Objekt zurueck, bei Fehler eine Response.
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
    return errorResponse(400, "VALIDATION_ERROR", errors.join("; "));
  }

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

export const POST: APIRoute = async ({ request, locals }) => {
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
  if (!hasPermission(locals.user?.roles ?? [], "openSession")) {
    return errorResponse(
      403,
      "FORBIDDEN",
      "Keine Berechtigung für openSession",
    );
  }

  const userEmail = locals.user.email;

  // -----------------------------------------------------------------------
  // 2. Request-Body parsen und validieren
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
    return errorResponse(400, "INVALID_JSON", "Body ist kein gueltiges JSON");
  }

  // -----------------------------------------------------------------------
  // 3. Stage aus URL ableiten + DB-Verbindung
  // -----------------------------------------------------------------------
  const hostname = new URL(request.url).hostname;
  const { stage } = resolveStageFromUrl(hostname);
  const schema = `p2d2_${stage}`;
  const sql = getDb();

  // -----------------------------------------------------------------------
  // 4. Session oeffnen (Schritte 1–3 in einer Transaktion)
  // -----------------------------------------------------------------------
  try {
    const params: OpenSessionParams = { sql, schema, body, userEmail };
    const result = await openSession(params);

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    // openSession() wirft strukturierte Objekte { code, cause }
    const apiErr = err as { code?: string; cause?: Error };

    if (apiErr.code === "SESSION_CONFLICT") {
      return errorResponse(
        409,
        "SESSION_CONFLICT",
        apiErr.cause?.message ?? "Aktive Session existiert bereits",
      );
    }

    const msg =
      apiErr.cause instanceof Error
        ? apiErr.cause.message
        : String(apiErr.cause ?? err);
    return errorResponse(500, "INTERNAL_ERROR", msg.slice(0, 1000));
  }
};
