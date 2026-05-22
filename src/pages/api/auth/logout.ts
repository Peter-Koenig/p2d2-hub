// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { getSession, clearSession } from "../../../lib/auth/session";
import { ZITADEL_ISSUER } from "astro:env/server";

export const GET: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request);

  // Build end-session URL
  const endSessionUrl = new URL("/oidc/v1/end_session", ZITADEL_ISSUER);
  const origin = new URL(request.url).origin;

  endSessionUrl.searchParams.set("post_logout_redirect_uri", origin);

  // Kein id_token_hint: Das idToken wird nicht in der Browser-Session gespeichert,
  // um das Cookie-Größenlimit (4096 Bytes) einzuhalten.

  let response = redirect(endSessionUrl.toString(), 302);

  // Always clear the session cookie
  response = clearSession(response);

  return response;
};
