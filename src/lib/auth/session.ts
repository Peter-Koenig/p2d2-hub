// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Session-Verschlüsselung, Cookie-Handling und UserSession-Factory
import { SESSION_SECRET } from "astro:env/server";
import type { Membership, UserPreferences } from "./metadata-parser";

// Types
export interface SessionData {
  userId: string;
  userName: string;
  displayName: string;
  email: string;
  roles: string[];
  memberships?: Membership[];
  preferences?: UserPreferences;
  expiresAt: number;
}

export interface UserSession {
  isAuthenticated: boolean;
  sub?: string;
  userName?: string;
  displayName?: string;
  email?: string;
  roles: string[];
  memberships?: Membership[];
  preferences?: UserPreferences;
}

// Constants
const COOKIE_NAME = "p2d2_session";
const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100_000;
const SALT = new TextEncoder().encode("p2d2-session-salt-v1");

// Key derivation (lazy, cached)
let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

// Encrypt / Decrypt
async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function decrypt(encoded: string): Promise<string | null> {
  const key = await getKey();
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  const combined = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (combined.length <= IV_LENGTH) return null;
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// Cookie helpers
const _isSecure = import.meta.env.PROD;

function buildCookieHeader(value: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    ...(_isSecure ? ["Secure"] : []),
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function clearCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    ...(_isSecure ? ["Secure"] : []),
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    result[name] = value;
  }
  return result;
}

// Public API

export async function getSession(
  request: Request,
): Promise<SessionData | null> {
  const cookies = parseCookies(request);
  const cookieValue = cookies[COOKIE_NAME];
  if (!cookieValue) return null;
  const decrypted = await decrypt(cookieValue);
  if (!decrypted) return null;
  try {
    const data = JSON.parse(decrypted) as SessionData;
    if (!data.userId || !Array.isArray(data.roles)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function applySessionCookie(
  response: Response,
  data: SessionData,
): Promise<Response> {
  const plaintext = JSON.stringify(data);

  // Cookie-Größenkontrolle – bleibt erhalten, um Session-Erweiterungen
  // im nächsten Schritt gegen das 4096-Byte-Limit abzusichern.
  console.log("[COOKIE-SIZE] session JSON length:", plaintext.length);
  console.log(
    "[COOKIE-SIZE] displayName, memberships:",
    `name=${data.displayName ? "yes" : "no"}, mem=${data.memberships?.length ?? 0}, pref=${data.preferences ? "yes" : "no"}`,
  );

  const cookieValue = await encrypt(plaintext);

  console.log("[COOKIE-SIZE] encrypted cookie length:", cookieValue.length);

  const maxAge = Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000));
  const cookieHeader = buildCookieHeader(cookieValue, maxAge);

  console.log("[COOKIE-SIZE] Set-Cookie header length:", cookieHeader.length);
  console.log(
    "[COOKIE-SIZE] approx cookie budget remaining:",
    Math.max(0, 4096 - cookieHeader.length),
  );

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Set-Cookie", cookieHeader);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export function clearSession(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Set-Cookie", clearCookieHeader());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    secure?: boolean;
  } = {},
): Response {
  const parts: string[] = [`${name}=${value}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  const newHeaders = new Headers(response.headers);
  newHeaders.append("Set-Cookie", parts.join("; "));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export function deleteCookie(response: Response, name: string): Response {
  return setCookie(response, name, "", { maxAge: 0 });
}

// ---------------------------------------------------------------------------
// Neue Hilfsfunktionen für OIDC-Session-Abfrage
// ---------------------------------------------------------------------------

// TODO: Admin-Seite erforderlich
// Die Rollen-Keys ("verwaltung", "editor" etc.) und der Claim-Schlüssel sind
// derzeit fest verdrahtet. Zukünftig soll eine Admin-Seite das Mapping von
// Zitadel-Rollen auf Frontend-Berechtigungen konfigurierbar machen.
// Zitadel-Referenz: Projekt-ID 370485493374155365, Org-ID 359353128044296805
// Siehe: https://accounts.data-dna.eu/ui/login
export function extractRoles(claims: Record<string, unknown>): string[] {
  if (!claims || typeof claims !== "object") return [];
  const raw = claims["urn:zitadel:iam:org:project:roles"];
  if (!raw || typeof raw !== "object") return [];
  try {
    return Object.keys(raw as Record<string, unknown>);
  } catch {
    return [];
  }
}

export function getUserSession(locals: App.Locals): UserSession {
  // Kein gültiger Login – anonymen User ignorieren
  if (!locals.isAuthenticated || !locals.user || locals.user.isAnonymous) {
    return { isAuthenticated: false, roles: [] };
  }

  // extractRoles aufrufen, falls rohe idToken-Claims in locals liegen
  let roles: string[] = [];
  const maybeClaims = (locals as unknown as Record<string, unknown>)
    .idTokenClaims;
  if (maybeClaims && typeof maybeClaims === "object") {
    roles = extractRoles(maybeClaims as Record<string, unknown>);
  }

  // Fallback: von Middleware bereits geparste Rollen
  if (roles.length === 0 && Array.isArray(locals.user.roles)) {
    roles = locals.user.roles;
  }

  return {
    isAuthenticated: true,
    sub: locals.user.id,
    userName: locals.user.name,
    displayName:
      ((locals.user as Record<string, unknown>).displayName as string) ??
      locals.user.name,
    email: locals.user.email,
    roles,
    memberships: (locals.user as Record<string, unknown>).memberships as
      | Membership[]
      | undefined,
    preferences: (locals.user as Record<string, unknown>).preferences as
      | UserPreferences
      | undefined,
  };
}
