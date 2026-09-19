// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: OIDC-Logout: End-Session (via Discovery), Cookie-Löschung, client_id-Parameter
import type { APIRoute } from "astro";
import { getOrigin } from "../../../lib/auth/origin-helper";
import { getOidcConfig } from "../../../lib/auth/oidc-client";
import { getSession, clearSession } from "../../../lib/auth/session";
import { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_ZITADEL_PROJECT_ID } from "astro:env/server";

export const GET: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request);

  // End-Session-Endpunkt aus der OIDC-Discovery beziehen. Keycloak UND Zitadel liefern
  // ihn per Discovery (Zitadel verifiziert: end_session_endpoint vorhanden). Der
  // Fallback unten ist rein defensiv fuer den Fall, dass eine Discovery ihn nicht liefert.
  const config = await getOidcConfig();
  let endSessionEndpoint = config.serverMetadata().end_session_endpoint;

  if (!endSessionEndpoint && OIDC_ZITADEL_PROJECT_ID) {
    // Zitadel-Zweig: hartkodierter End-Session-Pfad (wie vor dem Refactor).
    endSessionEndpoint = new URL("/oidc/v1/end_session", OIDC_ISSUER).toString();
  }

  // Explizite externe Origin aus PUBLIC_SITE_URL, nicht aus request.url
  // (hinter Reverse-Proxy ist request.url = https://localhost/ – falsch)
  const origin = getOrigin();
  const postLogoutRedirectUri = `${origin}/`;

  let response;
  if (endSessionEndpoint) {
    const endSessionUrl = new URL(endSessionEndpoint);
    endSessionUrl.searchParams.set(
      "post_logout_redirect_uri",
      postLogoutRedirectUri,
    );
    // client_id ersetzt das nicht mehr verfügbare id_token_hint
    endSessionUrl.searchParams.set("client_id", OIDC_CLIENT_ID);
    response = redirect(endSessionUrl.toString(), 302);
  } else {
    // Kein End-Session-Endpunkt (Discovery unvollständig): nur lokal ausloggen.
    response = redirect(postLogoutRedirectUri, 302);
  }

  // Always clear the session cookie
  response = clearSession(response);

  return response;
};
