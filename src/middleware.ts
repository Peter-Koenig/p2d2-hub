// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import { defineMiddleware } from "astro/middleware";
import {
  getSession,
  applySessionCookie,
  clearSession,
} from "./lib/auth/session";
import { getOidcConfig } from "./lib/auth/oidc-client";
import { refreshTokenGrant } from "openid-client";

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals } = context;

  const session = await getSession(request);

  // TEMPORARY DEBUG — SESSION-DIAGNOSE
  console.log(
    "[TEMPORARY DEBUG] Session gelesen:",
    session !== null ? "ja" : "nein",
  );

  if (session) {
    // Session existiert – kein Refresh nötig (Tokens aus Session entfernt)
    locals.user = {
      id: session.userId,
      name: session.userName,
      email: session.email,
      roles: session.roles,
      isAnonymous: false,
    };
    locals.isAuthenticated = true;

    // TEMPORARY DEBUG — SESSION-DIAGNOSE
    console.log(
      "[TEMPORARY DEBUG] Session userId:",
      session.userId,
      "Rollenanzahl:",
      session.roles.length,
    );
  }

  if (!locals.user) {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip),
    );
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);

    locals.user = {
      id: `anon:${hashHex}`,
      name: "Anonymer Beitragender",
      email: "",
      roles: ["editor"],
      isAnonymous: true,
    };
    locals.isAuthenticated = false;
  }

  const response = await next();

  if ((context as any)._sessionRefresh) {
    return applySessionCookie(response, (context as any)._sessionRefresh);
  }

  if ((context as any)._clearSession) {
    return clearSession(response);
  }

  return response;
});
