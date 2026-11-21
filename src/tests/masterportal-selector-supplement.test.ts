// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Offline-Prüfung des Add-ons p2d2Selector (Registrierung, Menü, Isolation)
//
// Liest nur Dateien aus dem Repository. Die Isolationsregeln entsprechen denen
// des Add-ons p2d2Crs; zusätzlich darf der Quelltext keine Karte, Layer, WFS
// oder CRS-Funktionen ansprechen (das Datenfeld map.projection wird nur geprüft) (kommt in späteren Stufen über den Hook applySelection).
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

  it("Locales de und en: gleiche Schlüssel, Menütitel Auswahl / Selection", () => {
    const keys = (o: any, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const de = readJson(join(DIR, "locales/de/additional.json"));
    const en = readJson(join(DIR, "locales/en/additional.json"));
    expect(keys(de).sort()).toEqual(keys(en).sort());
    expect(de.modules.p2d2Selector.name).toBe("Auswahl");
    expect(en.modules.p2d2Selector.name).toBe("Selection");
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
      "js/runtime.js",
      "js/selection.js",
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

  it("keine Importe aus src/, @/, @p2d2/core, @masterportal, ol, anderen Add-ons", () => {
    for (const f of files) {
      const code = stripAll(read(f));
      const imports = [
        ...code.matchAll(/^\s*import\s[\s\S]*?from\s*["']([^"']+)["']/gm),
        ...code.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
        ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ];
      for (const m of imports) {
        expect(m[1], `${rel(f)}: ${m[1]}`).toMatch(/^(vuex|\.\/|\.\.\/(js|store|components|locales)\/)/);
        expect(m[1], `${rel(f)}: ${m[1]}`).not.toMatch(/src\/|^@|p2d2Crs|p2d2FeatureEditor/);
      }
      expect(code, rel(f)).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|postMessage/);
    }
  });

  it("keine Referenz auf Karte, Layer, WFS oder CRS im Quelltext", () => {
    for (const f of files) {
      expect(stripAll(read(f)), rel(f)).not.toMatch(
        /mapCollection|@appstore|@shared|Maps\/|\bol\/|\bWFS\b|getFeature|addLayer|layerConfig|\bLayer\b|setCenter|setZoom|\bcrs\b|viewSwap|ensureProjection|registerProjections/i,
      );
    }
  });
});
