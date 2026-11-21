// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für applySelection und focusKommune (Add-on p2d2Selector)
//
// Ohne Masterportal und ohne Vuex: Ein kleiner Store wendet die echten
// Mutationen beider Add-ons an. Root-Dispatches an Modules/P2d2Crs gehen an
// die echten Aktionen von p2d2Crs; swapView ist ein Fake, der die View
// austauscht. dispatch liefert wie Vuex immer ein Promise. Die Quelle des
// Auswahl-Layers ist eine echte ol/source/Vector, fetch ein Fake.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { get as getProjection, transform } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import { createActions as createCrsActions } from "../../supplement/masterportal/addons/p2d2Crs/store/actionsP2d2Crs.js";
import crsMutations from "../../supplement/masterportal/addons/p2d2Crs/store/mutationsP2d2Crs.js";
import crsBaseState from "../../supplement/masterportal/addons/p2d2Crs/store/stateP2d2Crs.js";
import { createActions, escapeHtml } from "../../supplement/masterportal/addons/p2d2Selector/store/actionsP2d2Selector.js";
import mutations from "../../supplement/masterportal/addons/p2d2Selector/store/mutationsP2d2Selector.js";
import baseState from "../../supplement/masterportal/addons/p2d2Selector/store/stateP2d2Selector.js";
import { buildCql, buildLayerUrl } from "../../supplement/masterportal/addons/p2d2Selector/js/wfsRequest.js";
import { createDebug, debugEnabled, DEBUG_PREFIX } from "../../supplement/masterportal/addons/p2d2Selector/js/debug.js";

const RES = resolve(__dirname, "../../supplement/masterportal/portal/resources");
const readJson = (name: string): any => JSON.parse(readFileSync(resolve(RES, name), "utf8"));
const SELECTION = readJson("p2d2-selection.json");
const OPTIONS = readJson("portal-config-p2d2.json").portalConfig.map.mapView.options;
const RESOLUTIONS: number[] = OPTIONS.map((o: any) => o.resolution);
const LAYER_ID = "p2d2-geo-containers";
const STAGE = (({ wfsBase, typeName, proxyPath }) => ({ wfsBase, typeName, proxyPath }))(
  readJson("p2d2-editor-config.json").layers[LAYER_ID],
);
const kommune = (slug: string) => SELECTION.kommunen.find((k: any) => k.slug === slug);
const kategorie = (slug: string) => SELECTION.kategorien.find((k: any) => k.slug === slug);
const urlFor = (k: string, c: string) => {
  const ko = kommune(k);
  const ka = kategorie(c);
  return buildLayerUrl({
    ...STAGE,
    cql: buildCql({ wpName: ko.wpName, containerType: ka.containerType, level: ko.osmAdminLevel[ka.containerType] }),
  });
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const fc = (n: number) => ({
  type: "FeatureCollection",
  features: Array.from({ length: n }, (_, i) => ({
    type: "Feature",
    id: `c.${i}`,
    properties: { name: `f${i}` },
    geometry: { type: "Point", coordinates: [7, 51] },
  })),
});

beforeAll(() => {
  for (const code of ["EPSG:25832", "EPSG:25833", "EPSG:32610", "EPSG:32650"]) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

/** Fake-View mit Aufzeichnung; animate ruft den Callback sofort (Ende der Animation). */
const makeView = (code: string, log: string[]) => {
  let center = [0, 0];
  let resolution = RESOLUTIONS[3];
  return {
    code,
    getProjection: () => ({ getCode: () => code }),
    getResolutions: () => RESOLUTIONS,
    getResolution: () => resolution,
    getCenter: () => center,
    animate: vi.fn((opts: any, done?: (ok: boolean) => void) => {
      log.push(`animate:${code}`);
      center = opts.center;
      resolution = opts.resolution;
      done?.(true);
    }),
  };
};

type Options = { mode?: string; withLayer?: boolean; crsAddon?: boolean; viewCode?: string; activeCrs?: string };

const makeWorld = (opts: Options = {}) => {
  const { mode = "2D", withLayer = true, crsAddon = true, viewCode = "EPSG:25832", activeCrs = "EPSG:25832" } = opts;
  const log: string[] = [];
  const calls: { url: string; resolve: (v: any) => void }[] = [];
  const fetch = vi.fn(
    (url: string) => new Promise((res) => calls.push({ url, resolve: res })),
  );
  const source = new VectorSource();
  for (const m of ["setLoader", "refresh", "clear"] as const) {
    const orig = (source as any)[m].bind(source);
    vi.spyOn(source as any, m).mockImplementation((...a: any[]) => {
      log.push(`source.${m}`);
      return orig(...a);
    });
  }
  const world: any = { view: makeView(viewCode, log), log, calls, fetch, source };
  const map = {
    getView: () => world.view,
    getAllLayers: () => (withLayer ? [{ get: (k: string) => (k === "id" ? LAYER_ID : undefined), getSource: () => source }] : []),
  };
  world.map = map;

  // p2d2Crs: echte Aktionen und Mutationen, swapView tauscht die Fake-View.
  const crsState: any = { ...crsBaseState, activeCrs };
  const swapView = vi.fn(({ target }: any) => {
    const from = world.view.code;
    if (from === target) return { ok: true, unchanged: true, from, to: target };
    log.push(`swapView:${from}->${target}`);
    world.view = makeView(target, log);
    return { ok: true, from, to: target };
  });
  const crsActions: any = createCrsActions({ swapView, getMap: () => map, View: class {}, ensureProjection: () => true, baseExtent: () => undefined });
  const state: any = { ...baseState, selection: SELECTION, loadStatus: "ready", stage: STAGE, stageStatus: "ready" };
  const root: Record<string, any> = { "Maps/initialCenter": null, "Maps/initialZoom": 3 };
  const rootGetters: any = {
    get "Maps/mode"() {
      return mode;
    },
    get "Maps/initialCenter"() {
      return root["Maps/initialCenter"];
    },
    get "Maps/initialZoom"() {
      return root["Maps/initialZoom"];
    },
    get "Modules/P2d2Crs/localCrs"() {
      return crsAddon ? crsState.localCrs : undefined;
    },
  };
  const crsContext = {
    state: crsState,
    rootGetters,
    commit: (type: string, payload: unknown, o?: any) => {
      if (o?.root) return;
      log.push(`crs.${type}:${payload}`);
      (crsMutations as any)[type](crsState, payload);
    },
    dispatch: () => Promise.resolve(),
  };
  const debug = vi.fn();
  const actions: any = createActions({
    url: "./resources/p2d2-selection.json",
    stageUrl: "./resources/p2d2-editor-config.json",
    layerId: LAYER_ID,
    fetch,
    getMap: () => map,
    transform,
    readFeatures: (json: any, p: any) => new GeoJSON().readFeatures(json, { dataProjection: "EPSG:4326", featureProjection: p }),
    focusDurationMs: 300,
    debug,
  });
  const alerts: any[] = [];
  const context: any = {
    state,
    rootGetters,
    commit: vi.fn((type: string, payload: unknown, o?: any) => {
      log.push(`commit:${type}`);
      if (o?.root) {
        if (type === "Maps/setInitialCenter") root["Maps/initialCenter"] = payload;
        if (type === "Maps/setInitialZoom") root["Maps/initialZoom"] = payload;
        return;
      }
      (mutations as any)[type](state, payload);
    }),
    dispatch: vi.fn((type: string, payload?: unknown, o?: any) => {
      log.push(`dispatch:${type}`);
      let result: unknown;
      if (o?.root && type.startsWith("Modules/P2d2Crs/")) {
        if (crsAddon) result = crsActions[type.slice("Modules/P2d2Crs/".length)](crsContext, payload);
      }
      else if (o?.root && type === "Alerting/addSingleAlert") alerts.push(payload);
      else if (!o?.root) result = actions[type](context, payload);
      return Promise.resolve(result);
    }),
  };
  // Klick auf Kacheln wie in der Komponente.
  const click = (c: { kommuneSlug?: string; kategorieSlug?: string }) => actions.select(context, c);
  const render = () => source.loadFeatures([-1e8, -1e8, 1e8, 1e8], 10, getProjection(world.view.code)!);
  return Object.assign(world, { state, crsState, root, actions, context, click, render, alerts, debug, swapView });
};

describe("applySelection: Reihenfolge in focusKommune", () => {
  it("Köln (gleiche Projektion): setLocalCrs, activateLocal, animate, Startansicht, Fokus, dann Loader", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    expect(w.log).toEqual([
      "commit:setSelected",
      "dispatch:applySelection",
      "commit:setAppliedSignature",
      "dispatch:Modules/P2d2Crs/setLocalCrs",
      "crs.setLocalCrs:EPSG:25832",
      "dispatch:Modules/P2d2Crs/activateLocal",
      "crs.setActiveCrs:EPSG:25832",
      "crs.setLastError:null",
      "animate:EPSG:25832",
      "commit:Maps/setInitialCenter",
      "commit:Maps/setInitialZoom",
      "commit:setFocusedSlug",
      "source.setLoader",
      "source.clear",
      "commit:setLayerStatus",
      // zweiter Klick: gleiche Kommune, kein Fokus, ein Loader mit URL
      "commit:setSelected",
      "dispatch:applySelection",
      "commit:setAppliedSignature",
      "source.setLoader",
      "source.refresh",
      "source.clear", // ol refresh() = clear(true) + Neuladen beim Rendern
      "commit:setLayerStatus",
    ]);
    expect(w.swapView).toHaveBeenCalledTimes(1);
    expect(w.swapView.mock.results[0].value).toMatchObject({ unchanged: true });
  });

  it("Zielwerte Köln: Stufe 1 (52,92 m/px), Zentrum im lokalen CRS, Startansicht gerundet", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    const center = transform(kommune("koeln").map.center, "EPSG:4326", "EPSG:25832");
    expect(w.view.animate).toHaveBeenCalledWith({ center, resolution: RESOLUTIONS[1], duration: 300 }, expect.any(Function));
    expect(w.root["Maps/initialCenter"]).toEqual(center.map(Math.round));
    expect(w.root["Maps/initialZoom"]).toBe(1);
    expect(w.state.focusedSlug).toBe("koeln");
    expect(w.state.appliedSignature).toBe("koeln|");
  });

  it("Berlin aus 3857: View-Austausch auf EPSG:25833, Stufe 0, activeCrs lokal", () => {
    const w = makeWorld({ viewCode: "EPSG:3857", activeCrs: "EPSG:3857" });
    w.click({ kommuneSlug: "berlin" });
    expect(w.log).toContain("swapView:EPSG:3857->EPSG:25833");
    expect(w.log.indexOf("swapView:EPSG:3857->EPSG:25833")).toBeLessThan(w.log.indexOf("animate:EPSG:25833"));
    expect(w.crsState).toMatchObject({ localCrs: "EPSG:25833", activeCrs: "EPSG:25833", lastError: null });
    expect(w.root["Maps/initialZoom"]).toBe(0);
    expect(w.view.animate.mock.calls[0][0].center).toEqual(transform(kommune("berlin").map.center, "EPSG:4326", "EPSG:25833"));
  });

  it("San Francisco nach Köln: EPSG:32610, Stufe 2", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kommuneSlug: "san-francisco" });
    expect(w.view.code).toBe("EPSG:32610");
    expect(w.root["Maps/initialZoom"]).toBe(2);
    expect(w.state.focusedSlug).toBe("san-francisco");
  });

  it("Bonn nach Köln: kein View-Austausch, neuer Zoom auf Stufe 2", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kommuneSlug: "bonn" });
    expect(w.log.filter((l: string) => l.startsWith("swapView"))).toEqual([]);
    expect(w.view.animate).toHaveBeenCalledTimes(2);
    expect(w.view.animate.mock.calls[1][0].resolution).toBe(RESOLUTIONS[2]);
  });

  it("Abwahl der Kommune: Layer leer, localCrs und View bleiben, erneute Wahl zoomt wieder", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "berlin" });
    w.click({ kommuneSlug: "berlin" });
    expect(w.state.focusedSlug).toBeNull();
    expect(w.state.layerStatus).toBe("idle");
    expect(w.crsState.localCrs).toBe("EPSG:25833");
    expect(w.view.code).toBe("EPSG:25833");
    w.click({ kommuneSlug: "berlin" });
    expect(w.view.animate).toHaveBeenCalledTimes(2);
  });

  it("gleiche Signatur wird nicht erneut angewendet", () => {
    const w = makeWorld();
    const next = { kommuneSlug: "koeln", kategorieSlug: null, kommune: kommune("koeln"), kategorie: null };
    w.actions.applySelection(w.context, next);
    const n = w.log.length;
    w.actions.applySelection(w.context, next);
    expect(w.log.length).toBe(n);
  });

  it("synchron trotz Promise-dispatch: nach select steht der Loader schon", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    // kein await: Wirkung von setLocalCrs/activateLocal/animate/setLoader liegt bereits vor
    expect(w.state.layerStatus).toBe("loading");
    w.render();
    expect(w.calls.map((c: any) => c.url)).toEqual([urlFor("koeln", "friedhoefe")]);
  });
});

describe("applySelection: Layer", () => {
  it("Köln und Friedhöfe: genau ein Request, Status ready mit Anzahl", async () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    w.render();
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(w.calls[0].url)).toContain("wp_name%3D'de-K%C3%B6ln'%20AND%20container_type%3D'cemetery'%20AND%20osm_admin_level%3D8");
    w.calls[0].resolve({ ok: true, status: 200, json: async () => fc(3) });
    await flush();
    expect(w.state).toMatchObject({ layerStatus: "ready", featureCount: 3, layerError: null });
    expect(w.source.getFeatures()).toHaveLength(3);
  });

  it("Kommunenwechsel mit gewählter Kategorie: ein Loader-Aufruf mit der neuen Projektion", () => {
    const w = makeWorld();
    w.click({ kategorieSlug: "friedhoefe" });
    w.click({ kommuneSlug: "koeln" });
    w.render();
    w.click({ kommuneSlug: "berlin" });
    w.render();
    expect(w.calls.map((c: any) => c.url)).toEqual([urlFor("koeln", "friedhoefe"), urlFor("berlin", "friedhoefe")]);
    expect(w.debug.mock.calls.filter((c: any[]) => c[0] === "request").map((c: any[]) => c[1].projection)).toEqual([
      "EPSG:25832",
      "EPSG:25833",
    ]);
  });

  it("Wettlauf: die letzte Auswahl gewinnt, verspätete Antwort fügt nichts ein", async () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    w.click({ kategorieSlug: "baume" });
    w.render();
    w.calls[1].resolve({ ok: true, status: 200, json: async () => fc(1) });
    await flush();
    w.calls[0].resolve({ ok: true, status: 200, json: async () => fc(7) });
    await flush();
    expect(w.source.getFeatures()).toHaveLength(1);
    expect(w.state).toMatchObject({ layerStatus: "ready", featureCount: 1 });
  });

  it("Kategorie abwählen: Layer leer, kein Fehler", async () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    w.calls[0].resolve({ ok: true, status: 200, json: async () => fc(2) });
    await flush();
    w.click({ kategorieSlug: "friedhoefe" });
    expect(w.source.getFeatures()).toHaveLength(0);
    expect(w.state).toMatchObject({ layerStatus: "idle", layerError: null });
    expect(w.alerts).toEqual([]);
  });

  it("leere Antwort: Status empty, kein Alerting", async () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "kronshagen" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    w.calls[0].resolve({ ok: true, status: 200, json: async () => fc(0) });
    await flush();
    expect(w.state.layerStatus).toBe("empty");
    expect(w.alerts).toEqual([]);
  });

  it("HTTP-Fehler: Status error, Alerting error mit maskiertem Inhalt; erneutes Anklicken lädt wieder", async () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    w.calls[0].resolve({ ok: false, status: 502, json: async () => ({}) });
    await flush();
    expect(w.state).toMatchObject({ layerStatus: "error", layerError: "HTTP 502", appliedSignature: null });
    expect(w.alerts).toEqual([
      {
        category: "error",
        title: "additional:modules.p2d2Selector.alertTitle",
        content: "Köln · Friedhöfe: HTTP 502",
        mustBeConfirmed: false,
      },
    ]);
    // Abwählen und wieder anklicken (zweiter Klick hebt auf)
    w.click({ kategorieSlug: "friedhoefe" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    expect(w.calls).toHaveLength(2);
    w.calls[1].resolve({ ok: true, status: 200, json: async () => fc(2) });
    await flush();
    expect(w.state).toMatchObject({ layerStatus: "ready", featureCount: 2 });
  });

  it("nach Fehler wird dieselbe Signatur wieder angewendet", async () => {
    const w = makeWorld();
    const next = { kommuneSlug: "koeln", kategorieSlug: "friedhoefe", kommune: kommune("koeln"), kategorie: kategorie("friedhoefe") };
    w.actions.applySelection(w.context, next);
    w.render();
    w.calls[0].resolve({ ok: false, status: 500, json: async () => ({}) });
    await flush();
    w.actions.applySelection(w.context, next);
    w.render();
    expect(w.calls).toHaveLength(2);
  });
});

describe("applySelection: Fehler vor dem Laden", () => {
  it("Stage-Werte fehlen: error mit dem Text aus loadStage, Alerting, kein Request", () => {
    const w = makeWorld();
    w.state.stage = null;
    w.state.stageError = "p2d2-editor-config: layers.p2d2-geo-containers.proxyPath fehlt oder ist leer";
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.state.layerStatus).toBe("error");
    expect(w.state.layerError).toBe(w.state.stageError);
    expect(w.alerts).toHaveLength(1);
  });

  it("Layer nicht in der Karte: error", () => {
    const w = makeWorld({ withLayer: false });
    w.click({ kommuneSlug: "koeln" });
    expect(w.state.layerError).toBe("Layer p2d2-geo-containers nicht gefunden");
    expect(w.alerts).toHaveLength(1);
  });

  it("lokales CRS nicht setzbar: error, View bleibt, kein Zoom, Layer geleert, Fokus nicht gesetzt", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    w.render();
    const bad = { ...kommune("bonn"), slug: "x", map: { ...kommune("bonn").map, projection: "EPSG:3857" } };
    const animations = w.view.animate.mock.calls.length;
    w.actions.applySelection(w.context, { kommuneSlug: "x", kategorieSlug: "friedhoefe", kommune: bad, kategorie: kategorie("friedhoefe") });
    expect(w.state.layerError).toBe("lokales CRS EPSG:3857 nicht verfügbar");
    expect(w.view.code).toBe("EPSG:25832");
    expect(w.view.animate.mock.calls.length).toBe(animations);
    expect(w.state.focusedSlug).toBe("koeln");
    expect(w.state.appliedSignature).toBeNull();
    expect(w.source.getFeatures()).toHaveLength(0);
    expect(w.calls[0].url).toBe(urlFor("koeln", "friedhoefe"));
  });

  it("ohne Add-on p2d2Crs: error statt Zoom", () => {
    const w = makeWorld({ crsAddon: false });
    w.click({ kommuneSlug: "berlin" });
    expect(w.state.layerStatus).toBe("error");
    expect(w.view.animate).not.toHaveBeenCalled();
  });

  it("3D: error, keine Dispatches an p2d2Crs", () => {
    const w = makeWorld({ mode: "3D" });
    w.click({ kommuneSlug: "koeln" });
    expect(w.state.layerError).toBe("Kommunenwahl nur in der 2D-Karte");
    expect(w.log.some((l: string) => l.includes("P2d2Crs"))).toBe(false);
  });
});

describe("Debug-Ausgabe", () => {
  it("Signatur, URL, Fokus und View nach der Animation", () => {
    const w = makeWorld();
    w.click({ kommuneSlug: "koeln" });
    w.click({ kategorieSlug: "friedhoefe" });
    const events = w.debug.mock.calls.map((c: any[]) => c[0]);
    expect(events).toEqual(["selection", "view", "focus", "selection", "load"]);
    const view = w.debug.mock.calls.find((c: any[]) => c[0] === "view")[1];
    expect(view).toEqual({
      projection: "EPSG:25832",
      resolution: RESOLUTIONS[1],
      center: transform(kommune("koeln").map.center, "EPSG:4326", "EPSG:25832"),
    });
    expect(w.debug.mock.calls.find((c: any[]) => c[0] === "focus")[1]).toMatchObject({
      slug: "koeln",
      projection: "EPSG:25832",
      zoom: 11,
      zoomResolution: 76.35146091935201,
      stage: 1,
      resolution: RESOLUTIONS[1],
    });
    expect(w.debug.mock.calls.find((c: any[]) => c[0] === "load")[1]).toMatchObject({
      signature: "koeln|friedhoefe",
      url: urlFor("koeln", "friedhoefe"),
    });
  });

  it("debugEnabled nur bei p2d2debug=1; createDebug ohne Schalter ohne Ausgabe", () => {
    expect(debugEnabled("?p2d2debug=1")).toBe(true);
    expect(debugEnabled("?a=1&p2d2debug=1")).toBe(true);
    expect(debugEnabled("p2d2debug=1")).toBe(true);
    for (const s of ["", "?p2d2debug=0", "?p2d2debug=true", "?p2d2debug", undefined]) expect(debugEnabled(s as any)).toBe(false);
    const log = vi.fn();
    createDebug({ enabled: false, log })("x", { a: 1 });
    expect(log).not.toHaveBeenCalled();
    createDebug({ enabled: true, log })("request", { url: "/u" });
    expect(log).toHaveBeenCalledWith(DEBUG_PREFIX, "request", { url: "/u" });
    expect(DEBUG_PREFIX).toBe("[p2d2Selector]");
  });
});

describe("loadStage", () => {
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
  const make = (fetch: any) => {
    const state: any = { ...baseState };
    const ctx = { state, commit: (t: string, p: unknown) => (mutations as any)[t](state, p) };
    return { ctx, actions: createActions({ url: "u", stageUrl: "./resources/p2d2-editor-config.json", layerId: LAYER_ID, fetch }) as any };
  };

  it("liest wfsBase, typeName, proxyPath aus der Stage-Konfiguration", async () => {
    const fetch = vi.fn(ok(readJson("p2d2-editor-config.json")));
    const { ctx, actions } = make(fetch);
    await actions.loadStage(ctx);
    expect(fetch).toHaveBeenCalledWith("./resources/p2d2-editor-config.json", { cache: "no-cache" });
    expect(ctx.state).toMatchObject({ stage: STAGE, stageStatus: "ready", stageError: null });
  });

  it("fehlender Schlüssel oder HTTP-Fehler: stageStatus error mit Text, kein Standard", async () => {
    const cfg = readJson("p2d2-editor-config.json");
    delete cfg.layers[LAYER_ID].wfsBase;
    const a = make(ok(cfg));
    await a.actions.loadStage(a.ctx);
    expect(a.ctx.state).toMatchObject({ stage: null, stageStatus: "error" });
    expect(a.ctx.state.stageError).toMatch(/wfsBase fehlt/);
    const b = make(async () => ({ ok: false, status: 404, json: vi.fn() }));
    await b.actions.loadStage(b.ctx);
    expect(b.ctx.state.stageError).toMatch(/HTTP 404/);
  });
});

describe("escapeHtml", () => {
  it("maskiert HTML für den Alerting-Inhalt (v-html)", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
    expect(escapeHtml("Köln · Friedhöfe: HTTP 502")).toBe("Köln · Friedhöfe: HTTP 502");
  });
});
