// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import { SESSION_SECRET } from "astro:env/server";

// Types
export interface SessionData {
  userId: string;
  userName: string;
  email: string;
  roles: string[];
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
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
function buildCookieHeader(value: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function clearCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
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
  const cookieValue = await encrypt(plaintext);
  const maxAge = Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000));
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Set-Cookie", buildCookieHeader(cookieValue, maxAge));
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
