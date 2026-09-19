// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: OIDC-Callback: Token-Exchange, Session-Aufbau, Request-Normalisierung
import type { APIRoute } from "astro";
import { authorizationCodeGrant } from "openid-client";
import { getOrigin } from "../../../lib/auth/origin-helper";
import { getOidcConfig } from "../../../lib/auth/oidc-client";
import { applySessionCookie, deleteCookie } from "../../../lib/auth/session";
import { parseMetadata } from "../../../lib/auth/metadata-parser";
import { OIDC_CLIENT_ID, OIDC_ZITADEL_PROJECT_ID } from "astro:env/server";

export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // PKCE-Cookie lesen – DEBUG
  const cookieHeader = request.headers.get("cookie") ?? "";

  const pkceCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("p2d2_pkce="));

  if (!pkceCookie || !state) {
    return redirect("/auth-error?reason=invalid_request", 302);
  }

  let pkceData: { state: string; codeVerifier: string; returnTo: string };
  try {
    const rawValue = pkceCookie.slice("p2d2_pkce=".length);
    pkceData = JSON.parse(decodeURIComponent(rawValue));
  } catch (e) {
    return redirect("/auth-error?reason=invalid_pkce_cookie", 302);
  }

  // Verify state
  if (pkceData.state !== state) {
    return redirect("/auth-error?reason=state_mismatch", 302);
  }

  const returnTo = pkceData.returnTo ?? "/";

  // Build redirect response – will later attach session cookie
  let redirectResponse = redirect(returnTo, 302);

  // Delete PKCE cookie immediately
  redirectResponse = deleteCookie(redirectResponse, "p2d2_pkce");

  try {
    const config = await getOidcConfig();

    const redirectUri = `${getOrigin()}/api/auth/callback`;

    // Normalisiere die Request-URL für Reverse-Proxy-Setups:
    // request.url enthält intern localhost, die externe URL muss verwendet werden,
    // damit openid-client den redirect_uri-Abgleich korrekt durchführen kann.
    const incomingUrl = new URL(request.url);
    const externalCallbackUrl = `${redirectUri}${incomingUrl.search}`;
    const normalizedRequest = new Request(externalCallbackUrl, {
      method: request.method,
      headers: request.headers,
    });

    // Exchange code + code_verifier for tokens
    const tokenResponse = await authorizationCodeGrant(
      config,
      normalizedRequest,
      {
        pkceCodeVerifier: pkceData.codeVerifier,
        expectedState: state,
      },
    );

    // Validate ID token
    const idToken = tokenResponse.id_token;
    if (!idToken) {
      throw new Error("Kein ID-Token in der Token-Antwort");
    }
    const idTokenClaims = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf-8"),
    ) as Record<string, unknown> & { sub: string };

    if (!idTokenClaims) {
      throw new Error("ID-Token-Claims fehlen nach Validierung");
    }

    // Rollen: zuerst Keycloak (resource_access.<client_id>.roles, String-Array),
    // dann Dual-Provider-Fallback auf Zitadel (urn:zitadel:iam:org:project:<id>:roles).
    const resourceAccess = idTokenClaims["resource_access"] as
      | Record<string, { roles?: string[] }>
      | undefined;
    const clientRoles = resourceAccess?.[OIDC_CLIENT_ID]?.roles;

    let roles: string[] = ["editor"]; // fallback
    if (Array.isArray(clientRoles) && clientRoles.length > 0) {
      roles = clientRoles.filter((r): r is string => typeof r === "string");
    } else if (OIDC_ZITADEL_PROJECT_ID) {
      const zitadelRoles = idTokenClaims[
        `urn:zitadel:iam:org:project:${OIDC_ZITADEL_PROJECT_ID}:roles`
      ] as Record<string, unknown> | undefined;
      if (zitadelRoles && typeof zitadelRoles === "object") {
        const keys = Object.keys(zitadelRoles);
        if (keys.length > 0) roles = keys;
      }
    }

    // Metadaten: zuerst Keycloak ("user_metadata"), dann Zitadel-Fallback
    // ("urn:zitadel:iam:user:metadata"). Defensiv parsen (Fehler unterbrechen Login nicht).
    let metadataRaw = idTokenClaims["user_metadata"] as
      | Record<string, unknown>
      | undefined;
    if ((!metadataRaw || typeof metadataRaw !== "object") && OIDC_ZITADEL_PROJECT_ID) {
      metadataRaw = idTokenClaims["urn:zitadel:iam:user:metadata"] as
        | Record<string, unknown>
        | undefined;
    }
    const parsedMetadata = parseMetadata(metadataRaw);

    // Build session data (ohne Tokens – Cookie-Größen-Limit)
    const now = Math.floor(Date.now() / 1000);
    const sessionData = {
      userId: idTokenClaims.sub!,
      userName:
        (idTokenClaims["preferred_username"] as string) ??
        (idTokenClaims["email"] as string) ??
        idTokenClaims.sub!,
      displayName:
        (idTokenClaims["name"] as string) ??
        ((idTokenClaims["given_name"] as string) &&
        (idTokenClaims["family_name"] as string)
          ? `${idTokenClaims["given_name"]} ${idTokenClaims["family_name"]}`
          : undefined) ??
        (idTokenClaims["preferred_username"] as string) ??
        (idTokenClaims["email"] as string) ??
        idTokenClaims.sub!,
      email: (idTokenClaims.email as string) ?? "",
      roles,
      ...(parsedMetadata.memberships.length > 0
        ? { memberships: parsedMetadata.memberships }
        : {}),
      ...(Object.keys(parsedMetadata.preferences).some(
        (k) =>
          parsedMetadata.preferences[
            k as keyof typeof parsedMetadata.preferences
          ] !== undefined,
      )
        ? { preferences: parsedMetadata.preferences }
        : {}),
      expiresAt: now + (tokenResponse.expires_in ?? 3600),
    };

    // Apply session cookie to redirect response
    redirectResponse = await applySessionCookie(redirectResponse, sessionData);
    return redirectResponse;
  } catch (err) {
    return redirect("/auth-error?reason=token_error", 302);
  }
};
