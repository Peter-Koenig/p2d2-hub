// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Offline-Prüfung des Add-ons p2d2Selector (Registrierung, Menü, Isolation)
//
// Liest nur Dateien aus dem Repository. Die Isolationsregeln entsprechen denen
// des Add-ons p2d2Crs: keine Importe aus src/, @p2d2/core oder anderen
// Add-ons; Zugriffe auf Masterportal, Karte und OpenLayers nur in js/runtime.js.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MP = resolve(__dirname, "../../supplement/masterportal");
const DIR = join(MP, "addons/p2d2Selector");
const read = (p: string): string => readFileSync(p, "utf8");
const readJson = (p: string): any => JSON.parse(read(p));
const cfg = readJson(join(MP, "portal/resources/portal-config-p2d2.json"));
const template = read(join(MP, "portal/config.js.template"));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(js|vue)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const stripAll = (code: string): string =>
  code
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const files = existsSync(DIR) ? sourceFiles(DIR) : [];
const rel = (f: string) => f.slice(DIR.length + 1);

describe("addons/p2d2Selector: Registrierung und Menü", () => {
  it("addonsConf.json: Typ tool, index.js vorhanden", () => {
    expect(readJson(join(MP, "addons/addonsConf.json")).p2d2Selector).toEqual({ type: "tool" });
    expect(existsSync(join(DIR, "index.js"))).toBe(true);
  });

  it("config.js.template: addons enthält p2d2Selector", () => {
    const m = template.match(/^\s*addons:\s*\[([^\]]*)\]/m);
    expect(JSON.parse(`[${m![1]}]`)).toContain("p2d2Selector");
  });

  it("mainMenu: eigene Sektion an Index 1, Typ p2d2Selector", () => {
    const sections = cfg.portalConfig.mainMenu.sections;
    expect(sections[1]).toEqual([
      { type: "p2d2Selector", name: "additional:modules.p2d2Selector.name", icon: "bi-grid-3x3-gap" },
    ]);
  });

  it("Komponentenname und State-Typ passen zum Menü-type", () => {
    expect(read(join(DIR, "components/P2d2Selector.vue"))).toMatch(/name:\s*"P2d2Selector"/);
    expect(stripAll(read(join(DIR, "store/stateP2d2Selector.js")))).toMatch(/type:\s*"p2d2Selector"/);
  });

  it("Locales de und en: gleiche Schlüssel, Menütitel Public-Public Data-DNA", () => {
    const keys = (o: any, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const de = readJson(join(DIR, "locales/de/additional.json"));
    const en = readJson(join(DIR, "locales/en/additional.json"));
    expect(keys(de).sort()).toEqual(keys(en).sort());
    expect(de.modules.p2d2Selector.name).toBe("Public-Public Data-DNA");
    expect(en.modules.p2d2Selector.name).toBe("Public-Public Data-DNA");
  });

  it("Menütitel oben im Portal bleibt unverändert", () => {
    const cfg = readJson(join(MP, "portal/resources/portal-config-p2d2.json"));
    expect(cfg.portalConfig.mainMenu.title.text).toBe("p2d2 – Public-Public Data-DNA");
  });

  // A4: Statuszeile entfällt; nur Laden, Fehler und "keine Objekte" bleiben.
  it("Locales: keine Texte der früheren Statuszeile (current, none, layer.idle, layer.ready)", () => {
    for (const lang of ["de", "en"]) {
      const t = readJson(join(DIR, `locales/${lang}/additional.json`)).modules.p2d2Selector;
      expect(t, lang).not.toHaveProperty("current");
      expect(t, lang).not.toHaveProperty("none");
      expect(Object.keys(t.layer).sort(), lang).toEqual(["empty", "error", "loading"]);
    }
  });

  it("jeder Locale-Schlüssel wird in Komponente oder Store genutzt", () => {
    const keys = (o: any, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const code = files.map((f) => stripAll(read(f))).join("\n");
    const de = readJson(join(DIR, "locales/de/additional.json"));
    for (const key of keys(de)) {
      const short = key.replace(/^modules\.p2d2Selector\./, "");
      const used =
        code.includes(`modules.p2d2Selector.${short}`) ||
        (short.startsWith("layer.") && code.includes("modules.p2d2Selector.layer.${"));
      expect(used, key).toBe(true);
    }
  });

  it("p2d2-selection.json liegt unter resources/ und wird relativ geladen", () => {
    expect(existsSync(join(MP, "portal/resources/p2d2-selection.json"))).toBe(true);
    expect(stripAll(read(join(DIR, "js/runtime.js")))).toContain('"./resources/p2d2-selection.json"');
  });
});

describe("addons/p2d2Selector: Isolation", () => {
  it("enthält Einstieg, Komponente, Store, reine Module", () => {
    expect(files.map(rel).sort()).toEqual([
      "components/P2d2Selector.vue",
      "index.js",
      "js/debug.js",
      "js/layerControl.js",
      "js/runtime.js",
      "js/selection.js",
      "js/wfsRequest.js",
      "js/zoom.js",
      "store/actionsP2d2Selector.js",
      "store/gettersP2d2Selector.js",
      "store/indexP2d2Selector.js",
      "store/mutationsP2d2Selector.js",
      "store/stateP2d2Selector.js",
    ]);
  });

  it("kein hasMouseMapInteractions", () => {
    for (const f of files) expect(stripAll(read(f)), rel(f)).not.toContain("hasMouseMapInteractions");
  });

  const importsOf = (code: string) => [
    ...code.matchAll(/^\s*import\s[\s\S]*?from\s*["']([^"']+)["']/gm),
    ...code.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

  it("keine Importe aus src/, @/, @p2d2/core, @masterportal oder anderen Add-ons; ol nur in js/runtime.js", () => {
    for (const f of files) {
      const code = stripAll(read(f));
      for (const spec of importsOf(code)) {
        if (rel(f) === "js/runtime.js" && /^ol\//.test(spec)) continue;
        expect(spec, `${rel(f)}: ${spec}`).toMatch(/^(vuex|\.\/|\.\.\/(js|store|components|locales)\/)/);
        expect(spec, `${rel(f)}: ${spec}`).not.toMatch(/src\/|^@|p2d2Crs|p2d2FeatureEditor/);
      }
      expect(code, rel(f)).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|postMessage/);
    }
  });

  it("js/runtime.js importiert nur ol/format/GeoJSON, ol/proj und ./debug.js", () => {
    expect(importsOf(stripAll(read(join(DIR, "js/runtime.js")))).sort()).toEqual([
      "./debug.js",
      "ol/format/GeoJSON.js",
      "ol/proj.js",
    ]);
  });

  it("window, mapCollection und console.debug nur in js/runtime.js", () => {
    for (const f of files.filter((x) => rel(x) !== "js/runtime.js")) {
      expect(stripAll(read(f)), rel(f)).not.toMatch(/\bwindow\b|mapCollection|console\.debug/);
    }
  });

  it("Stage-Werte und Layer-ID: runtime.js nennt Datei und ID, keine Hostnamen im Code", () => {
    const runtime = stripAll(read(join(DIR, "js/runtime.js")));
    expect(runtime).toContain('"./resources/p2d2-editor-config.json"');
    expect(runtime).toContain('layerId: "p2d2-geo-containers"');
    for (const f of files) {
      const code = stripAll(read(f));
      expect(code, rel(f)).not.toMatch(/geoportal|data-dna\.eu|wfs-proxy|cemetery/);
      if (rel(f) !== "js/runtime.js") expect(code, rel(f)).not.toContain("p2d2-geo-containers");
    }
  });

  it("p2d2-geo-containers existiert in services-p2d2.json und p2d2-editor-config.json", () => {
    const svc = readJson(join(MP, "portal/resources/services-p2d2.json"));
    const editor = readJson(join(MP, "portal/resources/p2d2-editor-config.json"));
    expect(svc.some((l: any) => l.id === "p2d2-geo-containers")).toBe(true);
    expect(Object.keys(editor.layers)).toContain("p2d2-geo-containers");
  });

  it("reine Module (js/ außer runtime.js) ohne Masterportal, Karte, OpenLayers oder DOM", () => {
    for (const f of files.filter((x) => /\/js\/(?!runtime\.js)[^/]+\.js$/.test(x))) {
      expect(stripAll(read(f)), rel(f)).not.toMatch(
        /mapCollection|@appstore|@shared|@masterportal|\bol\/|\bwindow\b|\bdocument\b|viewSwap|registerProjections/,
      );
    }
  });
});

// Teil A (Turn 028): Darstellung. Ohne Browser nur am Quelltext prüfbar;
// die Wirkung nimmt der Browser ab (Report, Abnahmeliste).
describe("addons/p2d2Selector: Kacheln", () => {
  const vue = read(join(DIR, "components/P2d2Selector.vue"));
  const template = vue.slice(vue.indexOf("<template>"), vue.lastIndexOf("</template>"));
  const style = vue.slice(vue.indexOf("<style scoped>"));
  const standalone = (f: string) => read(resolve(__dirname, "../../src/components", f));

  it("A4: keine Statuszeile (Aktuelle Auswahl, Zähler) mehr", () => {
    expect(template).not.toMatch(/p2d2-summary|\.current|\.none|featureCount|summary/);
  });

  it("A5: Raster mit auto-fill und Mindestbreite 10rem", () => {
    expect(style).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(var\(--p2d2-tile-min-width\),\s*1fr\)\)/);
    expect(style).toMatch(/--p2d2-tile-min-width:\s*10rem/);
  });

  it("A6: Streifen der Kategorien in der Farbe des Standalone (Kategorien.astro)", () => {
    const green = standalone("Kategorien.astro").match(/bg-\[(#[0-9A-Fa-f]{6})\]/)?.[1];
    expect(green).toBe("#0FF078");
    expect(style.toLowerCase()).toContain(`--p2d2-kategorie-stripe: ${green!.toLowerCase()}`);
  });

  it("A7: aktiv = aria-pressed mit farbigem Schlagschatten; kein #fff1e6, kein fetter Wechsel", () => {
    expect(template.match(/:aria-pressed=/g)).toHaveLength(2);
    expect(style).toMatch(/\.p2d2-tile-kommune\[aria-pressed="true"\]\s*\{\s*box-shadow:/);
    expect(style).toMatch(/\.p2d2-tile-kategorie\[aria-pressed="true"\]\s*\{\s*box-shadow:/);
    expect(style).toMatch(/:focus-visible\s*\{\s*outline:/);
    expect(vue).not.toMatch(/fff1e6|p2d2-tile-selected/);
  });

  it("A7: Schein-Farben wie der Hover-Schein im Standalone", () => {
    expect(standalone("Kategorien.astro")).toContain("shadow-[0_0_32px_4px_#0a6630]");
    expect(standalone("KommunenGrid.astro")).toContain("rgba(255,105,0,0.3)");
    expect(style).toContain("--p2d2-kategorie-glow: #0a6630");
    expect(style).toContain("--p2d2-kommune-glow: rgba(255, 105, 0, 0.3)");
  });

  it("A8: Bild mit loading=lazy, object-fit cover, Rückfall auf dunklen Hintergrund", () => {
    expect(template.match(/<img/g)).toHaveLength(2);
    expect(template.match(/loading="lazy"/g)).toHaveLength(2);
    expect(template.match(/@error="imageFailed/g)).toHaveLength(2);
    expect(style).toMatch(/object-fit:\s*cover/);
    expect(style).toContain("--p2d2-tile-fallback: #2a2a2a");
    expect(style).toMatch(/--p2d2-tile-height:\s*(7|7\.5|8|8\.5|9)rem/);
  });
});
