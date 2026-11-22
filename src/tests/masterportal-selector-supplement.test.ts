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

  // Titel der Fehlermeldung zum Layer; gleicher Name wie der Layer in der
  // Portal-Konfiguration (Turn 034, vorher "Auswahl-Layer").
  it("Locales: alertTitle nennt den Layer p2d2-Objekte", () => {
    expect(readJson(join(DIR, "locales/de/additional.json")).modules.p2d2Selector.alertTitle).toBe("p2d2-Objekte");
    expect(readJson(join(DIR, "locales/en/additional.json")).modules.p2d2Selector.alertTitle).toBe("p2d2 objects");
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
      "js/fit.js",
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

  it("js/runtime.js importiert nur ol/format/GeoJSON, ol/proj, ./debug.js und ./fit.js", () => {
    expect(importsOf(stripAll(read(join(DIR, "js/runtime.js")))).sort()).toEqual([
      "./debug.js",
      "./fit.js",
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

  it("A5: Rückfall ohne Container Queries: auto-fill mit Mindestbreite 13rem", () => {
    expect(style).toMatch(
      /\.p2d2-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(var\(--p2d2-tile-fallback-min-width\),\s*1fr\)\)/,
    );
    expect(style).toMatch(/--p2d2-tile-fallback-min-width:\s*13rem/);
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
  });
});

// Teil A (Turn 032): Spalten nach Breite des Selektors (Container Queries),
// höchstens drei; Kachelhöhe wächst mit der Breite; Abstand der Überschriften.
describe("addons/p2d2Selector: Spalten und Überschriften", () => {
  const vue = read(join(DIR, "components/P2d2Selector.vue"));
  const template = vue.slice(vue.indexOf("<template>"), vue.lastIndexOf("</template>"));
  const style = stripAll(vue.slice(vue.indexOf("<style scoped>")));
  const REM = 16; // Masterportal: Basisgröße 16 px (variables.scss)
  const MENU_SHARE = 0.25; // mainMenu, Startbreite 25 % (MenuContainer.vue)
  const MENU_PADDING = 2 * 1.5 * REM; // MenuContainerBody.vue, $padding links und rechts

  // @container p2d2-selector (min-width: Xrem) { .p2d2-grid { grid-template-columns: ... } }
  const rules = [...style.matchAll(
    /@container\s+p2d2-selector\s+\(min-width:\s*([\d.]+)(rem)?\)\s*\{\s*\.p2d2-grid\s*\{\s*grid-template-columns:\s*([^;]+);\s*\}\s*\}/g,
  )].map((m) => {
    const value = m[3].trim(),
      n = value === "minmax(0, 1fr)" ? 1 : Number(value.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/)?.[1]);
    return { minPx: Number(m[1]) * (m[2] ? REM : 1), columns: n };
  });
  const columnsAt = (contentPx: number): number =>
    rules.filter((r) => contentPx >= r.minPx).reduce((acc, r) => (r.minPx >= acc.minPx ? r : acc), { minPx: -1, columns: NaN }).columns;
  const contentWidth = (windowPx: number) => windowPx * MENU_SHARE - MENU_PADDING;

  it("A1: #p2d2-selector ist Container (inline-size, Name p2d2-selector)", () => {
    expect(style).toMatch(/#p2d2-selector\s*\{[^}]*container-type:\s*inline-size;/);
    expect(style).toMatch(/#p2d2-selector\s*\{[^}]*container-name:\s*p2d2-selector;/);
  });

  it("A1: drei Container-Regeln für eine, zwei und drei Spalten, jede Spaltenzahl einmal", () => {
    expect(rules.map((r) => r.columns).sort()).toEqual([1, 2, 3]);
    expect(rules.find((r) => r.columns === 1)?.minPx).toBe(0);
  });

  it.each([
    [1366, 1],
    [1920, 2],
    [2560, 3],
    [3440, 3],
    [7680, 3],
  ])("A1: Fenster %i px bei Menübreite 25 Prozent: %i Spalte(n)", (windowPx, expected) => {
    expect(columnsAt(contentWidth(windowPx))).toBe(expected);
  });

  it("A1: Kacheln mindestens 10rem breit, sobald zwei oder drei Spalten gelten", () => {
    for (const r of rules.filter((x) => x.columns > 1)) {
      const tile = (r.minPx - (r.columns - 1) * 0.5 * REM) / r.columns;
      expect(tile, `${r.columns} Spalten ab ${r.minPx}px`).toBeGreaterThanOrEqual(10 * REM);
    }
  });

  it("A1: Höhe aus Seitenverhältnis 4/3 der Bilder, zwischen 8rem und 12rem, keine feste Höhe", () => {
    const tile = style.match(/\.p2d2-tile\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(tile).toMatch(/aspect-ratio:\s*4\s*\/\s*3;/);
    expect(tile).toMatch(/min-height:\s*var\(--p2d2-tile-min-height\);/);
    expect(tile).toMatch(/max-height:\s*var\(--p2d2-tile-max-height\);/);
    expect(tile).not.toMatch(/(^|[^-])height:\s*var\(--p2d2-tile-height\)/);
    expect(style).toMatch(/--p2d2-tile-min-height:\s*8rem/);
    expect(style).toMatch(/--p2d2-tile-max-height:\s*12rem/);
  });

  it("A1: Titel weiterhin auf zwei Zeilen begrenzt", () => {
    expect(style).toMatch(/\.p2d2-tile-title\s*\{[^}]*-webkit-line-clamp:\s*2;/);
  });

  it("A2: beide Überschriften mit p2d2-heading und Abstand 1rem zu den Kacheln", () => {
    expect(template.match(/<h2 class="h6 p2d2-heading">/g)).toHaveLength(2);
    expect(style).toMatch(/\.p2d2-heading\s*\{[^}]*margin-bottom:\s*var\(--p2d2-heading-gap\);/);
    expect(style).toMatch(/--p2d2-heading-gap:\s*1rem/);
  });

  it("A2: Abstand zwischen den Abschnitten unverändert (gap-3 am Selektor)", () => {
    expect(template).toMatch(/id="p2d2-selector"\s+class="d-flex flex-column gap-3"/);
    expect(style).not.toMatch(/section\s*\{|margin-top/);
  });
});
