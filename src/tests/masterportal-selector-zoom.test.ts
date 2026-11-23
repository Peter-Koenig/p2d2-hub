// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für p2d2Selector/js/zoom.js (Web-Zoom → Portal-Stufe)
//
// Verträge: zoomToResolution gegen die OpenLayers-View des Standalone
// (minZoom 1, maxZoom 21, ohne Tabelle, UTM per proj4), snapToStage gegen
// snapResolution aus p2d2Crs und gegen den OL-Konstruktor, Tabelle D aus
// Report 017 gegen die Portal-Tabelle. Kein Netzwerk.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { transform } from "ol/proj.js";
import View from "ol/View.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import { snapResolution } from "../../supplement/masterportal/addons/p2d2Crs/js/viewSwap.js";
import { zoomToResolution, snapToStage, zoomTarget } from "../../supplement/masterportal/addons/p2d2Selector/js/zoom.js";

const RES = resolve(__dirname, "../../supplement/masterportal/portal/resources");
const readJson = (name: string): any => JSON.parse(readFileSync(resolve(RES, name), "utf8"));
const OPTIONS: { resolution: number; scale: number; zoomLevel: number }[] =
  readJson("portal-config-p2d2.json").portalConfig.map.mapView.options;
const RESOLUTIONS = OPTIONS.map((o) => o.resolution);
const SELECTION = readJson("p2d2-selection.json");
const UTM = ["EPSG:25832", "EPSG:25833", "EPSG:32610", "EPSG:32650", "EPSG:32651"];

beforeAll(() => {
  for (const code of UTM) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
});

describe("zoomToResolution", () => {
  it("Prüfwert Zoom 11: 76.35146091935201 (bitgenau)", () => {
    expect(zoomToResolution(11)).toBe(76.35146091935201);
  });

  it("Vertrag: new View({minZoom: 1, maxZoom: 21}).getResolutionForZoom in jeder UTM-Zone, Zoom 1–21", () => {
    for (const projection of UTM) {
      const view = new View({ projection, center: [500000, 0], minZoom: 1, maxZoom: 21 });
      for (let z = 1; z <= 21; z++) {
        expect(zoomToResolution(z), `${projection} z${z}`).toBe(view.getResolutionForZoom(z));
      }
    }
  });

  it("ungültiger Zoom wirft", () => {
    for (const z of [undefined, "11", Number.NaN, Infinity]) expect(() => zoomToResolution(z as any)).toThrow();
  });
});

describe("snapToStage", () => {
  it("Vertrag: gleiche Auflösung wie snapResolution (p2d2Crs), Index passt zur Stufe", () => {
    const probes = [
      1000, RESOLUTIONS[0], 80, 76.35, 79.375, 79.37499, 40, 38.17, 20, 19.08, 10, 9.54, 3, 1, 0.5, 0.2, 0.1, 0.05,
      0.0264, 0.01,
    ];
    for (let i = 0; i < RESOLUTIONS.length - 1; i++) probes.push((RESOLUTIONS[i] + RESOLUTIONS[i + 1]) / 2);
    for (const r of [...probes, ...RESOLUTIONS]) {
      const got = snapToStage(r, RESOLUTIONS);
      expect(got.resolution, String(r)).toBe(snapResolution(r, RESOLUTIONS));
      expect(RESOLUTIONS[got.stage]).toBe(got.resolution);
      expect(OPTIONS[got.stage].zoomLevel).toBe(got.stage);
    }
  });

  it("Gleichstand: feinere Stufe wie OpenLayers (constrainResolution)", () => {
    const mid = (RESOLUTIONS[1] + RESOLUTIONS[2]) / 2;
    const view = new View({ resolutions: RESOLUTIONS, constrainResolution: true, resolution: mid });
    expect(snapToStage(mid, RESOLUTIONS).resolution).toBe(view.getResolution());
    expect(snapToStage(mid, RESOLUTIONS).stage).toBe(2);
  });

  it("außerhalb der Tabelle die Randstufe, ungültige Eingaben werfen", () => {
    expect(snapToStage(1e6, RESOLUTIONS)).toEqual({ stage: 0, resolution: RESOLUTIONS[0] });
    expect(snapToStage(1e-6, RESOLUTIONS)).toEqual({ stage: 12, resolution: RESOLUTIONS[12] });
    expect(() => snapToStage(0, RESOLUTIONS)).toThrow();
    expect(() => snapToStage(1, [])).toThrow();
  });
});

describe("Tabelle D (Report 017): Kommune → Portal-Stufe", () => {
  // slug, Zoom, Auflösung (gerundet), Stufe, Maßstab der Stufe
  const TABLE_D: [string, number, string, number, number][] = [
    ["koeln", 11, "76.351461", 1, 200000],
    ["bonn", 12, "38.175730", 2, 100000],
    ["flensburg", 11, "76.351461", 1, 200000],
    ["dortmund", 11, "76.351461", 1, 200000],
    ["berlin", 10, "152.702922", 0, 400000],
    ["hamburg", 11, "76.351461", 1, 200000],
    ["hangzhou", 11, "76.351461", 1, 200000],
    ["kiel", 11, "76.351461", 1, 200000],
    ["san-francisco", 12, "38.175730", 2, 100000],
    ["bornheim", 13, "19.087865", 3, 60000],
    ["kronshagen", 14, "9.543933", 4, 40000],
  ];

  it("Reihenfolge und Zoom wie p2d2-selection.json (alle elf Kommunen)", () => {
    expect(SELECTION.kommunen.map((k: any) => [k.slug, k.map.zoom])).toEqual(TABLE_D.map(([s, z]) => [s, z]));
  });

  for (const [slug, zoom, res, stage, scale] of TABLE_D) {
    it(`${slug}: Zoom ${zoom} → ${res} m/px → Stufe ${stage} (1:${scale})`, () => {
      const k = SELECTION.kommunen.find((x: any) => x.slug === slug);
      const center = transform(k.map.center, "EPSG:4326", k.map.projection);
      const t = zoomTarget({ center, zoom: k.map.zoom, resolutions: RESOLUTIONS });
      expect(zoomToResolution(k.map.zoom).toFixed(6)).toBe(res);
      expect(t.stage).toBe(stage);
      expect(t.resolution).toBe(RESOLUTIONS[stage]);
      expect(OPTIONS[stage].scale).toBe(scale);
      expect(t.center).toEqual(center);
      // Dieselbe Stufe, die OL in einer View mit Portal-Tabelle einrastet.
      const view = new View({
        projection: k.map.projection,
        center,
        resolutions: RESOLUTIONS,
        constrainResolution: true,
        resolution: zoomToResolution(k.map.zoom),
      });
      expect(view.getResolution()).toBe(t.resolution);
    });
  }

  it("Prüfwerte der Browser-Gegenprobe (F1): Bonn und SF 38.175730459676004, Berlin 152.70292183870401", () => {
    expect(zoomToResolution(12)).toBe(38.175730459676004);
    expect(zoomToResolution(10)).toBe(152.70292183870401);
  });
});

describe("zoomTarget", () => {
  it("kopiert das Zentrum, prüft es", () => {
    const c = [1, 2];
    const t = zoomTarget({ center: c, zoom: 11, resolutions: RESOLUTIONS });
    expect(t).toEqual({ center: [1, 2], resolution: RESOLUTIONS[1], stage: 1 });
    expect(t.center).not.toBe(c);
    expect(() => zoomTarget({ center: [1], zoom: 11, resolutions: RESOLUTIONS })).toThrow(/center/);
    expect(() => zoomTarget({ center: [1, Number.NaN], zoom: 11, resolutions: RESOLUTIONS })).toThrow(/center/);
  });
});
