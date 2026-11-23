// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Unit-Tests — getOsmAdminLevel() aus @p2d2/core
//
// Eine Regel für Standalone, Generator und Masterportal-Add-on:
//   cemetery       -> CEMETERY_ADMIN_LEVEL
//   administrative -> zweiter Eintrag von osmAdminLevels, bei genau einem
//                     Eintrag dieser, sonst FALLBACK_ADMIN_LEVEL
//   sonst          -> FALLBACK_ADMIN_LEVEL
//
// Offline: importiert die Quelle über den Paket-Index, kein Netzwerk, keine DB.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getOsmAdminLevel,
  CEMETERY_ADMIN_LEVEL,
  FALLBACK_ADMIN_LEVEL,
} from "../../packages/core/src/index";

const read = (p: string): string => readFileSync(resolve(__dirname, p), "utf8");

describe("getOsmAdminLevel", () => {
  it("Konstanten", () => {
    expect(CEMETERY_ADMIN_LEVEL).toBe(8);
    expect(FALLBACK_ADMIN_LEVEL).toBe(8);
  });

  it.each([
    [[6, 9, 10], "cemetery", 8],
    [undefined, "cemetery", 8],
    [[6, 9, 10], "administrative", 9],
    [[4, 5, 6, 8], "administrative", 5],
    [[4, 9, 10], "administrative", 9],
    [[6, 10], "administrative", 10],
    [[6, 8, 10], "administrative", 8],
    [[6], "administrative", 6],
    [[8], "administrative", 8],
    [[], "administrative", 8],
    [undefined, "administrative", 8],
    [[6, 9, 10], "unbekannt", 8],
  ] as const)("%j / %s -> %i", (levels, containerType, expected) => {
    expect(getOsmAdminLevel(levels, containerType)).toBe(expected);
  });

  it("verändert das Eingabe-Array nicht", () => {
    const levels = Object.freeze([6, 9, 10]);
    expect(getOsmAdminLevel(levels, "administrative")).toBe(9);
    expect(levels).toEqual([6, 9, 10]);
  });
});

describe("eine Quelle für die Regel", () => {
  const manager = read("../utils/wfs-layer-manager.ts");
  const coreIndex = read("../../packages/core/src/index.ts");
  const corePackage = JSON.parse(read("../../packages/core/package.json"));

  it("@p2d2/core exportiert das Modul über den Index und als Unterpfad", () => {
    expect(coreIndex).toMatch(/export \* from "\.\/content\/osm-admin-level";/);
    expect(corePackage.exports["./content/osm-admin-level"]).toEqual({
      types: "./dist/content/osm-admin-level.d.ts",
      import: "./dist/content/osm-admin-level.js",
    });
  });

  it("wfs-layer-manager.ts importiert getOsmAdminLevel aus @p2d2/core", () => {
    expect(manager).toMatch(
      /import\s*\{[^}]*\bgetOsmAdminLevel\b[^}]*\}\s*from\s*"@p2d2\/core"/,
    );
  });

  it("wfs-layer-manager.ts wählt den Level nicht selbst aus", () => {
    expect(manager).not.toMatch(/levels\[\s*\d+\s*\]/);
    expect(manager).not.toMatch(/osmAdminLevels\s*\[\s*\d+\s*\]/);
    expect(manager).not.toMatch(/===\s*"cemetery"/);
  });
});
