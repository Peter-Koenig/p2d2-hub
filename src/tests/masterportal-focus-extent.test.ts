// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Extent der Portal-View bei der Kommunenwahl (p2d2Crs und p2d2Selector)
//
// Die Portal-View wird wie in masterportalapi 2.64.0 createMapView gebaut
// (src/maps/mapView.js:38-55): Konfiguration über die Standardwerte gelegt
// (src/defaults.js:11). Ohne konfigurierten extent gilt daher der
// Standard-Extent; constrainOnlyCenter klemmt nur das Zentrum.
//   S0: frisch geladenes Portal (View aus der Portal-Konfiguration)
//   S1: nach einem View-Austausch durch swapView
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

/** Portal-View wie masterportalapi createMapView. */
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
    // wie p2d2Crs/js/runtime.js baseExtent
    baseExtent: (g: any) => {
      const { extent, epsg } = g.mapViewSettings ?? {};
      return Array.isArray(extent) && epsg ? { extent, epsg } : undefined;
    },
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
  return { map, view: () => map.getView(), focus, state, crsState, root, debug };
};

describe("Portal-View ohne konfigurierten Extent (Nachbildung masterportalapi)", () => {
  it("Portal-Konfiguration hat keinen extent", () => {
    expect(MAP_VIEW.extent).toBeUndefined();
  });

  it("S0: Standard-Extent, das Startzentrum Köln wird an die Ecke geklemmt", () => {
    const view = portalView(MAP_VIEW);
    expect(view.get("extent")).toEqual(MASTERPORTALAPI_DEFAULT_EXTENT);
    expect(view.getCenter()).toEqual([510000, 5850000]);
    // Ecke etwa 9,15° E / 52,80° N (zwischen Nienburg und Bremen)
    const [lon, lat] = transform([510000, 5850000], "EPSG:25832", "EPSG:4326");
    expect(lon).toBeCloseTo(9.148, 2);
    expect(lat).toBeCloseTo(52.8, 2);
  });

  it("S0: view.animate auf Köln bleibt am Extent hängen (Ursache)", () => {
    const view = portalView(MAP_VIEW);
    const target = expected("koeln", view.getResolutions()!);
    view.animate({ center: target.center, resolution: target.resolution, duration: 0 });
    const [x, y] = view.getCenter()!;
    expect(Math.hypot(x - 510000, y - 5850000)).toBeLessThan(15000);
    expect(Math.hypot(x - target.center[0], y - target.center[1])).toBeGreaterThan(200000);
  });

  it("S1: View ohne Extent, animate erreicht Köln", () => {
    const view = portalView({ ...MAP_VIEW, extent: undefined });
    expect(view.get("extent")).toBeUndefined();
    const target = expected("koeln", view.getResolutions()!);
    view.animate({ center: target.center, resolution: target.resolution, duration: 0 });
    expectCenter(view.getCenter(), target.center);
  });
});

describe("focusKommune: kein Extent klemmt das Zentrum", () => {
  it("S0, Köln zuerst: Zentrum Köln, View ohne Extent", () => {
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
  ])("S0, %s zuerst (%s): Zentrum der Kommune", (slug, code) => {
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
    }
  });

  it("alle Kommunen der Auswahl-Datei, jeweils im frischen Portal", () => {
    for (const k of SELECTION.kommunen) {
      const w = makeWorld();
      w.focus(k.slug);
      expectCenter(w.view().getCenter(), expected(k.slug, w.view().getResolutions()!).center, k.slug);
    }
  });

  it("nach der Wahl von Köln lässt sich die Karte bis München verschieben", () => {
    const w = makeWorld();
    w.focus("koeln");
    const muenchen = transform([11.575, 48.137], "EPSG:4326", "EPSG:25832");
    w.view().setCenter(muenchen);
    expectCenter(w.view().getCenter(), muenchen);
  });

  it("S0: genau ein View-Austausch in gleicher Projektion, danach keiner mehr", () => {
    const w = makeWorld();
    w.focus("koeln");
    w.focus("bonn");
    w.focus("dortmund");
    expect(w.map.setView).toHaveBeenCalledTimes(1);
    expect(w.crsState.activeCrs).toBe("EPSG:25832");
  });

  it("S1 (View schon ohne Extent): Köln ohne View-Austausch", () => {
    const w = makeWorld({ ...MAP_VIEW, extent: undefined });
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
