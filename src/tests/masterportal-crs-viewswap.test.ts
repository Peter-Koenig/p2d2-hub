// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für das Masterportal-Modul p2d2Crs/js/viewSwap.js
//
// Zielprojektion, Bodenauflösung, Einrasten auf die Portal-Tabelle,
// View-Optionen und der View-Austausch mit Fakes für Karte und Store.
// View, Projektionen und Vektorquellen kommen aus dem ol des p2d2-Repositorys.
// Kein Netzwerk, keine DB, kein DOM.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { transform, transformExtent } from "ol/proj.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Cluster from "ol/source/Cluster.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import {
  targetCrs,
  targetResolution,
  snapResolution,
  buildViewOptions,
  isRemoteSource,
  reprojectLayers,
  swapView,
} from "../../supplement/masterportal/addons/p2d2Crs/js/viewSwap.js";

const CFG = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../supplement/masterportal/portal/resources/portal-config-p2d2.json"),
    "utf8",
  ),
);
const MAP_VIEW = CFG.portalConfig.map.mapView;
const OPTIONS: { resolution: number; scale: number; zoomLevel: number }[] = MAP_VIEW.options;
const RESOLUTIONS = OPTIONS.map((o) => o.resolution);
// Die Portal-Konfiguration hat keinen extent mehr (E11b); buildViewOptions und
// swapView unterstützen ihn weiter. Testwert: früherer Extent Stadtgebiet Köln.
const TEST_EXTENT = [343135, 5633285, 371269, 5660884];
const BASE_EXTENT = { extent: TEST_EXTENT, epsg: MAP_VIEW.epsg };
const KOELN = MAP_VIEW.startCenter as number[];

beforeAll(() => {
  for (const code of ["EPSG:25832", "EPSG:32737"]) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
});

describe("targetCrs", () => {
  const base = { localCrs: "EPSG:25832", genericCrs: "EPSG:3857" };

  it("lokal aktiv → generisch", () => {
    expect(targetCrs({ ...base, activeCrs: "EPSG:25832" })).toBe("EPSG:3857");
  });

  it("generisch aktiv → lokal", () => {
    expect(targetCrs({ ...base, activeCrs: "EPSG:3857" })).toBe("EPSG:25832");
  });

  it("ohne lokales CRS kein Ziel", () => {
    expect(targetCrs({ ...base, localCrs: undefined, activeCrs: "EPSG:3857" })).toBeNull();
    expect(targetCrs({ ...base, localCrs: "", activeCrs: "EPSG:3857" })).toBeNull();
  });
});

describe("targetResolution (Bodenauflösung erhalten)", () => {
  it("Köln: UTM-Auflösung ist etwa 0,63 der 3857-Auflösung", () => {
    const res3857 = targetResolution({ resolution: 10, center: KOELN, from: "EPSG:25832", to: "EPSG:3857" });
    expect(10 / res3857).toBeGreaterThan(0.62);
    expect(10 / res3857).toBeLessThan(0.64);
  });

  it("hin und zurück ergibt dieselbe Auflösung", () => {
    const there = targetResolution({ resolution: 5.29, center: KOELN, from: "EPSG:25832", to: "EPSG:3857" });
    const center3857 = transform(KOELN, "EPSG:25832", "EPSG:3857");
    const back = targetResolution({ resolution: there, center: center3857, from: "EPSG:3857", to: "EPSG:25832" });
    expect(Math.abs(back - 5.29) / 5.29).toBeLessThan(1e-6);
  });

  it("Südhalbkugel (37S) funktioniert", () => {
    const center = transform([36.817, -1.286], "EPSG:4326", "EPSG:32737");
    const res = targetResolution({ resolution: 10, center, from: "EPSG:32737", to: "EPSG:3857" });
    // Nahe am Äquator ist der Mercator-Faktor fast 1.
    expect(10 / res).toBeGreaterThan(0.99);
    expect(10 / res).toBeLessThan(1.01);
  });
});

describe("snapResolution", () => {
  it("nächste Stufe der Portal-Tabelle", () => {
    expect(snapResolution(15.9, RESOLUTIONS)).toBe(15.875);
    expect(snapResolution(20, RESOLUTIONS)).toBe(15.875);
    expect(snapResolution(22, RESOLUTIONS)).toBe(26.45833333);
  });

  it("außerhalb der Tabelle wird auf die Randstufe begrenzt", () => {
    expect(snapResolution(1000, RESOLUTIONS)).toBe(RESOLUTIONS[0]);
    expect(snapResolution(0.0001, RESOLUTIONS)).toBe(RESOLUTIONS[RESOLUTIONS.length - 1]);
  });

  it("ungültige Eingaben werfen", () => {
    expect(() => snapResolution(10, [])).toThrow();
    expect(() => snapResolution(NaN, RESOLUTIONS)).toThrow();
    expect(() => snapResolution(-1, RESOLUTIONS)).toThrow();
  });

  it("stimmt mit dem Einrasten des OL-Konstruktors überein", () => {
    // Beobachtet mit ol 10.6: new View({resolutions, resolution, constrainResolution: true})
    // rastet im Konstruktor ein. Das Add-on verlässt sich nicht darauf, gleicht
    // aber dieselbe Regel ab, damit OL nicht auf eine andere Stufe springt.
    for (let r = 0.01; r < 200; r *= 1.07) {
      const view = new View({
        projection: "EPSG:25832",
        center: KOELN,
        resolutions: RESOLUTIONS,
        resolution: r,
        constrainResolution: true,
      });
      expect(snapResolution(r, RESOLUTIONS), String(r)).toBe(view.getResolution());
    }
  });
});

describe("buildViewOptions", () => {
  const args = {
    projection: "EPSG:3857",
    center: [1, 2],
    resolution: 15.875,
    rotation: 0.5,
    options: OPTIONS,
    resolutions: RESOLUTIONS,
    backgroundImage: "resources/img/backgroundCanvas.jpeg",
    baseExtent: BASE_EXTENT,
  };

  it("übernimmt Portal-Tabelle und Einrast-Verhalten der masterportalapi", () => {
    const o = buildViewOptions(args);
    expect(o).toMatchObject({
      projection: "EPSG:3857",
      center: [1, 2],
      resolution: 15.875,
      rotation: 0.5,
      resolutions: RESOLUTIONS,
      constrainResolution: true,
      constrainOnlyCenter: true,
      backgroundImage: "resources/img/backgroundCanvas.jpeg",
    });
    expect(o.options).toEqual(OPTIONS);
  });

  it("Extent wird aus der Portal-Projektion transformiert", () => {
    const o = buildViewOptions(args);
    expect(o.extent).toEqual(transformExtent(TEST_EXTENT, "EPSG:25832", "EPSG:3857"));
    expect(buildViewOptions({ ...args, projection: "EPSG:25832" }).extent).toEqual(TEST_EXTENT);
  });

  it("ohne Basis-Extent kein Extent", () => {
    expect(buildViewOptions({ ...args, baseExtent: undefined }).extent).toBeUndefined();
  });

  it("options wird zur View-Property (Maßstab, Scale-Switcher)", () => {
    const view = new View(buildViewOptions(args));
    expect(view.get("options")).toEqual(OPTIONS);
    expect(view.getResolutions()).toEqual(RESOLUTIONS);
  });
});

describe("isRemoteSource", () => {
  it("URL oder Loader → nachladen, nur Features → transformieren", () => {
    expect(isRemoteSource(new VectorSource({ url: "/x.json", format: new GeoJSON() }))).toBe(true);
    expect(isRemoteSource(new VectorSource({ loader() {} }))).toBe(true);
    expect(isRemoteSource(new VectorSource({}))).toBe(false);
  });
});

// Karte und Store als Fakes; View ist echt.
const makeView = (projection = "EPSG:25832") =>
  new View({
    projection,
    center: KOELN,
    resolutions: RESOLUTIONS,
    resolution: 10.58333333,
    rotation: 0.25,
    constrainResolution: true,
    constrainOnlyCenter: true,
    extent: TEST_EXTENT,
    options: OPTIONS,
    backgroundImage: "bg.jpeg",
  } as any);

const setup = (overrides: Record<string, any> = {}) => {
  let view = makeView();
  const log: string[] = [];
  const remote = new VectorSource({ url: "/fh.json", format: new GeoJSON() });
  const refresh = vi.spyOn(remote, "refresh");
  const point = new Feature(new Point(KOELN));
  const local = new VectorSource({ features: [point] });
  const clusterInner = new VectorSource({ url: "/c.json", format: new GeoJSON() });
  const clusterRefresh = vi.spyOn(clusterInner, "refresh");
  const layers = [
    new VectorLayer({ source: remote }),
    new VectorLayer({ source: local }),
    new VectorLayer({ source: new Cluster({ source: clusterInner }) }),
    { getSource: () => ({}) }, // Rasterlayer
    { getSource: () => null },
  ];
  let overlayPos: number[] | undefined = [...KOELN];
  const overlay = { getPosition: () => overlayPos, setPosition: (p: number[]) => (overlayPos = p) };
  const map = {
    getView: () => view,
    setView: vi.fn((v: any) => {
      log.push(`setView:${v.getProjection().getCode()}`);
      view = v;
    }),
    getAllLayers: () => layers,
    getOverlays: () => ({ getArray: () => [overlay, { getPosition: () => undefined, setPosition: vi.fn() }] }),
  };
  const getters: Record<string, any> = {
    "Maps/mode": "2D",
    "Maps/initialCenter": [...KOELN],
    "Maps/initialZoom": 3,
  };
  const ensureProjection = vi.fn(() => true);
  const deps = {
    target: "EPSG:3857",
    map,
    View,
    ensureProjection,
    getters,
    commit: vi.fn((type: string) => log.push(`commit:${type}`)),
    dispatch: vi.fn((type: string) => log.push(`dispatch:${type}`)),
    baseExtent: BASE_EXTENT,
    ...overrides,
  };
  return { deps, log, map, refresh, clusterRefresh, point, getOverlayPos: () => overlayPos, getters };
};

describe("swapView", () => {
  it("Reihenfolge: View, Store, Layer, Marker, BackForward", () => {
    const { deps, log } = setup();
    expect(swapView(deps as any)).toEqual({ ok: true, from: "EPSG:25832", to: "EPSG:3857" });
    expect(log).toEqual([
      "setView:EPSG:3857",
      "commit:Maps/setProjection",
      "commit:Maps/setResolutions",
      "commit:Maps/setScales",
      "commit:Maps/setInitialCenter",
      "commit:Maps/setInitialZoom",
      "dispatch:Maps/registerMapViewListener",
      "dispatch:Maps/updateAttributesByChangeResolution",
      "dispatch:Maps/updateAttributesByMoveend",
      "dispatch:Maps/removePointMarker",
      "dispatch:Maps/removePolygonMarker",
      "dispatch:Maps/removeHighlightFeature",
      "commit:Controls/BackForward/setMemory",
      "commit:Controls/BackForward/setPosition",
    ]);
  });

  it("neue View: Projektion, Zentrum, eingerastete Bodenauflösung, Rotation, Optionen", () => {
    const { deps, map } = setup();
    swapView(deps as any);
    const view = map.getView();
    expect(view.getProjection().getCode()).toBe("EPSG:3857");
    const want = transform(KOELN, "EPSG:25832", "EPSG:3857");
    expect(view.getCenter()![0]).toBeCloseTo(want[0], 3);
    expect(view.getCenter()![1]).toBeCloseTo(want[1], 3);
    expect(RESOLUTIONS).toContain(view.getResolution());
    // 10,58 m/px Boden in Köln → etwa 16,8 m/px in 3857 → Stufe 15,875.
    expect(view.getResolution()).toBe(15.875);
    expect(view.getRotation()).toBe(0.25);
    expect(view.get("options")).toEqual(OPTIONS);
    expect(view.get("backgroundImage")).toBe("bg.jpeg");
  });

  it("Store-Werte gehören zur neuen View", () => {
    const { deps, map } = setup();
    swapView(deps as any);
    const args = Object.fromEntries(deps.commit.mock.calls.map((c: any[]) => [c[0], c[1]]));
    expect(args["Maps/setProjection"]).toBe(map.getView().getProjection());
    expect(args["Maps/setResolutions"]).toEqual(RESOLUTIONS);
    expect(args["Maps/setScales"]).toEqual(OPTIONS.map((o) => o.scale));
    const ic = transform(KOELN, "EPSG:25832", "EPSG:3857");
    expect(args["Maps/setInitialCenter"][0]).toBeCloseTo(ic[0], 3);
    expect(args["Maps/setInitialZoom"]).toBe(3);
    expect(args["Controls/BackForward/setMemory"]).toEqual([]);
    expect(args["Controls/BackForward/setPosition"]).toBeNull();
  });

  it("Vektorquellen: mit URL nachladen, ohne URL transformieren, Overlays verschieben", () => {
    const { deps, refresh, clusterRefresh, point, getOverlayPos } = setup();
    swapView(deps as any);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clusterRefresh).toHaveBeenCalledTimes(1);
    const want = transform(KOELN, "EPSG:25832", "EPSG:3857");
    expect((point.getGeometry() as Point).getCoordinates()[0]).toBeCloseTo(want[0], 3);
    expect(getOverlayPos()![1]).toBeCloseTo(want[1], 3);
  });

  it("ohne initialCenter kein setInitialCenter", () => {
    const { deps } = setup();
    deps.getters["Maps/initialCenter"] = null;
    swapView(deps as any);
    expect(deps.commit.mock.calls.map((c: any[]) => c[0])).not.toContain("Maps/setInitialCenter");
  });

  it("Abbruch im 3D-Modus: nichts passiert", () => {
    const { deps, log } = setup();
    deps.getters["Maps/mode"] = "3D";
    expect(swapView(deps as any)).toEqual({ ok: false, reason: "mode" });
    expect(deps.ensureProjection).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it("Ziel gleich aktueller Projektion: nichts passiert", () => {
    const { deps, log } = setup({ target: "EPSG:25832" });
    expect(swapView(deps as any)).toEqual({ ok: true, unchanged: true, from: "EPSG:25832", to: "EPSG:25832" });
    expect(log).toEqual([]);
  });

  it("unbekannte Projektion: kein Austausch", () => {
    const { deps, log } = setup({ ensureProjection: vi.fn(() => false) });
    expect(swapView(deps as any)).toEqual({ ok: false, reason: "projection" });
    expect(log).toEqual([]);
  });

  it("Rollback, wenn die Karte die neue View nicht übernimmt", () => {
    // Eine View-Klasse, die immer EPSG:25832 baut, simuliert die fehlgeschlagene Prüfung.
    class WrongView extends View {
      constructor(o: any) {
        super({ ...o, projection: "EPSG:25832" });
      }
    }
    const { deps, log, map } = setup({ View: WrongView });
    const old = map.getView();
    expect(swapView(deps as any)).toEqual({ ok: false, reason: "verify" });
    expect(map.getView()).toBe(old);
    expect(log.filter((l) => !l.startsWith("setView"))).toEqual([]);
  });

  it("Rollback, wenn der Austausch wirft", () => {
    class BrokenView {
      constructor() {
        throw new Error("kaputt");
      }
    }
    const { deps, log, map } = setup({ View: BrokenView });
    const old = map.getView();
    expect(swapView(deps as any)).toMatchObject({ ok: false, reason: "error" });
    expect(map.getView()).toBe(old);
    expect(log).toEqual([]);
  });

  it("zurück nach UTM: Auflösung wieder auf Ausgangsstufe", () => {
    const { deps, map } = setup();
    swapView(deps as any);
    swapView({ ...deps, target: "EPSG:25832" } as any);
    expect(map.getView().getProjection().getCode()).toBe("EPSG:25832");
    expect(map.getView().getResolution()).toBe(10.58333333);
    expect(map.getView().getCenter()![0]).toBeCloseTo(KOELN[0], 3);
  });
});

describe("reprojectLayers", () => {
  it("zählt nachgeladene und transformierte Quellen", () => {
    const remote = new VectorSource({ url: "/a.json", format: new GeoJSON() });
    vi.spyOn(remote, "refresh");
    const local = new VectorSource({ features: [new Feature(new Point(KOELN)), new Feature()] });
    const result = reprojectLayers(
      [new VectorLayer({ source: remote }), new VectorLayer({ source: local }), { getSource: () => ({}) }],
      "EPSG:25832",
      "EPSG:3857",
    );
    expect(result).toEqual({ refreshed: 1, transformed: 1 });
  });
});

describe("Store-Aktionen (createActions mit Fakes)", () => {
  // Import hier, damit ein fehlendes Modul die übrigen Tests nicht verdeckt.
  const load = () => import("../../supplement/masterportal/addons/p2d2Crs/store/actionsP2d2Crs.js");

  const context = (state: Record<string, any>, mode = "2D") => ({
    state,
    commit: vi.fn((type: string, payload?: unknown) => {
      if (type === "setActiveCrs") state.activeCrs = payload;
      if (type === "setLocalCrs") state.localCrs = payload;
    }),
    dispatch: vi.fn(),
    rootGetters: { "Maps/mode": mode, "Maps/initialCenter": null, "Maps/initialZoom": 3 },
  });

  it("toggle schaltet um und setzt activeCrs nur bei Erfolg", async () => {
    const { createActions } = await load();
    const swap = vi.fn(() => ({ ok: true }));
    const actions = createActions({ swapView: swap, getMap: () => ({}), View, ensureProjection: () => true, baseExtent: () => BASE_EXTENT });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    actions.toggle(ctx as any);
    expect(swap).toHaveBeenCalledWith(expect.objectContaining({ target: "EPSG:3857" }));
    expect(ctx.state.activeCrs).toBe("EPSG:3857");

    swap.mockReturnValueOnce({ ok: false, reason: "verify" } as any);
    actions.toggle(ctx as any);
    expect(ctx.state.activeCrs).toBe("EPSG:3857");
  });

  it("toggle leitet Root-Commits und -Dispatches weiter", async () => {
    const { createActions } = await load();
    let seen: any = null;
    const actions = createActions({
      swapView: (d: any) => {
        seen = d;
        d.commit("Maps/setProjection", 1);
        d.dispatch("Maps/removePointMarker");
        return { ok: true };
      },
      getMap: () => ({}),
      View,
      ensureProjection: () => true,
      baseExtent: () => BASE_EXTENT,
    });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    actions.toggle(ctx as any);
    expect(ctx.commit).toHaveBeenCalledWith("Maps/setProjection", 1, { root: true });
    expect(ctx.dispatch).toHaveBeenCalledWith("Maps/removePointMarker", undefined, { root: true });
    expect(seen.getters).toBe(ctx.rootGetters);
    expect(seen.baseExtent).toEqual(BASE_EXTENT);
  });

  it("toggle ohne lokales CRS oder in 3D tut nichts", async () => {
    const { createActions } = await load();
    const swap = vi.fn(() => ({ ok: true }));
    const actions = createActions({ swapView: swap, getMap: () => ({}), View, ensureProjection: () => true, baseExtent: () => BASE_EXTENT });
    actions.toggle(context({ activeCrs: "EPSG:3857", localCrs: undefined, genericCrs: "EPSG:3857" }) as any);
    actions.toggle(context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" }, "3D") as any);
    expect(swap).not.toHaveBeenCalled();
  });

  it("setLocalCrs registriert die Zone und setzt localCrs", async () => {
    const { createActions } = await load();
    const ensure = vi.fn(() => true);
    const actions = createActions({ swapView: vi.fn(), getMap: () => ({}), View, ensureProjection: ensure, baseExtent: () => BASE_EXTENT });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    expect(actions.setLocalCrs(ctx as any, "EPSG:32737")).toBe(true);
    expect(ensure).toHaveBeenCalledWith("EPSG:32737");
    expect(ctx.state.localCrs).toBe("EPSG:32737");
  });

  it("setLocalCrs lehnt Nicht-UTM und fehlgeschlagene Registrierung ab", async () => {
    const { createActions } = await load();
    const actions = createActions({ swapView: vi.fn(), getMap: () => ({}), View, ensureProjection: () => false, baseExtent: () => BASE_EXTENT });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    expect(actions.setLocalCrs(ctx as any, "EPSG:3857")).toBe(false);
    expect(actions.setLocalCrs(ctx as any, "EPSG:32737")).toBe(false);
    expect(ctx.state.localCrs).toBe("EPSG:25832");
  });

  it("activateLocal, andere Projektion: Austausch auf localCrs, activeCrs lokal", async () => {
    const { createActions } = await load();
    const swap = vi.fn(() => ({ ok: true, from: "EPSG:3857", to: "EPSG:25833" }));
    const actions = createActions({ swapView: swap, getMap: () => ({}), View, ensureProjection: () => true, baseExtent: () => undefined });
    const ctx = context({ activeCrs: "EPSG:3857", localCrs: "EPSG:25833", genericCrs: "EPSG:3857", lastError: "x" });
    expect(actions.activateLocal(ctx as any)).toEqual({ ok: true, from: "EPSG:3857", to: "EPSG:25833" });
    expect(swap).toHaveBeenCalledWith(expect.objectContaining({ target: "EPSG:25833", baseExtent: undefined }));
    expect(ctx.state.activeCrs).toBe("EPSG:25833");
    expect(ctx.commit).toHaveBeenCalledWith("setLastError", null);
  });

  it("activateLocal, gleiche Projektion: echter swapView ohne Austausch, activeCrs bleibt lokal", async () => {
    const { createActions } = await load();
    const { deps, map, log } = setup({ target: "EPSG:25832" });
    const actions = createActions({ swapView, getMap: () => map, View, ensureProjection: () => true, baseExtent: () => undefined });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    ctx.rootGetters = { ...deps.getters } as any;
    expect(actions.activateLocal(ctx as any)).toEqual({ ok: true, unchanged: true, from: "EPSG:25832", to: "EPSG:25832" });
    expect(map.setView).not.toHaveBeenCalled();
    expect(log).toEqual([]);
    expect(ctx.state.activeCrs).toBe("EPSG:25832");
  });

  it("activateLocal, echter swapView auf eine andere Zone: View in localCrs", async () => {
    const { createActions } = await load();
    const { deps, map } = setup();
    const actions = createActions({ swapView, getMap: () => map, View, ensureProjection: () => true, baseExtent: () => undefined });
    const ctx = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:32737", genericCrs: "EPSG:3857" });
    ctx.rootGetters = { ...deps.getters } as any;
    expect(actions.activateLocal(ctx as any)).toMatchObject({ ok: true, from: "EPSG:25832", to: "EPSG:32737" });
    expect(map.getView().getProjection().getCode()).toBe("EPSG:32737");
    // ohne Portal-Extent (E11b) ist das Zentrum frei
    map.getView().setCenter([500000, 9000000]);
    expect(map.getView().getCenter()).toEqual([500000, 9000000]);
    expect(ctx.state.activeCrs).toBe("EPSG:32737");
  });

  it("activateLocal in 3D oder ohne localCrs: kein Austausch, lastError", async () => {
    const { createActions } = await load();
    const swap = vi.fn(() => ({ ok: true }));
    const actions = createActions({ swapView: swap, getMap: () => ({}), View, ensureProjection: () => true, baseExtent: () => undefined });
    const ctx3d = context({ activeCrs: "EPSG:25832", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" }, "3D");
    expect(actions.activateLocal(ctx3d as any)).toEqual({ ok: false, reason: "mode" });
    const none = context({ activeCrs: "EPSG:25832", localCrs: undefined, genericCrs: "EPSG:3857" });
    expect(actions.activateLocal(none as any)).toEqual({ ok: false, reason: "local" });
    expect(swap).not.toHaveBeenCalled();
    expect(ctx3d.commit).toHaveBeenCalledWith("setLastError", "mode");
  });

  it("activateLocal bei Fehlschlag: activeCrs unverändert, lastError gesetzt", async () => {
    const { createActions } = await load();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const actions = createActions({
      swapView: () => ({ ok: false, reason: "projection" }),
      getMap: () => ({}),
      View,
      ensureProjection: () => true,
      baseExtent: () => undefined,
    });
    const ctx = context({ activeCrs: "EPSG:3857", localCrs: "EPSG:25832", genericCrs: "EPSG:3857" });
    expect(actions.activateLocal(ctx as any)).toEqual({ ok: false, reason: "projection" });
    expect(ctx.state.activeCrs).toBe("EPSG:3857");
    expect(ctx.commit).toHaveBeenCalledWith("setLastError", "projection");
    err.mockRestore();
  });
});
