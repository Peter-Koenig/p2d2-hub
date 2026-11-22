// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Offline-Prüfung der Masterportal-Quelle (supplement/masterportal/portal)
//
// Liest nur Dateien aus dem Repository, kein Netzwerk, keine DB. Prüft die
// Querbezüge zwischen config.js.template, Portal-Konfiguration, services- und
// style-Datei sowie die Regel, dass eigene Dateien nicht auf die Proxy-Regex
// des Masterportal-nginx (config.json, resources/(rest-)services-internet.json)
// passen.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PORTAL = resolve(__dirname, "../../supplement/masterportal/portal");
const RES = join(PORTAL, "resources");
const ADDONS = resolve(__dirname, "../../supplement/masterportal/addons");
const read = (p: string): string => readFileSync(p, "utf8");
const readJson = (p: string): any => JSON.parse(read(p));

const template = read(join(PORTAL, "config.js.template"));
const confValue = (key: string): string | undefined =>
  template.match(new RegExp(`^\\s*${key}:\\s*"([^"]+)"`, "m"))?.[1];

const portalConfPath = confValue("portalConf");
const layerConfPath = confValue("layerConf");
const styleConfPath = confValue("styleConf");
const cfg = readJson(join(PORTAL, portalConfPath ?? "missing"));
const svc: any[] = readJson(join(PORTAL, layerConfPath ?? "missing"));
const styles: any[] = readJson(join(PORTAL, styleConfPath ?? "missing"));
const svcIds = new Set(svc.map((l) => l.id));

// Layer-ID des dynamischen Fachlayers (Auswahl aus dem Add-on p2d2Selector).
const SELECTION_LAYER = "p2d2-geo-containers";

describe("config.js.template", () => {
  it("portalConf und layerConf zeigen auf vorhandene eigene Dateien", () => {
    expect(portalConfPath).toBe("./resources/portal-config-p2d2.json");
    expect(layerConfPath).toBe("./resources/services-p2d2.json");
    for (const p of [portalConfPath!, layerConfPath!, styleConfPath!]) {
      expect(existsSync(join(PORTAL, p)), p).toBe(true);
    }
  });

  it("restConf und styleConf bleiben unverändert", () => {
    expect(confValue("restConf")).toBe(
      "./resources/rest-services-internet.json",
    );
    expect(styleConfPath).toBe("./resources/style_v3.json");
  });

  it("enthält nur die fünf erlaubten Platzhalter", () => {
    const found = new Set(
      [...template.matchAll(/\$\{([A-Z_]+)\}/g)].map((m) => m[1]),
    );
    expect([...found].sort()).toEqual([
      "IAM_REALM",
      "IDM_HOST",
      "INTERCEPTOR_URL_REGEX",
      "OIDC_CLIENT_ID",
      "OIDC_REDIRECT_URI",
    ]);
    expect(template).not.toMatch(/\$\{(?![A-Z_]+\})/);
  });

  it("addons registriert genau p2d2FeatureEditor, p2d2Crs und p2d2Selector", () => {
    const m = template.match(/^\s*addons:\s*\[([^\]]*)\]/m);
    expect(m, "addons-Zeile").not.toBeNull();
    expect(JSON.parse(`[${m![1]}]`)).toEqual(["p2d2FeatureEditor", "p2d2Crs", "p2d2Selector"]);
  });

  it("enthält kein zoomTo (wird in 3.27.1 nur aus portalConfig gelesen)", () => {
    expect(template).not.toMatch(/\bzoomTo\b/);
    expect(template).not.toContain("unterkuenfte_wfs");
  });
});

describe("resources/", () => {
  const files = readdirSync(RES);

  it("keine Datei trifft die Proxy-Regex des nginx", () => {
    for (const f of files) {
      expect(f).not.toMatch(/^(config\.json|(rest-)?services-internet\.json)$/);
    }
  });

  it("alle JSON-Dateien sind gültig", () => {
    for (const f of files.filter((n) => n.endsWith(".json"))) {
      expect(() => readJson(join(RES, f)), f).not.toThrow();
    }
  });
});

describe("Portal-Konfiguration und Layer", () => {
  const mapView = cfg.portalConfig.map.mapView;

  it("alle referenzierten Layer-IDs existieren in der services-Datei", () => {
    const refs: string[] = [
      ...cfg.layerConfig.baselayer.elements.map((e: any) => e.id),
      ...cfg.layerConfig.subjectlayer.elements.map((e: any) => e.id),
      cfg.portalConfig.map.controls.overviewMap.layerId,
    ];
    expect(refs).toEqual(["p2d2-osm", SELECTION_LAYER, "p2d2-osm"]);
    for (const id of refs) expect(svcIds.has(id), id).toBe(true);
  });

  it("TopPlus Open (ID 3) und zoomTo auf nicht vorhandenen Layer sind entfernt", () => {
    expect(svcIds.has("3")).toBe(false);
    expect(JSON.stringify(cfg)).not.toContain("unterkuenfte_wfs");
    expect(cfg.portalConfig.map.zoomTo).toBeUndefined();
  });

  // extent Deutschland mit Rand: Er gilt nur für die Start-View; ohne ihn
  // setzt die masterportalapi ihren Standard-Extent (Raum Hamburg). Herleitung
  // und Prüfung: masterportal-focus-extent.test.ts, README „Stage de1“.
  it("mapView.extent Deutschland; startCenter, startZoomLevel und epsg bleiben", () => {
    expect(mapView.extent).toEqual([222000, 5179000, 1000000, 6177000]);
    expect(mapView.startCenter).toEqual([356560, 5645282]);
    expect(mapView.epsg).toBe("EPSG:25832");
    const levels = mapView.options.map((o: any) => o.zoomLevel);
    expect(levels).toContain(mapView.startZoomLevel);
    expect(mapView.startZoomLevel).toBe(3);
  });

  it("Titel und Logo verweisen auf vorhandene Dateien", () => {
    const title = cfg.portalConfig.mainMenu.title;
    expect(title.text).toBe("p2d2 – Public-Public Data-DNA");
    expect(existsSync(join(PORTAL, title.logo)), title.logo).toBe(true);
    expect(read(join(PORTAL, "index.html"))).toContain(
      "<title>p2d2 – Public-Public Data-DNA</title>",
    );
  });

  it("about-Logo zeigt auf mastercode 3_27_1", () => {
    expect(JSON.stringify(cfg)).toContain(
      "mastercode/3_27_1/img/Logo_Masterportal.svg",
    );
    expect(JSON.stringify(cfg)).not.toContain("3_15_0");
  });

  it("OSM-Layer: MapProxy-WMS p2d2_osm", () => {
    const osm = svc.find((l) => l.id === "p2d2-osm");
    expect(osm).toMatchObject({
      typ: "WMS",
      url: "https://geoportal.udp.data-dna.eu/mapserver/service",
      layers: "p2d2_osm",
    });
  });

  // Ohne url erzeugt die masterportalapi eine leere VectorSource ohne Loader
  // (layer/vector.js createVectorSource); den Loader setzt p2d2Selector.
  it("Auswahl-Layer: GeoJSON ohne url und ohne geojson, neutraler Name, GFI aus, Style vorhanden", () => {
    const layer = svc.find((l) => l.id === SELECTION_LAYER);
    expect(layer.typ).toBe("GeoJSON");
    expect(layer).not.toHaveProperty("url");
    expect(layer).not.toHaveProperty("geojson");
    expect(layer.name).toBe("Auswahl");
    expect(layer.gfiAttributes).toBe("ignore");
    expect(styles.some((s) => s.styleId === layer.styleId)).toBe(true);
    expect(layer.styleId).toBe("p2d2_friedhof");
    expect(styles.some((s) => s.styleId === "unterkuenfte")).toBe(true);
  });

  // isNeverVisibleInTree blendet den Layer im Themenbaum (LayerComponent.vue,
  // LayerTreeNode.vue) und in der Pillenleiste (LayerPills.vue setVisibleLayers)
  // aus; Legende und Suche (visibleVector) werten das Feld nicht aus.
  it("layerConfig: Auswahl-Layer sichtbar, aber nicht im Themenbaum und nicht als Pille", () => {
    const entry = cfg.layerConfig.subjectlayer.elements.find((e: any) => e.id === SELECTION_LAYER);
    expect(entry).toEqual({ id: SELECTION_LAYER, name: "Auswahl", visibility: true, isNeverVisibleInTree: true });
  });

  it("layerPills bleiben aktiv (wirken für andere Fachlayer, z. B. aus addWMS)", () => {
    expect(cfg.portalConfig.map.layerPills).toEqual({ active: true });
  });

  it("der Demo-Layer Friedhöfe Köln ist entfernt", () => {
    expect(svcIds.has("p2d2-geo-containers-koeln")).toBe(false);
    expect(JSON.stringify(cfg)).not.toContain("p2d2-geo-containers-koeln");
    expect(svc.some((l) => typeof l.url === "string" && l.url.includes("wfs-proxy"))).toBe(false);
  });
});

// Liest alle .js-Dateien unter <dir> rekursiv.
const jsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? jsFiles(join(dir, e.name))
      : e.name.endsWith(".js")
        ? [join(dir, e.name)]
        : [],
  );
// Entfernt Block- und Zeilenkommentare (ohne Rücksicht auf Strings; in den
// Add-on-Dateien kommt "//" nur in Kommentaren vor).
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("addons/", () => {
  const conf = readJson(join(ADDONS, "addonsConf.json"));

  it("jeder Schlüssel in addonsConf.json hat addons/<Pfad>/index.js", () => {
    expect(Object.keys(conf).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries<any>(conf)) {
      const dir = typeof value === "object" && value.path ? value.path : key;
      expect(existsSync(join(ADDONS, dir, "index.js")), key).toBe(true);
    }
  });

  it("p2d2FeatureEditor ist vom Typ javascript", () => {
    expect(conf.p2d2FeatureEditor).toEqual({ type: "javascript" });
  });

  describe("p2d2FeatureEditor ohne Friedhofskonstanten", () => {
    const files = jsFiles(join(ADDONS, "p2d2FeatureEditor"));

    it("enthält Einstieg und reine Module", () => {
      const names = files.map((f) => f.slice(ADDONS.length + 1)).sort();
      expect(names).toEqual([
        "p2d2FeatureEditor/index.js",
        "p2d2FeatureEditor/js/clickFlow.js",
        "p2d2FeatureEditor/js/editorConfig.js",
        "p2d2FeatureEditor/js/editorDialog.js",
        "p2d2FeatureEditor/js/editorProjection.js",
        "p2d2FeatureEditor/js/editorUrl.js",
      ]);
    });

    for (const word of ["cemetery", "geo-containers", "wfs-proxy", "osm_admin_level=10"]) {
      it(`kein "${word}" im Code`, () => {
        for (const f of files) {
          expect(stripComments(read(f)), f).not.toContain(word);
        }
      });
    }

    it("kein innerHTML", () => {
      for (const f of files) expect(stripComments(read(f)), f).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    });

    // Isolation vom Cross-Window-Eventmanagement des Standalone: keine Importe
    // aus dem Astro-Code oder @p2d2/core, kein Halbempfänger. Wird eine
    // Empfangs-Bridge gebaut, passt ein eigener Auftrag diesen Test an.
    it("keine Importe aus src/, @/, @p2d2/core oder dem Eventmanagement", () => {
      for (const f of files) {
        const code = stripComments(read(f));
        const imports = [
          ...code.matchAll(/^\s*import\s[\s\S]*?from\s*["']([^"']+)["']/gm),
          ...code.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
          ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
        ];
        for (const m of imports) {
          const statement = m[0];
          const spec = m[1];
          expect(spec, `${f}: ${spec}`).not.toMatch(
            /(^|\/)src\/|^\.\.\/\.\.\/src|^@\/|^@p2d2\/core/,
          );
          expect(statement, `${f}: ${spec}`).not.toMatch(
            /events|cross-window-events|initializeCrossWindowBridge/,
          );
        }
      }
    });

    it("kein postMessage und kein Listener auf message", () => {
      for (const f of files) {
        const code = stripComments(read(f));
        expect(code, f).not.toContain("postMessage");
        expect(code, f).not.toMatch(/addEventListener\(\s*["']message["']|\bonmessage\b/);
      }
    });

    it("window.open genau einmal, mit drei Argumenten (window.opener bleibt erhalten)", () => {
      const calls = files.flatMap((f) =>
        [...stripComments(read(f)).matchAll(/window\.open\(([^)]*)\)/g)].map((m) => m[1]),
      );
      expect(calls).toEqual(["url, name, features"]);
      // Keine rel-Attribute (noopener/noreferrer); die Merkmale prüft validateConfig.
      for (const f of files) {
        expect(stripComments(read(f)), f).not.toMatch(/\brel\s*=|\.rel\b|relList/);
      }
    });
  });
});

describe("p2d2-editor-config.json ↔ services-p2d2.json", () => {
  const editorCfg = readJson(join(RES, "p2d2-editor-config.json"));
  const layers = Object.entries<any>(editorCfg.layers);

  it("jede konfigurierte Layer-ID existiert, GFI ist abgeschaltet", () => {
    expect(layers.map(([id]) => id)).toEqual([SELECTION_LAYER]);
    for (const [id] of layers) {
      const layer = svc.find((l) => l.id === id);
      expect(layer, id).toBeDefined();
      expect(layer.gfiAttributes, id).toBe("ignore");
    }
  });

  // Die URL baut p2d2Selector aus diesen Werten (Vertrag in
  // masterportal-selector-request.test.ts gegen die frühere statische URL).
  it("wfsBase, typeName und proxyPath der Stage de1", () => {
    for (const [id, c] of layers) {
      expect(c.wfsBase, id).toBe("https://geoportal.udp.data-dna.eu/geoserver/de1/ows");
      expect(c.typeName, id).toBe("geo-containers");
      expect(c.proxyPath, id).toBe("/api/wfs-proxy");
    }
  });
});

// Dateien eines Add-ons mit Endung .js oder .vue, rekursiv.
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : /\.(js|vue)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
const stripAll = (code: string): string =>
  stripComments(code.replace(/<!--[\s\S]*?-->/g, ""));

describe("addons/p2d2Crs (Projektions-Switch)", () => {
  const CRS = join(ADDONS, "p2d2Crs");
  const conf = readJson(join(ADDONS, "addonsConf.json"));
  const files = existsSync(CRS) ? sourceFiles(CRS) : [];
  const rel = (f: string) => f.slice(CRS.length + 1);
  const stateFile = join(CRS, "store/stateP2d2Crs.js");

  it("ist vom Typ tool", () => {
    expect(conf.p2d2Crs).toEqual({ type: "tool" });
  });

  it("enthält Einstieg, Komponente, Store, reine Module", () => {
    expect(files.map(rel).sort()).toEqual([
      "components/P2d2Crs.vue",
      "index.js",
      "js/runtime.js",
      "js/utm.js",
      "js/viewSwap.js",
      "store/actionsP2d2Crs.js",
      "store/gettersP2d2Crs.js",
      "store/indexP2d2Crs.js",
      "store/mutationsP2d2Crs.js",
      "store/stateP2d2Crs.js",
    ]);
  });

  it("Locales de und en sind gültig und haben dieselben Schlüssel", () => {
    const keys = (o: any, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
      );
    const de = readJson(join(CRS, "locales/de/additional.json"));
    const en = readJson(join(CRS, "locales/en/additional.json"));
    expect(keys(de).sort()).toEqual(keys(en).sort());
    expect(de.modules.p2d2Crs.name).toBe("Koordinatensystem");
  });

  it("Komponentenname passt zum Menü-type (moduleCollection, addons.js)", () => {
    const vue = read(join(CRS, "components/P2d2Crs.vue"));
    expect(vue).toMatch(/name:\s*"P2d2Crs"/);
    expect(stripAll(read(stateFile))).toMatch(/type:\s*"p2d2Crs"/);
  });

  it("State: Defaults und kein hasMouseMapInteractions", () => {
    const state = stripAll(read(stateFile));
    expect(state).toMatch(/localCrs:\s*"EPSG:25832"/);
    expect(state).toMatch(/genericCrs:\s*"EPSG:3857"/);
    expect(state).toMatch(/activeCrs:\s*"EPSG:25832"/);
    for (const f of files) {
      expect(stripAll(read(f)), rel(f)).not.toContain("hasMouseMapInteractions");
    }
  });

  it("keine festen Kommunenwerte außer dem Default im State", () => {
    for (const f of files) {
      const code = stripAll(read(f));
      expect(code, rel(f)).not.toMatch(/K(ö|oe)ln|de-K|wp_name|356560|5645282/i);
      if (f !== stateFile) expect(code, rel(f)).not.toContain("EPSG:25832");
    }
  });

  it("keine Importe aus src/, @/, @p2d2/core oder dem Eventmanagement, kein postMessage", () => {
    for (const f of files) {
      const code = stripAll(read(f));
      const imports = [
        ...code.matchAll(/^\s*import\s[\s\S]*?from\s*["']([^"']+)["']/gm),
        ...code.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
        ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ];
      for (const m of imports) {
        // Paketpfade wie @masterportal/masterportalapi/src/… sind erlaubt
        // (nur js/runtime.js, siehe unten); verboten ist der Astro-Code.
        const spec = m[1].startsWith("@masterportal/") ? "" : m[1];
        expect(spec, `${rel(f)}: ${m[1]}`).not.toMatch(
          /(^|\/)src\/|^\.\.\/\.\.\/src|^@\/|^@p2d2\/core|p2d2FeatureEditor/,
        );
        expect(m[0], `${rel(f)}: ${m[1]}`).not.toMatch(
          /events|cross-window-events|initializeCrossWindowBridge/,
        );
      }
      expect(code, rel(f)).not.toContain("postMessage");
      expect(code, rel(f)).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    }
  });

  it("Masterportal-Importe nur in js/runtime.js (Testbarkeit der reinen Module)", () => {
    for (const f of files.filter((x) => x.endsWith(".js"))) {
      const code = stripAll(read(f));
      if (rel(f) === "js/runtime.js") {
        expect(code).toMatch(/@masterportal\/masterportalapi\/src\/crs\.js/);
      }
      else {
        expect(code, rel(f)).not.toMatch(/@masterportal|@appstore|@shared|window\.mapCollection/);
      }
    }
  });

  it("Menü: Eintrag an Index 0 von secondaryMenu.sections[0], vor print", () => {
    const section = cfg.portalConfig.secondaryMenu.sections[0];
    expect(section[0]).toEqual({ type: "p2d2Crs", name: "Koordinatensystem", icon: "bi-globe2" });
    expect(section[1].type).toBe("print");
  });

  it("namedProjections unverändert (EPSG:3857 kommt aus ol und proj4)", () => {
    expect([...template.matchAll(/\["(EPSG:\d+)",/g)].map((m) => m[1])).toEqual([
      "EPSG:25832",
      "EPSG:4326",
    ]);
  });
});
