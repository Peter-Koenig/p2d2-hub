// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für p2d2Selector/js/layerControl.js (Loader des Auswahl-Layers)
//
// Echte ol/source/Vector aus dem p2d2-Repository; "Rendern" ist ein Aufruf von
// source.loadFeatures wie im Canvas-Renderer (ol/renderer/canvas/VectorLayer.js).
// fetch ist ein Fake mit zurückgehaltenen Antworten, damit die Reihenfolge
// eines Wettlaufs steuerbar ist. Kein Netzwerk, kein DOM.
import { describe, it, expect, vi, beforeAll } from "vitest";
import proj4 from "proj4";
import { register } from "ol/proj/proj4.js";
import { get as getProjection, transform } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";
import GeoJSON from "ol/format/GeoJSON.js";
import { VOID } from "ol/functions.js";
import { utmDefinition } from "../../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import { isRemoteSource } from "../../supplement/masterportal/addons/p2d2Crs/js/viewSwap.js";
import { createLayerControl } from "../../supplement/masterportal/addons/p2d2Selector/js/layerControl.js";

beforeAll(() => {
  for (const code of ["EPSG:25832", "EPSG:25833"]) proj4.defs(code, utmDefinition(code)!);
  register(proj4);
});

const URL_A = "/api/wfs-proxy?url=A";
const URL_B = "/api/wfs-proxy?url=B";
const DOM = new GeoJSON();
const readFeatures = (json: any, featureProjection: any) =>
  DOM.readFeatures(json, { dataProjection: "EPSG:4326", featureProjection });

const collection = (name: string, n = 1, lon = 6.96) => ({
  type: "FeatureCollection",
  features: Array.from({ length: n }, (_, i) => ({
    type: "Feature",
    id: `${name}.${i}`,
    properties: { name: `${name}-${i}` },
    geometry: { type: "Point", coordinates: [lon, 50.94] },
  })),
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

type Pending = { url: string; signal: AbortSignal; resolve: (v: any) => void; reject: (e: any) => void };

/** fetch-Fake: hält jede Antwort zurück; honorAbort wie der Browser (Abbruch → AbortError). */
const makeFetch = ({ honorAbort = true } = {}) => {
  const calls: Pending[] = [];
  const fetch = vi.fn((url: string, { signal }: { signal: AbortSignal }) =>
    new Promise((resolve, reject) => {
      calls.push({ url, signal, resolve, reject });
      if (honorAbort) {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }
    }),
  );
  return { fetch, calls };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const render = (source: VectorSource, code = "EPSG:25832") =>
  source.loadFeatures([-1e7, -1e7, 1e7, 1e7], 10, getProjection(code)!);
const names = (source: VectorSource) => source.getFeatures().map((f) => f.get("name")).sort();

const setup = (opts: { honorAbort?: boolean } = {}) => {
  const { fetch, calls } = makeFetch(opts);
  const debug = vi.fn();
  const control = createLayerControl({ fetch, readFeatures, debug });
  // Wie masterportalapi layer/vector.js createVectorSource ohne url und ohne geojson.
  const source = new VectorSource({ loader: undefined, features: undefined, url: undefined, strategy: undefined, format: new GeoJSON() } as any);
  const statuses: any[] = [];
  const onStatus = (e: any) => statuses.push(e);
  return { fetch, calls, debug, control, source, statuses, onStatus };
};

describe("leere Quelle (GeoJSON-Eintrag ohne url, Report 017 A)", () => {
  it("ohne url und geojson: kein Loader, keine Features, Rendern lädt nichts", () => {
    const { source, fetch } = setup();
    expect((source as any).loader_).toBe(VOID);
    expect(isRemoteSource(source)).toBe(false);
    expect(() => render(source)).not.toThrow();
    expect(source.getFeatures()).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mit eigenem Loader zählt die Quelle für swapView als nachladbar", () => {
    const { source, control, onStatus } = setup();
    control.load(source, URL_A, onStatus);
    expect(isRemoteSource(source)).toBe(true);
    control.load(source, null, onStatus);
    expect(isRemoteSource(source)).toBe(true); // leerer Loader, refresh bleibt harmlos
  });
});

describe("load(url)", () => {
  it("lädt erst beim Rendern, genau ein Request, Features in der View-Projektion", async () => {
    const { source, control, calls, statuses, onStatus } = setup();
    control.load(source, URL_A, onStatus);
    expect(calls).toHaveLength(0);
    render(source, "EPSG:25832");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL_A);
    calls[0].resolve(response(collection("a", 3)));
    await flush();
    expect(source.getFeatures()).toHaveLength(3);
    const coords = (source.getFeatures()[0].getGeometry() as any).getCoordinates();
    const expected = transform([6.96, 50.94], "EPSG:4326", "EPSG:25832");
    expect(coords[0]).toBeCloseTo(expected[0], 6);
    expect(coords[1]).toBeCloseTo(expected[1], 6);
    expect(statuses.map((s) => s.status)).toEqual(["loading", "loading", "ready"]);
    expect(statuses.at(-1)).toEqual({ status: "ready", count: 3 });
  });

  it("Loader-Vertrag: gibt nichts zurück (kein Promise), success genau einmal", async () => {
    const { control, calls, onStatus } = setup();
    let loader: any = null;
    const fake = { setLoader: (l: any) => (loader = l), refresh: vi.fn(), clear: vi.fn(), addFeatures: vi.fn() };
    control.load(fake, URL_A, onStatus);
    expect(loader.length).toBe(5);
    const success = vi.fn();
    const failure = vi.fn();
    expect(loader([0, 0, 1, 1], 1, getProjection("EPSG:25832"), success, failure)).toBeUndefined();
    calls[0].resolve(response(collection("a", 2)));
    await flush();
    expect(success).toHaveBeenCalledTimes(1);
    expect(success.mock.calls[0][0]).toHaveLength(2);
    expect(failure).not.toHaveBeenCalled();
    expect(fake.addFeatures).toHaveBeenCalledTimes(1);
  });

  it("ein Wechsel vor dem Rendern erzeugt genau einen Request mit der neuen URL und Projektion", async () => {
    const { source, control, calls, onStatus, debug } = setup();
    control.load(source, URL_A, onStatus);
    // swapView ruft refresh() auf der Quelle (reprojectLayers), danach setzt der Selektor den neuen Loader.
    source.refresh();
    control.load(source, URL_B, onStatus);
    render(source, "EPSG:25833");
    expect(calls.map((c) => c.url)).toEqual([URL_B]);
    expect(debug).toHaveBeenCalledWith("request", { url: URL_B, projection: "EPSG:25833" });
    calls[0].resolve(response(collection("b", 1, 13.4)));
    await flush();
    expect(names(source)).toEqual(["b-0"]);
  });
});

describe("Wettlauf: die letzte Auswahl gewinnt", () => {
  it("verspätete Antwort der alten Auswahl fügt nichts ein (Server antwortet trotz Abbruch)", async () => {
    const { source, control, calls, statuses, onStatus } = setup({ honorAbort: false });
    control.load(source, URL_A, onStatus);
    render(source);
    control.load(source, URL_B, onStatus);
    render(source);
    expect(calls.map((c) => c.url)).toEqual([URL_A, URL_B]);
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    calls[1].resolve(response(collection("b", 2)));
    await flush();
    calls[0].resolve(response(collection("a", 5)));
    await flush();
    expect(names(source)).toEqual(["b-0", "b-1"]);
    expect(statuses.at(-1)).toEqual({ status: "ready", count: 2 });
  });

  it("gleiches gilt, wenn die alte Antwort zuerst kommt", async () => {
    const { source, control, calls, onStatus } = setup({ honorAbort: false });
    control.load(source, URL_A, onStatus);
    render(source);
    control.load(source, URL_B, onStatus);
    render(source);
    calls[0].resolve(response(collection("a", 5)));
    await flush();
    expect(source.getFeatures()).toHaveLength(0);
    calls[1].resolve(response(collection("b", 1)));
    await flush();
    expect(names(source)).toEqual(["b-0"]);
  });

  it("veraltete Fehlerantwort meldet keinen Fehler (Prüfung nach fetch)", async () => {
    const { source, control, calls, statuses, onStatus } = setup({ honorAbort: false });
    const failure = vi.fn();
    source.on("featuresloaderror", failure);
    control.load(source, URL_A, onStatus);
    render(source);
    control.load(source, URL_B, onStatus);
    render(source);
    const json = vi.fn(async () => ({}));
    calls[0].resolve({ ok: false, status: 500, json });
    await flush();
    expect(statuses.some((s) => s.status === "error")).toBe(false);
    expect(failure).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("Wechsel, während der Rumpf noch gelesen wird, fügt nichts ein (Prüfung nach json)", async () => {
    const { source, control, calls, statuses, onStatus } = setup({ honorAbort: false });
    control.load(source, URL_A, onStatus);
    render(source);
    let release: (v: unknown) => void = () => undefined;
    calls[0].resolve({ ok: true, status: 200, json: () => new Promise((r) => (release = r)) });
    await flush();
    control.load(source, URL_B, onStatus);
    render(source);
    release(collection("a", 4));
    await flush();
    expect(source.getFeatures()).toHaveLength(0);
    expect(statuses.at(-1).status).toBe("loading");
  });

  it("Abbruch im Browser (AbortError) ist kein Fehler", async () => {
    const { source, control, calls, statuses, onStatus } = setup();
    const errorEvents = vi.fn();
    source.on("featuresloaderror", errorEvents);
    control.load(source, URL_A, onStatus);
    render(source);
    control.load(source, URL_B, onStatus);
    render(source);
    await flush();
    expect(statuses.some((s) => s.status === "error")).toBe(false);
    expect(errorEvents).not.toHaveBeenCalled();
    calls[1].resolve(response(collection("b", 1)));
    await flush();
    expect(names(source)).toEqual(["b-0"]);
  });

  it("Neuladen nach Projektionswechsel (refresh) verwirft die Antwort in der alten Projektion", async () => {
    const { source, control, calls, onStatus } = setup({ honorAbort: false });
    control.load(source, URL_A, onStatus);
    render(source, "EPSG:25832");
    source.refresh(); // swapView → reprojectLayers
    render(source, "EPSG:3857");
    expect(calls).toHaveLength(2);
    calls[0].resolve(response(collection("alt", 1)));
    calls[1].resolve(response(collection("neu", 1)));
    await flush();
    expect(names(source)).toEqual(["neu-0"]);
    const x = (source.getFeatures()[0].getGeometry() as any).getCoordinates()[0];
    expect(x).toBeCloseTo(transform([6.96, 50.94], "EPSG:4326", "EPSG:3857")[0], 6);
  });
});

describe("load(null): Abwahl", () => {
  it("leert den Layer, Rendern lädt nichts, Status idle", async () => {
    const { source, control, calls, statuses, onStatus } = setup();
    control.load(source, URL_A, onStatus);
    render(source);
    calls[0].resolve(response(collection("a", 2)));
    await flush();
    expect(source.getFeatures()).toHaveLength(2);
    control.load(source, null, onStatus);
    expect(source.getFeatures()).toHaveLength(0);
    render(source);
    expect(calls).toHaveLength(1);
    expect(statuses.at(-1)).toEqual({ status: "idle" });
  });

  it("eine laufende Anfrage fügt nach der Abwahl nichts mehr ein", async () => {
    const { source, control, calls, onStatus } = setup({ honorAbort: false });
    control.load(source, URL_A, onStatus);
    render(source);
    control.load(source, null, onStatus);
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve(response(collection("a", 2)));
    await flush();
    expect(source.getFeatures()).toHaveLength(0);
  });
});

describe("Fehler und leere Antwort", () => {
  const run = async (answer: (p: Pending) => void) => {
    const ctx = setup();
    const errorEvents = vi.fn();
    ctx.source.on("featuresloaderror", errorEvents);
    ctx.control.load(ctx.source, URL_A, ctx.onStatus);
    render(ctx.source);
    answer(ctx.calls[0]);
    await flush();
    return { ...ctx, errorEvents };
  };

  it("HTTP 500 → failure (featuresloaderror) und Status error", async () => {
    const r = await run((p) => p.resolve(response({ type: "ExceptionReport" }, 500)));
    expect(r.statuses.at(-1)).toEqual({ status: "error", error: "HTTP 500" });
    expect(r.errorEvents).toHaveBeenCalledTimes(1);
    expect(r.source.getFeatures()).toHaveLength(0);
  });

  it("200 ohne FeatureCollection (z. B. Exception als JSON) → error", async () => {
    const r = await run((p) => p.resolve(response({ exceptions: [{ code: "InvalidParameterValue" }] })));
    expect(r.statuses.at(-1)).toEqual({ status: "error", error: "Antwort ist keine FeatureCollection" });
    expect(r.errorEvents).toHaveBeenCalledTimes(1);
  });

  it("Rumpf kein JSON (XML-Exception) → error mit Meldung", async () => {
    const r = await run((p) =>
      p.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'"); } }),
    );
    expect(r.statuses.at(-1).status).toBe("error");
    expect(r.statuses.at(-1).error).toMatch(/Unexpected token/);
  });

  it("Netzwerkfehler → error", async () => {
    const r = await run((p) => p.reject(new TypeError("Failed to fetch")));
    expect(r.statuses.at(-1)).toEqual({ status: "error", error: "Failed to fetch" });
  });

  it("0 Features → empty, kein Fehler", async () => {
    const r = await run((p) => p.resolve(response(collection("x", 0))));
    expect(r.statuses.at(-1)).toEqual({ status: "empty", count: 0 });
    expect(r.errorEvents).not.toHaveBeenCalled();
  });

  it("nach einem Fehler lädt dieselbe URL erneut (keine hängende Signatur)", async () => {
    const r = await run((p) => p.resolve(response({}, 503)));
    expect(r.statuses.at(-1).status).toBe("error");
    r.control.load(r.source, URL_A, r.onStatus);
    render(r.source);
    expect(r.calls).toHaveLength(2);
    r.calls[1].resolve(response(collection("a", 1)));
    await flush();
    expect(r.statuses.at(-1)).toEqual({ status: "ready", count: 1 });
  });
});

describe("Debug-Ausgabe", () => {
  it("Request-URL, Projektion, HTTP-Status und Zahl der Features", async () => {
    const { source, control, calls, debug, onStatus } = setup();
    control.load(source, URL_A, onStatus);
    render(source, "EPSG:25832");
    calls[0].resolve(response(collection("a", 4)));
    await flush();
    expect(debug.mock.calls).toEqual([
      ["request", { url: URL_A, projection: "EPSG:25832" }],
      ["response", { status: 200, current: true }],
      ["features", { count: 4, projection: "EPSG:25832" }],
    ]);
  });
});
