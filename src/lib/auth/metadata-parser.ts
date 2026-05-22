// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2

/**
 * Defensiver Parser für Zitadel-User-Metadaten.
 *
 * Bekannte Keys (nur "p2d2."-Namespace des Zitadel-Metadaten-Claims):
 *   - p2d2.memberships
 *   - p2d2.preferences.default_topic_key
 *   - p2d2.preferences.home_kommune_slug
 *   - p2d2.preferences.home_region_key
 *
 * Unbekannte Keys werden ignoriert.
 * Fehlerhafte oder manipulierte Werte führen zu sicheren Defaults,
 * niemals zu Login-Abbrüchen.
 *
 * Architektur:
 *   - parseMetadata()          – öffentlicher Einstiegspunkt
 *   - parseMemberships()       – Array-Normalisierung
 *   - parsePreferences()       – einzelne Preference-Werte
 *   - validate*()              – Hooks für später (Content-Collection-Validierung)
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Membership {
  type: string;
  key: string;
  wpName?: string;
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

// ---------------------------------------------------------------------------
// Membership-Parser
// ---------------------------------------------------------------------------

/**
 * Parst und normalisiert das Roh-Array aus p2d2.memberships.
 *
 * Erwartet: Base64-kodiertes JSON-Array von Objekten.
 * Liefert: Sauberes Membership[] (leer bei Fehlern).
 */
function parseMemberships(raw: unknown): Membership[] {
  // Muss ein String sein (Base64)
  if (typeof raw !== "string") return [];

  const decoded = safeBase64Decode(raw);
  if (!decoded) return [];

  const parsed = safeJsonParse(decoded);
  if (!Array.isArray(parsed)) return [];

  const result: Membership[] = [];

  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;

    const obj = item as Record<string, unknown>;

    // Nur bekannte Felder extrahieren – unbekannte Felder ignorieren
    const type = safeString(obj["type"]);
    const key = safeString(obj["key"]);
    const role = safeString(obj["role"]);
    const wpName = safeString(obj["wp_name"]);

    // Minimalstruktur: type + key müssen vorhanden sein
    if (!type || !key) continue;

    const membership: Membership = { type, key, role: role ?? "" };
    if (wpName) membership.wpName = wpName;

    result.push(membership);

    // Sicherheitsgrenze – verhindert übermäßig große Cookies
    if (result.length >= MAX_MEMBERSHIPS) break;
  }

  return result;
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

// ---------------------------------------------------------------------------
// Öffentlicher Einstiegspunkt
// ---------------------------------------------------------------------------

/**
 * Nimmt den "urn:zitadel:iam:user:metadata"-Claim aus dem ID-Token
 * entgegen und liefert ein validiertes, abgesichertes ParsedMetadata-Objekt.
 *
 * @param claimsMetadata – Der Roh-Claim (kann undefined, null oder Objekt sein)
 * @returns Bereinigte Metadaten – niemals undefined oder null
 */
export function parseMetadata(
  claimsMetadata: Record<string, unknown> | undefined,
): ParsedMetadata {
  const fallback: ParsedMetadata = { memberships: [], preferences: {} };

  if (!claimsMetadata || typeof claimsMetadata !== "object") {
    return fallback;
  }

  try {
    const memberships = parseMemberships(claimsMetadata["p2d2.memberships"]);
    const preferences = parsePreferences(claimsMetadata);
    return { memberships, preferences };
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
