// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für p2d2Selector/js/fit.js (Extent der Kommune → Portal-Stufe, Menü-Padding)
//
// Verträge gegen ol/View#fit (nearest true/false, constrainResolution false),
// echte Portal-Tabelle aus portal-config-p2d2.json, echte map.extent aus
// p2d2-selection.json. Bezugsgröße wie in Report 027: 2560 × 1366 px,
// Hauptmenü 25 % ausgeklappt (Padding links 660 px). Kein Netzwerk.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { transformExtent } from "ol/proj.js";
import View from "ol/View.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import {
  DEFAULT_FIT_MODE,
  EDGE_PADDING,
  FIT_MODES,
  fitTarget,
  menuOffset,
  menuPadding,
  menuWidthPx,
  readFitMode,
  shiftCenter,
  stageAtLeast,
} from "../../supplement/masterportal/addons/p2d2Selector/js/fit.js";

const RES = resolve(__dirname, "../../supplement/masterportal/portal/resources");
const readJson = (name: string): any => JSON.parse(readFileSync(resolve(RES, name), "utf8"));
const RESOLUTIONS: number[] = readJson("portal-config-p2d2.json").portalConfig.map.mapView.options.map(
  (o: any) => o.resolution,
);
const SELECTION = readJson("p2d2-selection.json");
const SIZE = [2560, 1366];
const MENU = 640;
const PADDING = [EDGE_PADDING, EDGE_PADDING, EDGE_PADDING, EDGE_PADDING + MENU];
const VISIBLE = [SIZE[0] - MENU, SIZE[1]];

beforeAll(() => {
  for (const code of ["EPSG:25832", "EPSG:25833", "EPSG:32610", "EPSG:32650"]) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
});

const withExtent = () => SELECTION.kommunen.filter((k: any) => k.map.extent);
const utmExtent = (k: any) => transformExtent(k.map.extent, "EPSG:4326", k.map.projection, 8);
const view = (projection: string, constrainResolution = true) =>
  new View({ projection, center: [0, 0], resolutions: RESOLUTIONS, resolution: RESOLUTIONS[1], constrainResolution });

describe("readFitMode", () => {
  it("p2d2Fit=nearest|ceil|exact|tight, sonst Standard nearest", () => {
    expect(DEFAULT_FIT_MODE).toBe("nearest");
    expect(FIT_MODES).toEqual(["nearest", "ceil", "exact", "tight"]);
    for (const m of FIT_MODES) expect(readFitMode(`?p2d2Fit=${m}`)).toBe(m);
    expect(readFitMode("p2d2Fit=ceil&p2d2debug=1")).toBe("ceil");
    for (const s of ["", "?p2d2Fit=", "?p2d2Fit=CEIL", "?p2d2Fit=fit", "?x=1", undefined, null]) {
      expect(readFitMode(s as any)).toBe("nearest");
    }
  });
});

describe("menuWidthPx, menuOffset, menuPadding", () => {
  const getters = (over: Record<string, unknown> = {}) => ({
    isMobile: false,
    "Menu/mainExpanded": true,
    "Menu/secondaryExpanded": false,
    "Menu/currentMainMenuOffsetWidth": 0,
    "Menu/currentSecondaryMenuOffsetWidth": 0,
    "Menu/currentMenuWidth": (side: string) => (side === "mainMenu" ? "25%" : "25%"),
    ...over,
  });

  it("menuWidthPx: Prozent, px, Anteil, unlesbar", () => {
    expect(menuWidthPx("25%", 2560)).toBe(640);
    expect(menuWidthPx(" 30.5 % ", 1000)).toBe(305);
    expect(menuWidthPx("400px", 2560)).toBe(400);
    expect(menuWidthPx(0.25, 2000)).toBe(500);
    expect(menuWidthPx(480, 2000)).toBe(480);
    for (const v of ["auto", "", null, undefined, -1, "25"]) expect(menuWidthPx(v, 2560)).toBeNull();
  });

  it("Startfall: gemessene Breite noch 0 → konfigurierte Breite 25 % der Karte", () => {
    expect(menuOffset(getters(), "mainMenu", 2560)).toBe(640);
    expect(menuPadding(getters(), 2560)).toEqual([20, 20, 20, 660]);
  });

  it("gemessene Breite geht vor (nach Übergang oder Ziehen)", () => {
    expect(menuOffset(getters({ "Menu/currentMainMenuOffsetWidth": 512 }), "mainMenu", 2560)).toBe(512);
  });

  it("eingeklappt, mobil oder ohne Menü-Getter: 0", () => {
    expect(menuOffset(getters({ "Menu/mainExpanded": false }), "mainMenu", 2560)).toBe(0);
    expect(menuOffset(getters({ isMobile: true }), "mainMenu", 2560)).toBe(0);
    expect(menuPadding({}, 2560)).toEqual([20, 20, 20, 20]);
  });

  it("Zweitmenü rechts", () => {
    const g = getters({ "Menu/secondaryExpanded": true, "Menu/currentSecondaryMenuOffsetWidth": 300 });
    expect(menuPadding(g, 2560)).toEqual([20, 320, 20, 660]);
  });
});

describe("shiftCenter und stageAtLeast", () => {
  it("Menü links: View-Zentrum liegt um (l − r) / 2 · res links vom Ziel", () => {
    expect(shiftCenter([1000, 2000], [20, 20, 20, 660], 10)).toEqual([1000 - 3200, 2000]);
    expect(shiftCenter([0, 0], [100, 0, 0, 0], 2)).toEqual([0, 100]);
  });

  it("stageAtLeast: feinste Stufe mit Auflösung ≥ Wert, Randfälle", () => {
    expect(stageAtLeast(21.9, RESOLUTIONS)).toEqual({ stage: 2, resolution: RESOLUTIONS[2] });
    expect(stageAtLeast(RESOLUTIONS[3], RESOLUTIONS).stage).toBe(3);
    expect(stageAtLeast(RESOLUTIONS[3] * (1 + 1e-12), RESOLUTIONS).stage).toBe(3);
    expect(stageAtLeast(1e6, RESOLUTIONS).stage).toBe(0);
    expect(stageAtLeast(1e-6, RESOLUTIONS).stage).toBe(RESOLUTIONS.length - 1);
  });
});

describe("fitTarget: Verträge gegen ol/View#fit", () => {
  it("nearest = fit({nearest: true}), ceil = fit({nearest: false}), exact = fit ohne Einrasten; Zentrum gleich", () => {
    for (const k of withExtent()) {
      const ext = utmExtent(k);
      for (const [mode, constrain, nearest] of [
        ["nearest", true, true],
        ["ceil", true, false],
        ["exact", false, false],
      ] as const) {
        const v = view(k.map.projection, constrain);
        v.fit(ext, { size: SIZE, padding: PADDING, nearest });
        const t = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode });
        expect(t.resolution, `${k.slug} ${mode}`).toBeCloseTo(v.getResolution()!, 9);
        expect(t.center[0], `${k.slug} ${mode} x`).toBeCloseTo(v.getCenter()![0], 6);
        expect(t.center[1], `${k.slug} ${mode} y`).toBeCloseTo(v.getCenter()![1], 6);
        expect(RESOLUTIONS[t.stage]).toBe(mode === "exact" ? RESOLUTIONS[t.stage] : t.resolution);
      }
    }
  });

  it("Mitte der BBox liegt in der Mitte der sichtbaren Fläche (rechts vom Menü)", () => {
    for (const k of withExtent()) {
      const ext = utmExtent(k);
      for (const mode of FIT_MODES) {
        const t = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode });
        const px = ((ext[0] + ext[2]) / 2 - t.center[0]) / t.resolution + SIZE[0] / 2;
        const py = SIZE[1] / 2 - ((ext[1] + ext[3]) / 2 - t.center[1]) / t.resolution;
        expect(px, `${k.slug} ${mode}`).toBeCloseTo(660 + (SIZE[0] - 680) / 2, 6);
        expect(py, `${k.slug} ${mode}`).toBeCloseTo(SIZE[1] / 2, 6);
      }
    }
  });

  it("ceil und exact zeigen immer die ganze BBox; nearest höchstens eine Stufe feiner", () => {
    for (const k of withExtent()) {
      const ext = utmExtent(k);
      for (const mode of ["ceil", "exact"]) {
        const t = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode });
        expect(ext[2] - ext[0], `${k.slug} ${mode}`).toBeLessThanOrEqual(t.resolution * (SIZE[0] - 680) + 1e-6);
        expect(ext[3] - ext[1], `${k.slug} ${mode}`).toBeLessThanOrEqual(t.resolution * (SIZE[1] - 40) + 1e-6);
      }
      const n = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode: "nearest" });
      const c = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode: "ceil" });
      expect(n.stage - c.stage, k.slug).toBeGreaterThanOrEqual(0);
      expect(n.stage - c.stage, k.slug).toBeLessThanOrEqual(1);
    }
  });

  it("Sollwert Köln (Stufe 3, 15,875 m/px): nur tight erreicht ihn; Stufen der übrigen Modi", () => {
    const koeln = SELECTION.kommunen.find((k: any) => k.slug === "koeln");
    const stages = Object.fromEntries(
      FIT_MODES.map((mode) => [
        mode,
        fitTarget({ extent: utmExtent(koeln), size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode }).stage,
      ]),
    );
    expect(stages).toEqual({ nearest: 2, ceil: 2, exact: 2, tight: 3 });
    expect(RESOLUTIONS[3]).toBe(15.875);
  });

  it("tight schneidet Kronshagen nicht ab (ganze BBox sichtbar)", () => {
    const k = SELECTION.kommunen.find((x: any) => x.slug === "kronshagen");
    const ext = utmExtent(k);
    const t = fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode: "tight" });
    expect(ext[2] - ext[0]).toBeLessThanOrEqual(t.resolution * VISIBLE[0]);
    expect(ext[3] - ext[1]).toBeLessThanOrEqual(t.resolution * VISIBLE[1]);
    expect(t.stage).toBe(6);
  });

  it("fitResolution ist die genau passende Auflösung (unabhängig vom Modus)", () => {
    const ext = [0, 0, 18800, 13260];
    for (const mode of FIT_MODES) {
      expect(fitTarget({ extent: ext, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode }).fitResolution).toBe(10);
    }
  });

  it("exact bleibt innerhalb der Tabelle", () => {
    const huge = [0, 0, 1e9, 1e9];
    const tiny = [0, 0, 1, 1];
    expect(fitTarget({ extent: huge, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode: "exact" }).resolution).toBe(
      RESOLUTIONS[0],
    );
    expect(fitTarget({ extent: tiny, size: SIZE, padding: PADDING, resolutions: RESOLUTIONS, mode: "exact" }).resolution).toBe(
      RESOLUTIONS[RESOLUTIONS.length - 1],
    );
  });

  it("ungültige Eingaben werfen", () => {
    const ok = { extent: [0, 0, 10, 10], size: SIZE, padding: PADDING, resolutions: RESOLUTIONS };
    for (const bad of [
      { extent: [10, 0, 0, 10] },
      { extent: [0, 0, 10] },
      { size: [100] },
      { padding: [20, 20, 20, -1] },
      { padding: [800, 0, 800, 0] },
      { resolutions: [] },
      { mode: "fit" },
    ]) {
      expect(() => fitTarget({ ...ok, ...bad } as any), JSON.stringify(bad)).toThrow(TypeError);
    }
  });
});
