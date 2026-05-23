// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { getOidcConfig } from "../../../lib/auth/oidc-client";
import { getOrigin } from "../../../lib/auth/origin-helper";
import { setCookie } from "../../../lib/auth/session";
import { buildAuthorizationUrl } from "openid-client";
import { ZITADEL_PROJECT_ID } from "astro:env/server";

export const GET: APIRoute = async ({ request, redirect }) => {
  const config = await getOidcConfig();

  const state = crypto.randomUUID();
  const codeVerifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = btoa(String.fromCharCode(...codeVerifierBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  const origin = getOrigin();
  const redirectUri = `${origin}/api/auth/callback`;

  const scope = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "urn:zitadel:iam:user:metadata",
    `urn:zitadel:iam:org:project:id:${ZITADEL_PROJECT_ID}:aud`,
    "urn:zitadel:iam:org:project:roles",
  ].join(" ");

  const authorizationUrl = buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const pkceData = JSON.stringify({ state, codeVerifier, returnTo });
  let response = redirect(authorizationUrl.toString());

  const isSecure = import.meta.env.PROD;

  response = setCookie(response, "p2d2_pkce", pkceData, {
    maxAge: 300,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: isSecure,
  });

  return response;
};
