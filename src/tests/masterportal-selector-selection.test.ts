// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für das Masterportal-Modul p2d2Selector/js/selection.js
//
// Offline, ohne Masterportal. Gültige Eingabe ist die echte p2d2-selection.json.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateSelection,
  toggleSelection,
  selectionSignature,
  findKommune,
  findKategorie,
} from "../../supplement/masterportal/addons/p2d2Selector/js/selection.js";

const FILE = resolve(__dirname, "../../supplement/masterportal/portal/resources/p2d2-selection.json");
const real = (): any => JSON.parse(readFileSync(FILE, "utf8"));

describe("validateSelection", () => {
  it("echte p2d2-selection.json ist gültig", () => {
    expect(validateSelection(real())).toEqual({ ok: true, errors: [] });
  });

  it("unbekannte Zusatzfelder werden ignoriert", () => {
    const s = real();
    s.extra = 1;
    s.kommunen[0].extra = { a: 1 };
    s.kategorien[0].extra = [1];
    expect(validateSelection(s).ok).toBe(true);
  });

  // Je Regel ein Fehlerfall: [Name, Änderung, erwartete Meldung]
  const cases: [string, (s: any) => void, RegExp][] = [
    ["Wurzel kein Objekt", () => {}, /Objekt/],
    ["Version", (s) => (s.version = 2), /version/],
    ["kommunen leer", (s) => (s.kommunen = []), /kommunen/],
    ["kommunen kein Array", (s) => (s.kommunen = {}), /kommunen/],
    ["kategorien leer", (s) => (s.kategorien = []), /kategorien/],
    ["Kommune-Slug doppelt", (s) => (s.kommunen[1].slug = s.kommunen[0].slug), /kommunen\[1\]\.slug.*mehrfach/],
    ["Kategorie-Slug doppelt", (s) => (s.kategorien[1].slug = s.kategorien[0].slug), /kategorien\[1\]\.slug.*mehrfach/],
    ["Slug kein String", (s) => (s.kommunen[0].slug = 5), /kommunen\[0\]\.slug/],
    ["title kein String", (s) => (s.kategorien[0].title = null), /kategorien\[0\]\.title/],
    ["wpName fehlt", (s) => delete s.kommunen[0].wpName, /kommunen\[0\]\.wpName/],
    ["center keine Zahlen", (s) => (s.kommunen[0].map.center = ["6.9", 50.9]), /map\.center/],
    ["center Länge", (s) => (s.kommunen[0].map.center = [6.9]), /map\.center/],
    ["zoom keine Zahl", (s) => (s.kommunen[0].map.zoom = "11"), /map\.zoom/],
    ["projection Format", (s) => (s.kommunen[0].map.projection = "UTM32"), /map\.projection/],
    ["map fehlt", (s) => delete s.kommunen[0].map, /map/],
    ["osmAdminLevel fehlt", (s) => delete s.kommunen[0].osmAdminLevel, /osmAdminLevel/],
    [
      "osmAdminLevel ohne Typ",
      (s) => delete s.kommunen[0].osmAdminLevel[s.kategorien[0].containerType],
      /osmAdminLevel\./,
    ],
    ["osmAdminLevel kein Integer", (s) => (s.kommunen[0].osmAdminLevel.administrative = 9.5), /osmAdminLevel\.administrative/],
    ["containerType fehlt", (s) => delete s.kategorien[0].containerType, /containerType/],
    // map.extent (optional, [minLon, minLat, maxLon, maxLat] in EPSG:4326)
    ["extent Länge", (s) => (s.kommunen[0].map.extent = [6, 50, 7]), /kommunen\[0\]\.map\.extent.*vier Zahlen/],
    ["extent keine Zahlen", (s) => (s.kommunen[0].map.extent = [6, 50, "7", 51]), /map\.extent.*vier Zahlen/],
    ["extent minLon ≥ maxLon", (s) => (s.kommunen[0].map.extent = [7.2, 50.8, 6.7, 51.1]), /map\.extent.*minLon/],
    ["extent minLat ≥ maxLat", (s) => (s.kommunen[0].map.extent = [6.7, 51.1, 7.2, 51.1]), /map\.extent.*minLat/],
    ["extent Länge außerhalb", (s) => (s.kommunen[0].map.extent = [-181, 50, 7, 51]), /map\.extent.*Wertebereich/],
    ["extent Breite außerhalb", (s) => (s.kommunen[0].map.extent = [6, 50, 7, 91]), /map\.extent.*Wertebereich/],
    ["center außerhalb extent", (s) => (s.kommunen[0].map.extent = [7.5, 50, 8, 51]), /map\.center.*außerhalb.*map\.extent/],
    // image (optional, null oder relativer Pfad unter resources/img/)
    ["image absolut", (s) => (s.kommunen[0].image = "/images/kommunen/koeln_001.jpg"), /kommunen\[0\]\.image/],
    ["image mit Host", (s) => (s.kategorien[0].image = "https://example.org/a.jpg"), /kategorien\[0\]\.image/],
    ["image mit ..", (s) => (s.kategorien[0].image = "resources/img/../x.jpg"), /kategorien\[0\]\.image/],
    ["image keine Zeichenkette", (s) => (s.kommunen[0].image = 5), /kommunen\[0\]\.image/],
  ];

  it("map.extent ist optional; gültiger Extent mit center innen ist ok", () => {
    const s = real();
    for (const k of s.kommunen) delete k.map.extent;
    expect(validateSelection(s).ok).toBe(true);
    const [lon, lat] = s.kommunen[0].map.center;
    s.kommunen[0].map.extent = [lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1];
    expect(validateSelection(s)).toEqual({ ok: true, errors: [] });
  });

  it("center auf dem Rand des Extents ist ok", () => {
    const s = real();
    const [lon, lat] = s.kommunen[0].map.center;
    s.kommunen[0].map.extent = [lon, lat, lon + 0.1, lat + 0.1];
    expect(validateSelection(s).ok).toBe(true);
  });

  it("image null oder fehlend ist ok", () => {
    const s = real();
    s.kommunen[0].image = null;
    delete s.kategorien[0].image;
    expect(validateSelection(s).ok).toBe(true);
  });

  for (const [name, mutate, expected] of cases) {
    it(`Fehlerfall: ${name}`, () => {
      const s = name === "Wurzel kein Objekt" ? null : real();
      if (s) mutate(s);
      const r = validateSelection(s);
      expect(r.ok).toBe(false);
      expect(r.errors.join("\n")).toMatch(expected);
    });
  }

  it("wirft nie, auch bei unsinniger Eingabe", () => {
    for (const v of [undefined, null, 1, "x", [], { kommunen: [null], kategorien: [1] }]) {
      expect(() => validateSelection(v)).not.toThrow();
      expect(validateSelection(v).ok).toBe(false);
    }
  });
});

describe("toggleSelection", () => {
  const sel = real();
  const k0 = sel.kommunen[0].slug;
  const k1 = sel.kommunen[1].slug;
  const c0 = sel.kategorien[0].slug;
  const none = { kommuneSlug: null, kategorieSlug: null };

  it("setzt, wechselt und hebt auf", () => {
    const a = toggleSelection(none, { kommuneSlug: k0 }, sel);
    expect(a).toEqual({ kommuneSlug: k0, kategorieSlug: null });
    const b = toggleSelection(a, { kommuneSlug: k1 }, sel);
    expect(b.kommuneSlug).toBe(k1);
    expect(toggleSelection(b, { kommuneSlug: k1 }, sel)).toEqual(none);
  });

  it("Kategorie unabhängig von Kommune", () => {
    const a = toggleSelection({ kommuneSlug: k0, kategorieSlug: null }, { kategorieSlug: c0 }, sel);
    expect(a).toEqual({ kommuneSlug: k0, kategorieSlug: c0 });
    expect(toggleSelection(a, { kategorieSlug: c0 }, sel)).toEqual({ kommuneSlug: k0, kategorieSlug: null });
  });

  it("unbekannter Slug lässt den Zustand unverändert", () => {
    const state = { kommuneSlug: k0, kategorieSlug: c0 };
    expect(toggleSelection(state, { kommuneSlug: "gibt-es-nicht" }, sel)).toEqual(state);
    expect(toggleSelection(state, { kategorieSlug: k0 }, sel)).toEqual(state); // Kommune-Slug ist keine Kategorie
  });

  it("nicht übergebene Dimension bleibt unberührt, Eingabe bleibt unverändert", () => {
    const state = Object.freeze({ kommuneSlug: k0, kategorieSlug: c0 });
    expect(toggleSelection(state, {}, sel)).toEqual(state);
    expect(toggleSelection(state, { kommuneSlug: k1 }, sel).kategorieSlug).toBe(c0);
    expect(toggleSelection(state, {}, sel)).not.toBe(state);
  });
});

describe("selectionSignature", () => {
  it("Format und leere Auswahl", () => {
    expect(selectionSignature({ kommuneSlug: "koeln", kategorieSlug: "baume" })).toBe("koeln|baume");
    expect(selectionSignature({ kommuneSlug: "koeln", kategorieSlug: null })).toBe("koeln|");
    expect(selectionSignature({ kommuneSlug: null, kategorieSlug: "baume" })).toBe("|baume");
    expect(selectionSignature({ kommuneSlug: null, kategorieSlug: null })).toBe("");
  });
});

describe("findKommune / findKategorie", () => {
  const sel = real();

  it("finden Einträge, sonst null", () => {
    expect(findKommune(sel, sel.kommunen[2].slug)).toBe(sel.kommunen[2]);
    expect(findKategorie(sel, sel.kategorien[2].slug)).toBe(sel.kategorien[2]);
    expect(findKommune(sel, "nein")).toBeNull();
    expect(findKategorie(sel, sel.kommunen[0].slug)).toBeNull();
    expect(findKommune(null, "x")).toBeNull();
  });

  it("Reihenfolge der Daten bleibt erhalten (kein Sortieren)", () => {
    const s = real();
    const before = JSON.stringify(s);
    validateSelection(s);
    toggleSelection({ kommuneSlug: null, kategorieSlug: null }, { kommuneSlug: s.kommunen[3].slug }, s);
    findKommune(s, s.kommunen[1].slug);
    expect(JSON.stringify(s)).toBe(before);
  });
});
