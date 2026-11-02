// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Unit-Tests — parseMetadata() versteht Keycloak (nested, Klartext) und
// Zitadel (flach, Base64) und liefert für beide dasselbe ParsedMetadata.
//
// Offline: importiert die Parser-Quelle direkt, kein Netzwerk, keine DB,
// kein .env.test mit Secrets.
import { describe, it, expect } from "vitest";
import { parseMetadata } from "../../packages/core/src/preferences/metadata-parser";
import type {
  Membership,
  ParsedMetadata,
} from "../../packages/core/src/preferences/metadata-parser";

// Base64-Helfer: ein Wert -> JSON-Text -> Base64; ein String -> UTF-8 -> Base64.
const b64Json = (v: unknown): string =>
  Buffer.from(JSON.stringify(v), "utf8").toString("base64");
const b64Str = (s: string): string =>
  Buffer.from(s, "utf8").toString("base64");

const MEMBERSHIPS: Membership[] = [
  { type: "kommune", key: "koeln", role: "verwaltung", wp_name: "de-Köln" },
  { type: "community", key: "osm", role: "osm" },
];

describe("parseMetadata — Format-Parität (Zitadel vs. Keycloak)", () => {
  it("liefert für beide Formate exakt dasselbe ParsedMetadata", () => {
    const expected: ParsedMetadata = {
      memberships: MEMBERSHIPS,
      preferences: { homeRegionKey: "de-Bonn" },
    };

    // Zitadel (flach, Base64)
    const zitadel: Record<string, unknown> = {
      "p2d2.memberships": b64Json(MEMBERSHIPS),
      "p2d2.preferences.home_region_key": b64Str("de-Bonn"),
    };
    expect(parseMetadata(zitadel)).toEqual(expected);

    // Keycloak (nested, Klartext)
    const keycloak: Record<string, unknown> = {
      p2d2: {
        memberships: MEMBERSHIPS,
        preferences: { home_region_key: "de-Bonn" },
      },
    };
    expect(parseMetadata(keycloak)).toEqual(expected);
  });
});

describe("parseMetadata — Nested-Memberships (Keycloak)", () => {
  it("akzeptiert memberships als JSON-String statt Array", () => {
    const result = parseMetadata({
      p2d2: { memberships: JSON.stringify(MEMBERSHIPS), preferences: {} },
    });
    expect(result.memberships).toEqual(MEMBERSHIPS);
  });

  it("akzeptiert memberships als Base64-String (Rückfall)", () => {
    const result = parseMetadata({
      p2d2: { memberships: b64Json(MEMBERSHIPS), preferences: {} },
    });
    expect(result.memberships).toEqual(MEMBERSHIPS);
  });

  it("verwirft kaputte Einträge und behält den Rest", () => {
    const result = parseMetadata({
      p2d2: {
        memberships: [
          { type: "kommune", key: "koeln", role: "verwaltung" }, // gültig
          { type: "kommune" }, // key fehlt
          { key: "osm" }, // type fehlt
          "kein-objekt", // String
          42, // Zahl
          { type: 123, key: "x" }, // type keine Zeichenkette
          { type: "", key: "x" }, // type leer
          { type: "a", key: "" }, // key leer
        ],
        preferences: {},
      },
    });
    expect(result.memberships).toEqual([
      { type: "kommune", key: "koeln", role: "verwaltung" },
    ]);
  });

  it("normalisiert wp_name in den Legacy-Schreibweisen", () => {
    const result = parseMetadata({
      p2d2: {
        memberships: [
          { type: "kommune", key: "koeln", role: "verwaltung", wpName: "de-Köln" },
          { type: "kommune", key: "bonn", role: "verwaltung", wpname: "de-Bonn" },
          { type: "kommune", key: "x", role: "verwaltung", wp_Name: "de-X" },
        ],
        preferences: {},
      },
    });
    expect(result.memberships).toEqual([
      { type: "kommune", key: "koeln", role: "verwaltung", wp_name: "de-Köln" },
      { type: "kommune", key: "bonn", role: "verwaltung", wp_name: "de-Bonn" },
      { type: "kommune", key: "x", role: "verwaltung", wp_name: "de-X" },
    ]);
  });
});

describe("parseMetadata — Grenzen", () => {
  it("kappt 51 Mitgliedschaften auf 50", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      type: "kommune",
      key: `k${i}`,
      role: "verwaltung",
    }));
    const result = parseMetadata({ p2d2: { memberships: many } });
    expect(result.memberships).toHaveLength(50);
  });

  it("verwirft Preference-Werte über 200 Zeichen", () => {
    const result = parseMetadata({
      p2d2: { preferences: { home_region_key: "x".repeat(201) } },
    });
    expect(result.preferences.homeRegionKey).toBeUndefined();
  });

  it("verwirft einen JSON-String über 4096 Zeichen", () => {
    const huge = JSON.stringify([
      { type: "kommune", key: "x".repeat(5000), role: "verwaltung" },
    ]);
    expect(huge.length).toBeGreaterThan(4096);
    const result = parseMetadata({ p2d2: { memberships: huge } });
    expect(result.memberships).toEqual([]);
  });
});

describe("parseMetadata — beide Formate gleichzeitig", () => {
  it("nested hat feldweise Vorrang, fehlende Felder kommen aus legacy", () => {
    const legacyMemberships = [{ type: "community", key: "osm", role: "osm" }];
    const nestedMemberships = [
      { type: "kommune", key: "koeln", role: "verwaltung", wp_name: "de-Köln" },
    ];
    const result = parseMetadata({
      "p2d2.memberships": b64Json(legacyMemberships),
      "p2d2.preferences.home_region_key": b64Str("de-Bonn"),
      "p2d2.preferences.default_topic_key": b64Str("grabflur"),
      p2d2: {
        memberships: nestedMemberships,
        preferences: { home_region_key: "de-Koeln" },
      },
    });
    expect(result.memberships).toEqual(nestedMemberships);
    expect(result.preferences).toEqual({
      defaultTopicKey: "grabflur",
      homeRegionKey: "de-Koeln",
    });
  });

  it("leeres nested fällt auf legacy zurück", () => {
    const legacyMemberships = [{ type: "community", key: "osm", role: "osm" }];
    const result = parseMetadata({
      "p2d2.memberships": b64Json(legacyMemberships),
      "p2d2.preferences.home_region_key": b64Str("de-Bonn"),
      p2d2: { memberships: [], preferences: {} },
    });
    expect(result.memberships).toEqual(legacyMemberships);
    expect(result.preferences).toEqual({ homeRegionKey: "de-Bonn" });
  });
});

describe("parseMetadata — defensive Eingaben", () => {
  it("liefert sichere Defaults bei leer/undefined/Nicht-Objekt", () => {
    expect(parseMetadata(undefined)).toEqual({ memberships: [], preferences: {} });
    expect(parseMetadata({})).toEqual({ memberships: [], preferences: {} });
    expect(parseMetadata([] as unknown as Record<string, unknown>)).toEqual({
      memberships: [],
      preferences: {},
    });
    expect(parseMetadata("x" as unknown as Record<string, unknown>)).toEqual({
      memberships: [],
      preferences: {},
    });
  });

  it("p2d2 als Nicht-Objekt -> legacy unverändert", () => {
    const legacy = {
      "p2d2.memberships": b64Json(MEMBERSHIPS),
      "p2d2.preferences.home_region_key": b64Str("de-Bonn"),
    };
    expect(parseMetadata({ ...legacy, p2d2: "nicht-objekt" })).toEqual(
      parseMetadata(legacy),
    );
    expect(parseMetadata({ ...legacy, p2d2: [1, 2, 3] })).toEqual(
      parseMetadata(legacy),
    );
  });

  it("__proto__/constructor im Claim haben keine Wirkung", () => {
    const claims = JSON.parse(
      '{"p2d2":{"__proto__":{"evil":1},"constructor":{"evil":2},"memberships":[{"type":"kommune","key":"koeln","role":"verwaltung"}],"preferences":{"home_region_key":"de-Bonn"}}}',
    );
    const result = parseMetadata(claims);
    expect(result.memberships).toHaveLength(1);
    expect(result.preferences.homeRegionKey).toBe("de-Bonn");
    expect((result as unknown as { evil?: number }).evil).toBeUndefined();
    expect((Object.prototype as unknown as { evil?: number }).evil).toBeUndefined();
  });
});
