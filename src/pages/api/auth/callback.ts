// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { authorizationCodeGrant } from "openid-client";
import { getOrigin } from "../../../lib/auth/origin-helper";
import { getOidcConfig } from "../../../lib/auth/oidc-client";
import { applySessionCookie, deleteCookie } from "../../../lib/auth/session";
import { parseMetadata } from "../../../lib/auth/metadata-parser";
import { ZITADEL_PROJECT_ID } from "astro:env/server";

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

    console.log("[AUTH-CALLBACK] request.url-2:", request.url);

    // Exchange code + code_verifier for tokens
    const tokenResponse = await authorizationCodeGrant(config, request, {
      pkceCodeVerifier: pkceData.codeVerifier,
      expectedState: state,
      redirectUri,
    });

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

    // Extract roles from Zitadel claim: urn:zitadel:iam:org:project:roles
    const rolesClaim = idTokenClaims[
      `urn:zitadel:iam:org:project:${ZITADEL_PROJECT_ID}:roles`
    ] as Record<string, Record<string, string>> | undefined;

    let roles: string[] = ["editor"]; // fallback
    if (rolesClaim && typeof rolesClaim === "object") {
      roles = Object.keys(rolesClaim);
    }

    // Metadata aus ID-Token-Claims parsen (defensiv, Fehler unterbrechen Login nicht)
    const metadataRaw = idTokenClaims["urn:zitadel:iam:user:metadata"] as
      | Record<string, unknown>
      | undefined;
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
    console.error("[AUTH-CALLBACK] Token exchange failed:", err);
    return redirect("/auth-error?reason=token_error", 302);
  }
};
