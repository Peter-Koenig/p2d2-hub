// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Defensiver Parser für OIDC-User-Metadaten (Memberships, Preferences)

/**
 * Defensiver Parser für OIDC-User-Metadaten (Memberships, Preferences).
 *
 * Unterstützt zwei Formate desselben Metadaten-Claims:
 *   - Keycloak (nested, Klartext):
 *       user_metadata.p2d2 = {
 *         memberships:  [ { type, key, role, wp_name }, ... ],
 *         preferences:  { default_topic_key, home_kommune_slug, home_region_key }
 *       }
 *   - Zitadel (flach/legacy, Base64):
 *       Schlüssel "p2d2.memberships" und "p2d2.preferences.*"
 *
 * parseMetadata() erkennt das nested-Format anhand von "p2d2" als Objekt und
 * fällt feldweise auf das Legacy-Format zurück, wenn nested keinen Wert liefert.
 * Unbekannte Keys werden ignoriert. Fehlerhafte oder manipulierte Werte führen zu
 * sicheren Defaults, niemals zu Login-Abbrüchen.
 *
 * Architektur:
 *   - parseMetadata()           – öffentlicher Einstiegspunkt (nested + legacy)
 *   - parseMemberships()        – Legacy (Base64-String -> Array)
 *   - parseMembershipsNested()  – Keycloak (Array oder String/JSON/Base64)
 *   - normalizeMembershipArray()– gemeinsame Normalisierung (keine Duplikation)
 *   - parsePreferences()        – Legacy (flache Keys, Base64)
 *   - parsePreferencesNested()  – Keycloak (Klartext-Strings)
 *   - mergePreferences()        – feldweiser Vorrang nested vor legacy
 *   - validate*()               – Hooks für später (Content-Collection-Validierung)
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Membership {
  type: string;
  key: string;
  wp_name?: string;
  role: string;
}

export interface UserPreferences {
  defaultTopicKey?: string;
  homeKommuneSlug?: string;
  homeRegionKey?: string;
}

export interface ParsedMetadata {
  memberships: Membership[];
  preferences: UserPreferences;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/** Maximale Anzahl von Memberships – verhindert Array-Bomben. */
const MAX_MEMBERSHIPS = 50;

/** Maximale Länge eines dekodierten String-Wertes. */
const MAX_STRING_LENGTH = 200;

/** Maximale Länge eines Base64-Rohwertes (vor Dekodierung). */
const MAX_RAW_BASE64_LENGTH = 4096;

/** Erwartete Feldnamen in einem Membership-Objekt. */
const KNOWN_MEMBERSHIP_FIELDS = ["type", "key", "wp_name", "role"] as const;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Dekodiert einen Base64(Url)-String fehlertolerant.
 * Gibt null bei ungültigen Eingaben oder Übergröße zurück.
 *
 * Wandelt den atob()-Output (Latin-1) bytegenau in ein Uint8Array um
 * und dekodiert es anschließend als UTF-8. Dadurch werden Umlaute
 * und andere UTF-8-Mehrbyte-Zeichen korrekt dargestellt.
 */
function safeBase64Decode(encoded: string): string | null {
  try {
    if (encoded.length > MAX_RAW_BASE64_LENGTH) return null;

    // Base64url → Base64
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

    // atob() liefert einen Latin-1-String (jedes Zeichen = 1 Byte)
    const binaryString = atob(base64);

    // Null-Bytes als Abbruchkriterium – Prüfung auf Roh-Byte-Ebene
    if (binaryString.includes("\0")) return null;

    // Bytegenau in Uint8Array umwandeln und als UTF-8 dekodieren
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Parst einen JSON-String fehlertolerant.
 * Gibt null bei Syntaxfehlern zurück (keine Exception).
 */
function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Normalisiert einen unbekannten Wert zu einem getrimmten String.
 * - Nur Strings werden akzeptiert
 * - Leere oder reine Whitespace-Strings → null
 * - Überschreitet maxLength → null
 * - Gibt null bei zu langen oder leeren Werten zurück
 */
function safeString(
  input: unknown,
  maxLength: number = MAX_STRING_LENGTH,
): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Prüft auf ein "einfaches" Objekt (kein Array, kein null, kein Klassen-Objekt).
 * Sicherheitsrelevant: verhindert, dass z. B. ein Array fälschlich als
 * nested-Format interpretiert wird.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Membership-Parser
// ---------------------------------------------------------------------------

/**
 * Normalisiert ein bereits als Array vorliegendes Roh-Array von Membership-Objekten.
 * Gemeinsame Basis für das Legacy- und das Nested-Format (keine Duplikation).
 *
 * Liefert: Sauberes Membership[] (leer bei Fehlern).
 */
function normalizeMembershipArray(items: unknown[]): Membership[] {
  const result: Membership[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const obj = item as Record<string, unknown>;

    // Nur bekannte Felder extrahieren – unbekannte Felder ignorieren
    const type = safeString(obj["type"]);
    const key = safeString(obj["key"]);
    const role = safeString(obj["role"]);

    // wp_name normalisieren: akzeptiere Legacy-Schreibweisen,
    // priorisiere aber die kanonische Form wp_name
    const wpName =
      safeString(obj["wp_name"]) ??
      safeString(obj["wpName"]) ??
      safeString(obj["wpname"]) ??
      safeString(obj["wp_Name"]);

    // Minimalstruktur: type + key müssen vorhanden sein
    if (!type || !key) continue;

    const membership: Membership = { type, key, role: role ?? "" };
    if (wpName) membership.wp_name = wpName;

    result.push(membership);

    // Sicherheitsgrenze – verhindert übermäßig große Cookies
    if (result.length >= MAX_MEMBERSHIPS) break;
  }

  return result;
}

/**
 * Parst das Legacy-Mitgliedschafts-Format (Zitadel).
 *
 * Erwartet: Base64-kodiertes JSON-Array von Objekten unter "p2d2.memberships".
 * Liefert: Sauberes Membership[] (leer bei Fehlern).
 */
function parseMemberships(raw: unknown): Membership[] {
  // Muss ein String sein (Base64)
  if (typeof raw !== "string") return [];

  const decoded = safeBase64Decode(raw);
  if (!decoded) return [];

  const parsed = safeJsonParse(decoded);
  if (!Array.isArray(parsed)) return [];

  return normalizeMembershipArray(parsed);
}

/**
 * Parst das verschachtelte Mitgliedschafts-Format (Keycloak).
 *
 * Akzeptiert:
 *   - ein Array von Objekten (Normalfall), oder
 *   - einen String, der JSON-Text eines solchen Arrays ist, oder
 *   - einen String, der Base64(UTF-8(JSON)) eines solchen Arrays ist (Rückfall).
 * Liefert: Sauberes Membership[] (leer bei Fehlern).
 */
function parseMembershipsNested(raw: unknown): Membership[] {
  if (Array.isArray(raw)) return normalizeMembershipArray(raw);
  if (typeof raw !== "string") return [];
  if (raw.length > MAX_RAW_BASE64_LENGTH) return [];

  // 1) JSON-Text direkt (Keycloak kann den Wert als String liefern).
  const direct = safeJsonParse(raw);
  if (Array.isArray(direct)) return normalizeMembershipArray(direct);

  // 2) Base64 -> UTF-8 -> JSON (Rückfall, analog Legacy-Pfad).
  const decoded = safeBase64Decode(raw);
  if (!decoded) return [];

  const fromBase64 = safeJsonParse(decoded);
  return Array.isArray(fromBase64) ? normalizeMembershipArray(fromBase64) : [];
}

// ---------------------------------------------------------------------------
// Preference-Parser
// ---------------------------------------------------------------------------

/**
 * Dekodiert einen einzelnen Base64-kodierten Preference-Wert.
 * Gibt undefined bei Fehlern oder leeren Werten zurück.
 */
function parsePreferenceValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const decoded = safeBase64Decode(raw);
  if (!decoded) return undefined;

  const trimmed = decoded.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_STRING_LENGTH) return undefined;

  return trimmed;
}

/**
 * Parst das Preferences-Teilobjekt aus dem Metadata-Claim.
 *
 * Das Rohformat ist ein flaches Objekt mit Keys wie
 * "p2d2.preferences.default_topic_key" und Base64-kodierten Werten.
 */
function parsePreferences(raw: unknown): UserPreferences {
  if (typeof raw !== "object" || raw === null) return {};

  const obj = raw as Record<string, unknown>;

  return {
    defaultTopicKey: parsePreferenceValue(
      obj["p2d2.preferences.default_topic_key"],
    ),
    homeKommuneSlug: parsePreferenceValue(
      obj["p2d2.preferences.home_kommune_slug"],
    ),
    homeRegionKey: parsePreferenceValue(
      obj["p2d2.preferences.home_region_key"],
    ),
  };
}

/**
 * Parst das verschachtelte Preferences-Objekt (Keycloak, Klartext).
 *
 * Schlüssel: default_topic_key, home_kommune_slug, home_region_key.
 * Werte sind Klartext-Strings (KEIN Base64-Decode). Nicht-Strings, leere und
 * zu lange Werte werden zu undefined.
 */
function parsePreferencesNested(raw: unknown): UserPreferences {
  if (!isPlainObject(raw)) return {};

  return {
    defaultTopicKey: safeString(raw["default_topic_key"]) ?? undefined,
    homeKommuneSlug: safeString(raw["home_kommune_slug"]) ?? undefined,
    homeRegionKey: safeString(raw["home_region_key"]) ?? undefined,
  };
}

/**
 * Führt nested- und legacy-Preferences feldweise zusammen.
 * nested hat Vorrang, wenn es einen definierten (nicht-leeren) Wert liefert,
 * sonst gilt der legacy-Wert. Bewusst ohne Spread/Assign aus dem Claim
 * (Sicherheit: __proto__/constructor haben keine Wirkung).
 */
function mergePreferences(
  nested: UserPreferences,
  legacy: UserPreferences,
): UserPreferences {
  return {
    defaultTopicKey: nested.defaultTopicKey ?? legacy.defaultTopicKey,
    homeKommuneSlug: nested.homeKommuneSlug ?? legacy.homeKommuneSlug,
    homeRegionKey: nested.homeRegionKey ?? legacy.homeRegionKey,
  };
}

// ---------------------------------------------------------------------------
// Öffentlicher Einstiegspunkt
// ---------------------------------------------------------------------------

/**
 * Nimmt den User-Metadaten-Claim aus dem ID-Token entgegen und liefert ein
 * validiertes, abgesichertes ParsedMetadata-Objekt.
 *
 * Keycloak: Claim "user_metadata" mit verschachteltem "p2d2"-Objekt (Klartext).
 * Zitadel:  Claim "urn:zitadel:iam:user:metadata" mit flachen "p2d2.*"-Keys (Base64).
 *
 * @param claimsMetadata – Der Roh-Claim (kann undefined, null oder Objekt sein)
 * @returns Bereinigte Metadaten – niemals undefined oder null
 */
export function parseMetadata(
  claimsMetadata: Record<string, unknown> | undefined,
): ParsedMetadata {
  const fallback: ParsedMetadata = { memberships: [], preferences: {} };

  if (!isPlainObject(claimsMetadata)) {
    return fallback;
  }

  try {
    const legacyMemberships = parseMemberships(claimsMetadata["p2d2.memberships"]);
    const legacyPreferences = parsePreferences(claimsMetadata);

    const nested = claimsMetadata["p2d2"];
    if (!isPlainObject(nested)) {
      return { memberships: legacyMemberships, preferences: legacyPreferences };
    }

    const nestedMemberships = parseMembershipsNested(nested["memberships"]);
    const nestedPreferences = parsePreferencesNested(nested["preferences"]);

    return {
      memberships:
        nestedMemberships.length > 0 ? nestedMemberships : legacyMemberships,
      preferences: mergePreferences(nestedPreferences, legacyPreferences),
    };
  } catch {
    // Äußerster Sicherheitsnetz – sollte nie ausgelöst werden,
    // da alle Helfer fehlertolerant sind.
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Validierungs-Hooks (vorbereitend für Content-Collection-Abgleich)
//
// Diese Funktionen sind noch Platzhalter und geben immer true zurück.
// Im nächsten Schritt werden sie gegen die Astro-Content-Collections
// validieren (topic_keys, kommune_slugs, region_keys).
// ---------------------------------------------------------------------------

/**
 * Validiert einen Topic-Key gegen die Content-Collection.
 * Noch nicht implementiert – aktuell immer true.
 *
 * Anschlusspunkt für: src/content/topics
 */
export function validateTopicKey(_key: string): boolean {
  // TODO: Validierung gegen Astro-Content-Collection
  return true;
}

/**
 * Validiert einen Gemeinde-Slug gegen die Content-Collection.
 * Noch nicht implementiert – aktuell immer true.
 *
 * Anschlusspunkt für: src/content/kommunen
 */
export function validateKommuneSlug(_slug: string): boolean {
  // TODO: Validierung gegen Astro-Content-Collection
  return true;
}

/**
 * Validiert einen Regions-Key gegen die Content-Collection.
 * Noch nicht implementiert – aktuell immer true.
 *
 * Anschlusspunkt für: src/content/regionen
 */
export function validateRegionKey(_key: string): boolean {
  // TODO: Validierung gegen Astro-Content-Collection
  return true;
}
