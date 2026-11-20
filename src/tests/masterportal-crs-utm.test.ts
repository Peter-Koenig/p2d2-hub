// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für das Masterportal-Modul p2d2Crs/js/utm.js
//
// UTM-Codes erkennen, proj4-Definition je Zone bilden (Nord, Süd, ETRS89),
// Anzeigename und Registrierung mit injizierten Abhängigkeiten.
// Die Transformationen laufen mit dem proj4 und ol des p2d2-Repositorys.
// Kein Netzwerk, keine DB.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { transform } from "ol/proj.js";
import {
  isUtm,
  utmDefinition,
  crsLabel,
  createEnsureProjection,
} from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";

const tokens = (def: string | null): string[] =>
  (def ?? "").split(/\s+/).filter(Boolean).sort();

describe("isUtm", () => {
  it.each([
    "EPSG:25832",
    "EPSG:25833",
    "EPSG:25801",
    "EPSG:25860",
    "EPSG:32601",
    "EPSG:32637",
    "EPSG:32660",
    "EPSG:32701",
    "EPSG:32737",
    "EPSG:32760",
  ])("%s ist UTM", (code) => {
    expect(isUtm(code)).toBe(true);
  });

  it.each([
    "EPSG:32600",
    "EPSG:32661",
    "EPSG:32700",
    "EPSG:32761",
    "EPSG:25800",
    "EPSG:25861",
    "EPSG:3857",
    "EPSG:4326",
    "EPSG:258321",
    "epsg:25832",
    " EPSG:25832",
    "",
    undefined,
    null,
    25832,
  ])("%s ist nicht UTM", (code) => {
    expect(isUtm(code as any)).toBe(false);
  });
});

describe("utmDefinition", () => {
  it("EPSG:25832 entspricht der Definition in config.js.template (ohne +title)", () => {
    const template = readFileSync(
      resolve(__dirname, "../../supplement/masterportal/portal/config.js.template"),
      "utf8",
    );
    const fromTemplate = template.match(/\["EPSG:25832",\s*"([^"]+)"\]/)?.[1];
    expect(fromTemplate, "namedProjections-Eintrag").toBeDefined();
    expect(tokens(utmDefinition("EPSG:25832"))).toEqual(
      // +title kann Leerzeichen enthalten ("ETRS89/UTM 32N") und fällt weg.
      tokens(fromTemplate!.replace(/\+title=[^+]*/, "")),
    );
  });

  it("WGS 84 Nord (326xx)", () => {
    expect(tokens(utmDefinition("EPSG:32637"))).toEqual(
      tokens("+proj=utm +zone=37 +ellps=WGS84 +units=m +no_defs"),
    );
  });

  it("WGS 84 Süd (327xx) mit +south", () => {
    expect(tokens(utmDefinition("EPSG:32737"))).toEqual(
      tokens("+proj=utm +zone=37 +south +ellps=WGS84 +units=m +no_defs"),
    );
  });

  it("ETRS89 (258xx) mit GRS80", () => {
    expect(tokens(utmDefinition("EPSG:25833"))).toEqual(
      tokens("+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"),
    );
  });

  it("Zone ohne führende Null", () => {
    expect(utmDefinition("EPSG:32601")).toContain("+zone=1 ");
  });

  it.each(["EPSG:3857", "EPSG:4326", "EPSG:32661", "EPSG:25800", "", undefined])(
    "%s ergibt null",
    (code) => {
      expect(utmDefinition(code as any)).toBeNull();
    },
  );

  it("Definitionen transformieren richtig (Köln 32N, Nairobi 37S)", () => {
    for (const code of ["EPSG:25832", "EPSG:32737"]) {
      proj4.defs(`P2D2TEST:${code}`, utmDefinition(code)!);
    }
    register(proj4);
    // Köln: Nordhalbkugel, Rechtswert um 356 km, Hochwert um 5645 km.
    const [kx, ky] = transform([6.9603, 50.9375], "EPSG:4326", "P2D2TEST:EPSG:25832");
    expect(kx).toBeGreaterThan(350_000);
    expect(kx).toBeLessThan(362_000);
    expect(ky).toBeGreaterThan(5_640_000);
    expect(ky).toBeLessThan(5_650_000);
    // Nairobi: Südhalbkugel, Hochwert mit False Northing 10 000 km.
    const [nx, ny] = transform([36.817, -1.286], "EPSG:4326", "P2D2TEST:EPSG:32737");
    expect(nx).toBeGreaterThan(240_000);
    expect(nx).toBeLessThan(270_000);
    expect(ny).toBeGreaterThan(9_850_000);
    expect(ny).toBeLessThan(9_870_000);
  });
});

describe("crsLabel", () => {
  it.each([
    ["EPSG:25832", "UTM 32N (ETRS89)"],
    ["EPSG:32637", "UTM 37N (WGS 84)"],
    ["EPSG:32737", "UTM 37S (WGS 84)"],
    ["EPSG:3857", "Web-Mercator"],
    ["EPSG:4326", "EPSG:4326"],
  ])("%s → %s", (code, label) => {
    expect(crsLabel(code)).toBe(label);
  });
});

describe("createEnsureProjection", () => {
  const known = { code: "EPSG:3857" };

  const setup = (defined: string[], olKnown: string[]) => {
    const defs = new Set(defined);
    const ol = new Set(olKnown);
    const registerProjections = vi.fn((list: [string, string][]) => {
      for (const [code] of list) {
        defs.add(code);
        ol.add(code);
      }
    });
    const ensure = createEnsureProjection({
      hasDefinition: (code: string) => defs.has(code),
      getProjection: (code: string) => (ol.has(code) ? known : null),
      registerProjections,
    });
    return { ensure, registerProjections };
  };

  it("bekannte UTM-Zone wird nicht erneut registriert", () => {
    const { ensure, registerProjections } = setup(["EPSG:25832"], ["EPSG:25832"]);
    expect(ensure("EPSG:25832")).toBe(true);
    expect(registerProjections).not.toHaveBeenCalled();
  });

  it("neue UTM-Zone wird mit ihrer Definition registriert", () => {
    const { ensure, registerProjections } = setup([], []);
    expect(ensure("EPSG:32737")).toBe(true);
    expect(registerProjections).toHaveBeenCalledWith([
      ["EPSG:32737", utmDefinition("EPSG:32737")],
    ]);
  });

  it("UTM-Zone, die OL schon kennt, aber proj4 nicht, wird registriert", () => {
    // ol 10 bringt 326xx/327xx selbst mit; die Registrierung über
    // masterportalapi setzt zusätzlich GeoServer-Alias und Kennung masterportal.
    const { ensure, registerProjections } = setup([], ["EPSG:32637"]);
    expect(ensure("EPSG:32637")).toBe(true);
    expect(registerProjections).toHaveBeenCalledTimes(1);
  });

  it("Nicht-UTM: nur prüfen, nie registrieren", () => {
    const { ensure, registerProjections } = setup([], ["EPSG:3857"]);
    expect(ensure("EPSG:3857")).toBe(true);
    expect(ensure("EPSG:2056")).toBe(false);
    expect(registerProjections).not.toHaveBeenCalled();
  });

  it("Fehler bei der Registrierung ergibt false", () => {
    const ensure = createEnsureProjection({
      hasDefinition: () => false,
      getProjection: () => null,
      registerProjections: () => {
        throw new Error("kaputt");
      },
    });
    expect(ensure("EPSG:32737")).toBe(false);
  });
});
