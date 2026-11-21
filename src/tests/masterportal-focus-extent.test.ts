// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Extent der Portal-View beim Start und bei der Kommunenwahl
// (p2d2Crs und p2d2Selector)
//
// Die Start-View wird wie in masterportalapi 2.64.0 createMapView gebaut
// (src/maps/mapView.js:38-55): Konfiguration über die Standardwerte gelegt
// (src/defaults.js:11). portal-config-p2d2.json setzt einen Deutschland-
// Extent; ohne ihn gälte der Standard-Extent (Raum Hamburg).
// constrainOnlyCenter klemmt nur das Zentrum.
//   Start-View: frisch geladenes Portal, View mit Deutschland-Extent
//   nach swapView: View ohne Extent (Kommunenwahl und toggle)
// Echte ol/View, echter swapView, echte Aktionen beider Add-ons. Karte und
// Store sind Fakes, fetch antwortet nicht (hier zählt nur die View).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { get as getProjection, transform } from "ol/proj.js";
import View from "ol/View.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import { swapView } from "../../supplement/masterportal/addons/p2d2Crs/js/viewSwap.js";
import { createActions as createCrsActions } from "../../supplement/masterportal/addons/p2d2Crs/store/actionsP2d2Crs.js";
import crsMutations from "../../supplement/masterportal/addons/p2d2Crs/store/mutationsP2d2Crs.js";
import crsBaseState from "../../supplement/masterportal/addons/p2d2Crs/store/stateP2d2Crs.js";
import { createActions } from "../../supplement/masterportal/addons/p2d2Selector/store/actionsP2d2Selector.js";
import mutations from "../../supplement/masterportal/addons/p2d2Selector/store/mutationsP2d2Selector.js";
import baseState from "../../supplement/masterportal/addons/p2d2Selector/store/stateP2d2Selector.js";
import { zoomTarget } from "../../supplement/masterportal/addons/p2d2Selector/js/zoom.js";

const RES = resolve(__dirname, "../../supplement/masterportal/portal/resources");
const readJson = (name: string): any => JSON.parse(readFileSync(resolve(RES, name), "utf8"));
const MAP_VIEW = readJson("portal-config-p2d2.json").portalConfig.map.mapView;
const SELECTION = readJson("p2d2-selection.json");
const LAYER_ID = "p2d2-geo-containers";
const STAGE = (({ wfsBase, typeName, proxyPath }) => ({ wfsBase, typeName, proxyPath }))(
  readJson("p2d2-editor-config.json").layers[LAYER_ID],
);

// masterportalapi 2.64.0 src/defaults.js:11
const MASTERPORTALAPI_DEFAULT_EXTENT = [510000.0, 5850000.0, 625000.4, 6000000.0];

// Zone 51 kommt in der Auswahl-Datei nicht vor; Testkommune östlich von Shanghai.
const ZONE51 = {
  slug: "zone-51",
  title: "Zone 51",
  wpName: "test-zone-51",
  osmAdminLevel: {},
  map: { projection: "EPSG:32651", center: [123.5, 31.0], zoom: 11 },
};
const KOMMUNEN = [...SELECTION.kommunen, ZONE51];
const kommune = (slug: string) => KOMMUNEN.find((k: any) => k.slug === slug);
const ZONES = ["EPSG:25832", "EPSG:25833", "EPSG:32610", "EPSG:32650", "EPSG:32651"];

// Deutschland, Extrempunkte WGS84 (Isenbruch, Deschka, Haldenwanger Eck, List/Sylt)
const GERMANY_WGS84 = [5.8663, 47.2701, 15.0419, 55.0581];
const GERMAN_ZONES = ["EPSG:25832", "EPSG:25833"];

/** Rand eines WGS84-Rechtecks, n Punkte je Seite. */
const ring = ([w, s, e, n]: number[], steps = 50) => {
  const pts: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([w + t * (e - w), s], [w + t * (e - w), n], [w, s + t * (n - s)], [e, s + t * (n - s)]);
  }
  return pts;
};
const inside = ([x, y]: number[], [minX, minY, maxX, maxY]: number[]) => x >= minX && x <= maxX && y >= minY && y <= maxY;

/** mapView ohne den Schlüssel extent (wie die Konfiguration vor diesem Stand). */
const withoutExtentKey = ({ extent: _omit, ...rest }: Record<string, any>) => rest;

/**
 * Portal-View wie masterportalapi createMapView. Ein fehlender Schlüssel
 * extent ergibt den Standard-Extent; extent: undefined überschreibt ihn
 * (Object.assign) und ergibt eine View ohne Extent wie nach swapView.
 */
const portalView = (mapView: Record<string, any>) => {
  const merged = Object.assign({}, { extent: MASTERPORTALAPI_DEFAULT_EXTENT }, mapView);
  return new View({
    projection: merged.epsg,
    center: merged.startCenter,
    extent: merged.extent,
    zoom: merged.startZoomLevel,
    options: merged.options,
    resolutions: merged.options.map((o: any) => o.resolution),
    constrainResolution: true,
    constrainOnlyCenter: true,
  } as any);
};

/** Ziel von focusKommune (Zentrum in der Zone, eingerastete Auflösung). */
const expected = (slug: string, resolutions: number[]) => {
  const k = kommune(slug);
  return zoomTarget({
    center: transform(k.map.center, "EPSG:4326", k.map.projection),
    zoom: k.map.zoom,
    resolutions,
  });
};

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Zentrum bis auf 1 µm (die Interpolation in animate rundet in der letzten Stelle). */
const expectCenter = (actual: number[] | undefined, target: number[], label?: string) => {
  expect(actual, label).toHaveLength(2);
  expect(Math.abs(actual![0] - target[0]), label).toBeLessThan(1e-6);
  expect(Math.abs(actual![1] - target[1]), label).toBeLessThan(1e-6);
};

beforeAll(() => {
  for (const code of ZONES) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
  // ol/View.animate plant Folgeschritte über requestAnimationFrame (fehlt in
  // Node). Mit duration 0 ist die Animation schon im ersten Schritt fertig.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const makeWorld = (mapView: Record<string, any> = MAP_VIEW) => {
  let view = portalView(mapView);
  const source = new VectorSource();
  const layer = new VectorLayer({ source, properties: { id: LAYER_ID } });
  const map = {
    getView: () => view,
    setView: vi.fn((v: any) => {
      view = v;
    }),
    getAllLayers: () => [layer],
    getOverlays: () => ({ getArray: () => [] }),
  };
  const root: Record<string, any> = { "Maps/initialCenter": [...mapView.startCenter], "Maps/initialZoom": mapView.startZoomLevel };
  const crsState: any = { ...crsBaseState, activeCrs: mapView.epsg };
  const rootGetters: any = {
    "Maps/mode": "2D",
    mapViewSettings: mapView,
    get "Maps/initialCenter"() {
      return root["Maps/initialCenter"];
    },
    get "Maps/initialZoom"() {
      return root["Maps/initialZoom"];
    },
    get "Modules/P2d2Crs/localCrs"() {
      return crsState.localCrs;
    },
  };
  const rootCommit = (type: string, payload: unknown) => {
    if (type === "Maps/setInitialCenter") root["Maps/initialCenter"] = payload;
    if (type === "Maps/setInitialZoom") root["Maps/initialZoom"] = payload;
  };
  const crsActions: any = createCrsActions({
    swapView,
    getMap: () => map,
    View,
    ensureProjection: (code: string) => Boolean(getProjection(code)),
  });
  const crsContext = {
    state: crsState,
    rootGetters,
    commit: (type: string, payload: unknown, o?: any) =>
      o?.root ? rootCommit(type, payload) : (crsMutations as any)[type](crsState, payload),
    dispatch: () => Promise.resolve(),
  };
  const debug = vi.fn();
  const actions: any = createActions({
    url: "./resources/p2d2-selection.json",
    stageUrl: "./resources/p2d2-editor-config.json",
    layerId: LAYER_ID,
    fetch: vi.fn(() => new Promise(() => undefined)),
    getMap: () => map,
    transform,
    readFeatures: (json: any, p: any) => new GeoJSON().readFeatures(json, { dataProjection: "EPSG:4326", featureProjection: p }),
    focusDurationMs: 0,
    debug,
  });
  const state: any = {
    ...baseState,
    selection: { ...SELECTION, kommunen: KOMMUNEN },
    loadStatus: "ready",
    stage: STAGE,
    stageStatus: "ready",
  };
  const context: any = {
    state,
    rootGetters,
    commit: (type: string, payload: unknown, o?: any) =>
      o?.root ? rootCommit(type, payload) : (mutations as any)[type](state, payload),
    dispatch: (type: string, payload?: unknown, o?: any) => {
      let result: unknown;
      if (o?.root && type.startsWith("Modules/P2d2Crs/")) {
        result = crsActions[type.slice("Modules/P2d2Crs/".length)](crsContext, payload);
      }
      else if (!o?.root) result = actions[type](context, payload);
      return Promise.resolve(result);
    },
  };
  const focus = (slug: string) => actions.select(context, { kommuneSlug: slug });
  const toggle = () => crsActions.toggle(crsContext);
  return { map, view: () => map.getView(), focus, toggle, state, crsState, root, debug };
};

describe("Start-View (createMapView mit portal-config-p2d2.json)", () => {
  it("mapView.extent in EPSG:25832 umfasst Deutschland, das Startzentrum und alle deutschen Kommunen", () => {
    expect(MAP_VIEW.epsg).toBe("EPSG:25832");
    expect(MAP_VIEW.extent).toHaveLength(4);
    for (const p of ring(GERMANY_WGS84)) {
      expect(inside(transform(p, "EPSG:4326", "EPSG:25832"), MAP_VIEW.extent), String(p)).toBe(true);
    }
    expect(inside(MAP_VIEW.startCenter, MAP_VIEW.extent)).toBe(true);
    const german = SELECTION.kommunen.filter((k: any) => GERMAN_ZONES.includes(k.map.projection));
    expect(german.length).toBeGreaterThanOrEqual(9);
    for (const k of german) {
      expect(inside(transform(k.map.center, "EPSG:4326", "EPSG:25832"), MAP_VIEW.extent), k.slug).toBe(true);
    }
  });

  it("Start-View: Deutschland-Extent, Zentrum ist startCenter (Köln), kein Klemmen", () => {
    const view = portalView(MAP_VIEW);
    expect(view.get("extent")).toEqual(MAP_VIEW.extent);
    expect(view.getCenter()).toEqual(MAP_VIEW.startCenter);
    const [lon, lat] = transform(view.getCenter()!, "EPSG:25832", "EPSG:4326");
    expect(lon).toBeCloseTo(6.958, 2);
    expect(lat).toBeCloseTo(50.94, 2);
  });

  it.each(["koeln", "bonn", "dortmund", "kiel", "hamburg", "flensburg"])(
    "Start-View: animate auf %s erreicht das Zentrum",
    (slug) => {
      const view = portalView(MAP_VIEW);
      const target = expected(slug, view.getResolutions()!);
      view.animate({ center: target.center, resolution: target.resolution, duration: 0 });
      expectCenter(view.getCenter(), target.center, slug);
      expect(view.getResolution(), slug).toBe(target.resolution);
    },
  );

  it("Gegenprobe ohne mapView.extent: Standard-Extent klemmt das Startzentrum an die Ecke", () => {
    const view = portalView(withoutExtentKey(MAP_VIEW));
    expect(view.get("extent")).toEqual(MASTERPORTALAPI_DEFAULT_EXTENT);
    expect(view.getCenter()).toEqual([510000, 5850000]);
    // Ecke etwa 9,15° E / 52,80° N (zwischen Nienburg und Bremen)
    const [lon, lat] = transform([510000, 5850000], "EPSG:25832", "EPSG:4326");
    expect(lon).toBeCloseTo(9.148, 2);
    expect(lat).toBeCloseTo(52.8, 2);
    const target = expected("koeln", view.getResolutions()!);
    view.animate({ center: target.center, resolution: target.resolution, duration: 0 });
    const [x, y] = view.getCenter()!;
    expect(Math.hypot(x - target.center[0], y - target.center[1])).toBeGreaterThan(200000);
  });
});

describe("Kommunenwahl ab der Start-View: danach View ohne Extent", () => {
  it("Köln zuerst: Zentrum Köln, View ohne Extent", () => {
    const w = makeWorld();
    w.focus("koeln");
    const target = expected("koeln", w.view().getResolutions()!);
    expect(w.view().getProjection().getCode()).toBe("EPSG:25832");
    expectCenter(w.view().getCenter(), target.center);
    expect(w.view().getResolution()).toBe(target.resolution);
    expect(w.view().get("extent")).toBeUndefined();
    expect(w.state.focusedSlug).toBe("koeln");
  });

  it.each([
    ["koeln", "EPSG:25832"],
    ["berlin", "EPSG:25833"],
    ["san-francisco", "EPSG:32610"],
    ["hangzhou", "EPSG:32650"],
    ["zone-51", "EPSG:32651"],
  ])("%s zuerst (%s): Zentrum der Kommune, View ohne Extent", (slug, code) => {
    const w = makeWorld();
    w.focus(slug);
    expect(w.view().getProjection().getCode()).toBe(code);
    expectCenter(w.view().getCenter(), expected(slug, w.view().getResolutions()!).center);
    expect(w.view().get("extent")).toBeUndefined();
  });

  it("Reihenfolge Köln, Bonn, Berlin, Köln, Hangzhou, San Francisco, Zone 51, Bonn: jedes Mal ohne Klemmen", () => {
    const w = makeWorld();
    for (const slug of ["koeln", "bonn", "berlin", "koeln", "hangzhou", "san-francisco", "zone-51", "bonn"]) {
      w.focus(slug);
      expect(w.state.focusedSlug, slug).toBe(slug);
      expect(w.view().getProjection().getCode(), slug).toBe(kommune(slug).map.projection);
      expectCenter(w.view().getCenter(), expected(slug, w.view().getResolutions()!).center, slug);
      expect(w.view().get("extent"), slug).toBeUndefined();
    }
  });

  it("alle Kommunen der Auswahl-Datei, jeweils im frischen Portal", () => {
    for (const k of SELECTION.kommunen) {
      const w = makeWorld();
      w.focus(k.slug);
      expectCenter(w.view().getCenter(), expected(k.slug, w.view().getResolutions()!).center, k.slug);
    }
  });

  it("nach der Wahl von Köln lässt sich die Karte frei verschieben (München, außerhalb Deutschlands)", () => {
    const w = makeWorld();
    w.focus("koeln");
    for (const lonLat of [[11.575, 48.137], [2.35, 48.86], [20.0, 60.0]]) {
      const p = transform(lonLat, "EPSG:4326", "EPSG:25832");
      w.view().setCenter(p);
      expectCenter(w.view().getCenter(), p, String(lonLat));
    }
  });

  it("genau ein View-Austausch in gleicher Projektion, danach keiner mehr", () => {
    const w = makeWorld();
    w.focus("koeln");
    w.focus("bonn");
    w.focus("dortmund");
    expect(w.map.setView).toHaveBeenCalledTimes(1);
    expect(w.crsState.activeCrs).toBe("EPSG:25832");
  });

  it("View schon ohne Extent: Köln ohne View-Austausch", () => {
    const w = makeWorld({ ...MAP_VIEW, extent: undefined });
    expect(w.view().get("extent")).toBeUndefined();
    w.focus("koeln");
    expect(w.map.setView).not.toHaveBeenCalled();
    expectCenter(w.view().getCenter(), expected("koeln", w.view().getResolutions()!).center);
  });

  it("Startansicht: initialCenter ist das gerundete Zentrum der Kommune", () => {
    const w = makeWorld();
    w.focus("koeln");
    expect(w.root["Maps/initialCenter"]).toEqual(expected("koeln", w.view().getResolutions()!).center.map(Math.round));
  });

  it("Debug-Ereignis view enthält den Extent der aktiven View (ohne: null)", async () => {
    const w = makeWorld();
    w.focus("koeln");
    await flush();
    expect(w.debug).toHaveBeenCalledWith("view", expect.objectContaining({ projection: "EPSG:25832", extent: null }));
  });
});

describe("toggle (p2d2Crs): neue View ohne Extent", () => {
  it("ab der Start-View: 3857 ohne Extent, zurück nach 25832 ohne Extent, Zentrum bleibt", () => {
    const w = makeWorld();
    expect(w.view().get("extent")).toEqual(MAP_VIEW.extent);
    w.toggle();
    expect(w.view().getProjection().getCode()).toBe("EPSG:3857");
    expect(w.view().get("extent")).toBeUndefined();
    w.toggle();
    expect(w.view().getProjection().getCode()).toBe("EPSG:25832");
    expect(w.view().get("extent")).toBeUndefined();
    expect(w.view().getCenter()![0]).toBeCloseTo(MAP_VIEW.startCenter[0], 3);
    expect(w.view().getCenter()![1]).toBeCloseTo(MAP_VIEW.startCenter[1], 3);
  });

  it.each(["koeln", "berlin", "san-francisco", "hangzhou", "zone-51"])(
    "nach der Wahl von %s: toggle nach 3857 und zurück, jeweils ohne Extent und frei verschiebbar",
    (slug) => {
      const w = makeWorld();
      w.focus(slug);
      const code = kommune(slug).map.projection;
      w.toggle();
      expect(w.view().getProjection().getCode(), slug).toBe("EPSG:3857");
      expect(w.view().get("extent"), slug).toBeUndefined();
      const far = transform([-70, -40], "EPSG:4326", "EPSG:3857");
      w.view().setCenter(far);
      expectCenter(w.view().getCenter(), far, slug);
      w.toggle();
      expect(w.view().getProjection().getCode(), slug).toBe(code);
      expect(w.view().get("extent"), slug).toBeUndefined();
    },
  );
});
