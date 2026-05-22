// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { getOrigin } from "../../../lib/auth/origin-helper";
import { getSession, clearSession } from "../../../lib/auth/session";
import { ZITADEL_ISSUER, ZITADEL_CLIENT_ID } from "astro:env/server";

export const GET: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request);

  // Build end-session URL
  const endSessionUrl = new URL("/oidc/v1/end_session", ZITADEL_ISSUER);

  // Explizite externe Origin aus PUBLIC_SITE_URL, nicht aus request.url
  // (hinter Reverse-Proxy ist request.url = https://localhost/ – falsch)
  const origin = getOrigin();
  const postLogoutRedirectUri = `${origin}/`;

  console.log("[AUTH-LOGOUT-DEBUG] request.url:", request.url);
  console.log("[AUTH-LOGOUT-DEBUG] origin (getOrigin):", origin);
  console.log(
    "[AUTH-LOGOUT-DEBUG] post_logout_redirect_uri:",
    postLogoutRedirectUri,
  );

  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    postLogoutRedirectUri,
  );

  // client_id ersetzt das nicht mehr verfügbare id_token_hint
  endSessionUrl.searchParams.set("client_id", ZITADEL_CLIENT_ID);

  let response = redirect(endSessionUrl.toString(), 302);

  // Always clear the session cookie
  response = clearSession(response);

  return response;
};
