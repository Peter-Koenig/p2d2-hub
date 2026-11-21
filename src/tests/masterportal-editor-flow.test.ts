// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Ablauftest Masterportal-Add-on p2d2FeatureEditor (clickFlow.js, editorConfig.js)
//
// Reine Module ohne DOM, OL und Vue. Abfrage, Fenster und Zeitgeber werden
// als Fakes injiziert. Kein Netzwerk, keine DB.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createClickFlow,
  zoomTarget,
} from "../../supplement/masterportal/addons/p2d2FeatureEditor/js/clickFlow.js";
import { validateConfig } from "../../supplement/masterportal/addons/p2d2FeatureEditor/js/editorConfig.js";

const ROOT = resolve(__dirname, "../..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const CFG_FILE = JSON.parse(
  read("supplement/masterportal/portal/resources/p2d2-editor-config.json"),
);
const LAYER_ID = "p2d2-geo-containers";
const LAYERS: Record<string, any> = validateConfig(CFG_FILE);
const LC = LAYERS[LAYER_ID];

const DEUTZ = {
  name: "Deutzer Friedhof",
  admin_name: "Deutz",
  container_type: "cemetery",
  wp_name: "de-Köln",
  osm_admin_level: 8,
};
const LOEVENICH = { ...DEUTZ, name: "Friedhof Lövenich", admin_name: null };
const CTX = {
  extentWGS84: [6.98, 50.93, 6.99, 50.94],
  projection: "EPSG:25832",
};

type Pending = {
  url: string;
  signal: AbortSignal;
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

/** Fakes für alle injizierten Abhängigkeiten. */
function makeDeps(opts: { window?: any } = {}) {
  const fetches: Pending[] = [];
  const opened: { url: string; name: string; features: string }[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const deps = {
    fetchJson: (url: string, signal: AbortSignal) =>
      new Promise<any>((resolve, reject) => {
        const p: Pending = { url, signal, resolve, reject };
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
        fetches.push(p);
      }),
    openWindow: (url: string, name: string, features: string) => {
      opened.push({ url, name, features });
      return "window" in opts ? opts.window : { closed: false };
    },
    setTimer: (fn: () => void, ms: number) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
  };
  const fireTimers = () => {
    for (const [id, t] of [...timers]) {
      timers.delete(id);
      t.fn();
    }
  };
  return { deps, fetches, opened, timers, fireTimers };
}

// Testsicht auf den Ablauf (Ergebnisse untypisiert, Felder werden geprüft).
const flowOf = (deps: unknown) =>
  createClickFlow(deps as any) as { handle: (args: any) => Promise<any> };

const hits = (n: number) => ({ status: 200, body: { type: "FeatureCollection", features: Array(n).fill({}) } });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("validateConfig", () => {
  it("die Stage-Konfiguration ist gültig und enthält den Friedhofs-Layer", () => {
    expect(Object.keys(LAYERS)).toEqual([LAYER_ID]);
    expect(LC.checkTimeoutMs).toBe(3000);
    expect(LC.children).toEqual({ level: 10, separator: "-", prefixFields: ["admin_name", "name"] });
    expect(LC.editor.windowFeatures).toBe(
      "width=1200,height=800,resizable=yes,scrollbars=yes,location=yes",
    );
    expect(LC.zoom.padding).toBe(30);
    expect(LC.zoom.durationMs).toBe(300);
  });

  it("windowFeatures mit noopener oder noreferrer wird abgelehnt (Editor braucht window.opener)", () => {
    for (const bad of [
      "width=1200,height=800,noopener",
      "noreferrer,width=1200",
      "width=1200, NoOpener",
      "width=1200,NOREFERRER=yes",
    ]) {
      const c = JSON.parse(JSON.stringify(CFG_FILE));
      c.layers[LAYER_ID].editor.windowFeatures = bad;
      expect(() => validateConfig(c), bad).toThrow(/noopener|noreferrer/);
    }
  });

  it("fehlende oder falsch typisierte Pflichtschlüssel werfen", () => {
    const clone = () => JSON.parse(JSON.stringify(CFG_FILE));
    const mutations: ((c: any) => void)[] = [
      (c) => delete c.layers,
      (c) => (c.layers = {}),
      (c) => delete c.layers[LAYER_ID].wfsBase,
      (c) => (c.layers[LAYER_ID].wfsBase = "https://x/ows?a=1"),
      (c) => delete c.layers[LAYER_ID].typeName,
      (c) => delete c.layers[LAYER_ID].proxyPath,
      (c) => (c.layers[LAYER_ID].checkTimeoutMs = "3000"),
      (c) => (c.layers[LAYER_ID].checkTimeoutMs = 0),
      (c) => delete c.layers[LAYER_ID].children,
      (c) => (c.layers[LAYER_ID].children.level = "10"),
      (c) => (c.layers[LAYER_ID].children.separator = ""),
      (c) => (c.layers[LAYER_ID].children.prefixFields = []),
      (c) => (c.layers[LAYER_ID].children.prefixFields = ["name", 3]),
      (c) => delete c.layers[LAYER_ID].editor.windowNamePrefix,
      (c) => delete c.layers[LAYER_ID].editor.windowFeatures,
      (c) => delete c.layers[LAYER_ID].zoom.padding,
      (c) => (c.layers[LAYER_ID].zoom.durationMs = -1),
      (c) => delete c.layers[LAYER_ID].zoom.minZoom,
      (c) => (c.layers[LAYER_ID].zoom.maxZoom = c.layers[LAYER_ID].zoom.minZoom - 1),
      (c) => (c.layers[LAYER_ID].info.fields = []),
      (c) => (c.layers[LAYER_ID].info.fields = [{ key: "name" }]),
      (c) => delete c.layers[LAYER_ID].info.texts.noChildren,
      (c) => delete c.layers[LAYER_ID].info.texts.popupBlocked,
      (c) => delete c.layers[LAYER_ID].info.texts.checkTimeout,
      (c) => delete c.layers[LAYER_ID].info.texts.checkFailed,
      (c) => delete c.layers[LAYER_ID].info.texts.openEditor,
    ];
    mutations.forEach((m, i) => {
      const c = clone();
      m(c);
      expect(() => validateConfig(c), `Mutation ${i}`).toThrow();
    });
  });
});

describe("clickFlow", () => {
  it("1. Treffer und Fenster → opened", async () => {
    const { deps, fetches, opened } = makeDeps();
    const flow = flowOf(deps);
    const p = flow.handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    expect(fetches).toHaveLength(1);
    fetches[0].resolve(hits(1));
    const r = await p;
    expect(r.action).toBe("opened");
    expect(opened).toHaveLength(1);
    expect(opened[0].url).toBe(r.editorUrl);
    expect(opened[0].name).toBe(`feature-editor-${encodeURIComponent(DEUTZ.name)}`);
    expect(opened[0].features).toBe(LC.editor.windowFeatures);
    const u = new URL(r.editorUrl, "http://x.invalid");
    expect(u.pathname).toBe(`/feature-editor/${encodeURIComponent(DEUTZ.name)}`);
    expect(u.searchParams.get("container_type")).toBe("cemetery");
    expect(u.searchParams.get("osm_admin_level")).toBe("8");
    expect(u.searchParams.get("projection")).toBe("EPSG:25832");
  });

  it("2. keine Treffer → info/no-children, kein Fenster", async () => {
    const { deps, fetches, opened } = makeDeps();
    const p = flowOf(deps).handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    fetches[0].resolve(hits(0));
    const r = await p;
    expect(r).toMatchObject({ action: "info", reason: "no-children" });
    expect(opened).toHaveLength(0);
  });

  it("3. openWindow liefert null → info/popup-blocked mit Editor-URL", async () => {
    const { deps, fetches, opened } = makeDeps({ window: null });
    const p = flowOf(deps).handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    fetches[0].resolve(hits(3));
    const r = await p;
    expect(r).toMatchObject({ action: "info", reason: "popup-blocked" });
    expect(r.editorUrl).toMatch(/^\/feature-editor\//);
    expect(opened).toHaveLength(1);
    expect(r.windowName).toBe(opened[0].name);
    expect(r.windowFeatures).toBe(LC.editor.windowFeatures);
  });

  it("4. Fehler oder Status ≠ 200 → info/check-failed", async () => {
    for (const outcome of [
      (f: Pending) => f.reject(new TypeError("network")),
      (f: Pending) => f.resolve({ status: 500, body: null }),
      (f: Pending) => f.resolve({ status: 403, body: null }),
      (f: Pending) => f.resolve({ status: 200, body: { foo: 1 } }),
    ]) {
      const { deps, fetches, opened } = makeDeps();
      const p = flowOf(deps).handle({ props: DEUTZ, layerConfig: LC, ...CTX });
      await tick();
      outcome(fetches[0]);
      const r = await p;
      expect(r).toMatchObject({ action: "info", reason: "check-failed" });
      expect(opened).toHaveLength(0);
    }
  });

  it("5. Zeitüberschreitung → Abfrage abgebrochen, info/check-timeout mit Editor-URL", async () => {
    const { deps, fetches, opened, timers, fireTimers } = makeDeps();
    const p = flowOf(deps).handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    expect([...timers.values()].map((t) => t.ms)).toEqual([LC.checkTimeoutMs]);
    fireTimers();
    const r = await p;
    expect(fetches[0].signal.aborted).toBe(true);
    expect(r).toMatchObject({ action: "info", reason: "check-timeout" });
    expect(r.editorUrl).toMatch(/^\/feature-editor\//);
    expect(opened).toHaveLength(0);
  });

  it("Timer wird nach einer Antwort aufgeräumt", async () => {
    const { deps, fetches, timers } = makeDeps();
    const p = flowOf(deps).handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    fetches[0].resolve(hits(0));
    await p;
    expect(timers.size).toBe(0);
  });

  it("6. neuer Klick macht den älteren hinfällig (kein spätes Öffnen)", async () => {
    const { deps, fetches, opened } = makeDeps();
    const flow = flowOf(deps);
    const first = flow.handle({ props: DEUTZ, layerConfig: LC, ...CTX });
    await tick();
    const second = flow.handle({ props: LOEVENICH, layerConfig: LC, ...CTX });
    await tick();
    expect(fetches[0].signal.aborted).toBe(true);
    // Auch eine verspätete Antwort auf die erste Abfrage öffnet nichts.
    fetches[0].resolve(hits(5));
    expect((await first).action).toBe("stale");
    fetches[1].resolve(hits(0));
    expect(await second).toMatchObject({ action: "info", reason: "no-children" });
    expect(opened).toHaveLength(0);
  });

  it("7. Präfix: Deutz aus admin_name, null fällt auf name zurück", async () => {
    for (const [props, prefix] of [
      [DEUTZ, "Deutz"],
      [LOEVENICH, "Friedhof Lövenich"],
    ] as const) {
      const { deps, fetches } = makeDeps();
      const p = flowOf(deps).handle({ props, layerConfig: LC, ...CTX });
      await tick();
      const inner = new URL(
        new URL(fetches[0].url, "http://x.invalid").searchParams.get("url")!,
      );
      expect(inner.searchParams.get("CQL_FILTER")).toBe(
        `osm_admin_level=10 AND wp_name='de-Köln' AND container_type='cemetery' AND (name LIKE '${prefix}-%')`,
      );
      expect(fetches[0].url.startsWith(`${LC.proxyPath}?url=`)).toBe(true);
      expect(inner.searchParams.get("typeName")).toBe(LC.typeName);
      fetches[0].resolve(hits(0));
      await p;
    }
  });

  it("8. Hochkommata in name, wp_name und container_type werden verdoppelt", async () => {
    const { deps, fetches } = makeDeps();
    const props = {
      name: "St. Mary's",
      admin_name: null,
      wp_name: "de-O'Ville",
      container_type: "ce'metery",
      osm_admin_level: 8,
    };
    const p = flowOf(deps).handle({ props, layerConfig: LC, ...CTX });
    await tick();
    const cql = new URL(
      new URL(fetches[0].url, "http://x.invalid").searchParams.get("url")!,
    ).searchParams.get("CQL_FILTER")!;
    expect(cql).toBe(
      "osm_admin_level=10 AND wp_name='de-O''Ville' AND container_type='ce''metery' AND (name LIKE 'St. Mary''s-%')",
    );
    fetches[0].resolve(hits(0));
    await p;
  });

  it("unvollständige Properties → info/check-failed ohne Abfrage", async () => {
    const { deps, fetches } = makeDeps();
    const r = await flowOf(deps).handle({
      props: { ...DEUTZ, wp_name: "" },
      layerConfig: LC,
      ...CTX,
    });
    expect(r).toMatchObject({ action: "info", reason: "check-failed" });
    expect(fetches).toHaveLength(0);
  });
});

describe("zoomTarget", () => {
  it("Mittelpunkt und Auflösung mit Padding wie im Standalone", () => {
    const r = zoomTarget({ extent: [0, 0, 1000, 500], size: [560, 560], padding: 30 });
    expect(r.center).toEqual([500, 250]);
    expect(r.resolution).toBeCloseTo(1000 / 500);
  });

  it("ungültige Eingaben werfen", () => {
    expect(() => zoomTarget({ extent: [0, 0, 1, 1], size: [50, 50], padding: 30 })).toThrow();
    expect(() => zoomTarget({ extent: [0, 0], size: [500, 500], padding: 0 } as any)).toThrow();
  });
});
