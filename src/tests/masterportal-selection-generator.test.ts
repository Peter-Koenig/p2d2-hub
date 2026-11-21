// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vertrags- und Drift-Tests des Generators für p2d2-selection.json
//
// Offline: liest src/content und die committete Datei, kein Netzwerk, keine DB.
// Erwartete Level kommen direkt aus getOsmAdminLevel (Quelle in @p2d2/core).
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as gen from "../../scripts/generate-masterportal-selection.mjs";
import { getOsmAdminLevel } from "../../packages/core/src/index";

const ROOT = resolve(__dirname, "../..");
const { serialize, readCollection, MAX_KATEGORIEN, OUTPUT_FILE } = gen;
// Rückgabetyp des Generators ist in JSDoc nur als object beschrieben.
const buildSelection: (input: { kommunen: Entry[]; kategorien: Entry[] }, options?: object) => any =
  gen.buildSelection;

const real = {
  kommunen: readCollection(join(ROOT, "src/content/kommunen")) as Entry[],
  kategorien: readCollection(join(ROOT, "src/content/kategorien")) as Entry[],
};
type Entry = { slug: string; data: Record<string, any> };

const kommune = (slug: string, extra: Record<string, any> = {}): Entry => ({
  slug,
  data: {
    title: slug,
    wp_name: `de-${slug}`,
    map: { center: [7, 51], projection: "EPSG:25832" },
    ...extra,
  },
});
const kategorie = (slug: string, extra: Record<string, any> = {}): Entry => ({
  slug,
  data: {
    title: slug,
    icon: slug,
    order: 1,
    description: "x",
    containerType: "administrative",
    ...extra,
  },
});

describe("Drift", () => {
  it("committete Datei ist byte-gleich zur Ausgabe aus src/content", () => {
    expect(readFileSync(OUTPUT_FILE, "utf8")).toBe(serialize(buildSelection(real)));
  });
});

describe("osmAdminLevel", () => {
  const selection = buildSelection(real);
  const byLevels = new Map<string, number[] | undefined>(
    real.kommunen.map((k) => [k.slug, k.data.osmAdminLevels]),
  );
  const types = [...new Set(selection.kategorien.map((k: any) => k.containerType))] as string[];

  it("deckt jeden Typ der ausgegebenen Kategorien ab", () => {
    expect(types.length).toBeGreaterThan(0);
    for (const k of selection.kommunen) {
      expect(Object.keys(k.osmAdminLevel).sort()).toEqual([...types].sort());
    }
  });

  it("entspricht je Kommune und Typ getOsmAdminLevel", () => {
    for (const k of selection.kommunen) {
      for (const t of types) {
        expect(k.osmAdminLevel[t], `${k.slug}/${t}`).toBe(getOsmAdminLevel(byLevels.get(k.slug), t));
      }
    }
  });
});

describe("Sortierung", () => {
  const slugs = (ks: Entry[]) => buildSelection({ kommunen: ks, kategorien: [] }).kommunen.map((k: any) => k.slug);

  it("order aufsteigend, Gleichstand nach slug, fehlendes order als 999", () => {
    const ks = [
      kommune("zeta", { order: 5 }),
      kommune("ohne"),
      kommune("beta", { order: 5 }),
      kommune("alpha", { order: 5 }),
      kommune("eins", { order: 1 }),
    ];
    expect(slugs(ks)).toEqual(["eins", "alpha", "beta", "zeta", "ohne"]);
  });

  it("real: Bonn vor Flensburg, Kiel vor San Francisco", () => {
    const real_ = slugs(real.kommunen);
    expect(real_.indexOf("bonn")).toBeLessThan(real_.indexOf("flensburg"));
    expect(real_.indexOf("kiel")).toBeLessThan(real_.indexOf("san-francisco"));
  });
});

describe("Slug-Regel", () => {
  it("Frontmatter-slug geht vor dem Dateinamen, sonst Dateiname ohne Endung", () => {
    const dir = mkdtempSync(join(tmpdir(), "p2d2-slug-"));
    try {
      writeFileSync(join(dir, "datei-a.md"), '---\nslug: "aus-frontmatter"\ntitle: A\n---\n');
      writeFileSync(join(dir, "datei-b.mdx"), "---\ntitle: B\n---\n");
      const slugs = (readCollection(dir) as Entry[]).map((e) => e.slug);
      expect(slugs).toEqual(["aus-frontmatter", "datei-b"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("real: jede Kommune trägt den Frontmatter-slug", () => {
    for (const e of real.kommunen) {
      if (e.data.slug) expect(e.slug).toBe(e.data.slug);
    }
  });
});

describe("Kategorien", () => {
  it("nur mit containerType, höchstens MAX_KATEGORIEN, erste der Sortierung", () => {
    const many = Array.from({ length: MAX_KATEGORIEN + 3 }, (_, i) =>
      kategorie(`k${String(i).padStart(2, "0")}`, { order: i + 1 }),
    );
    const ohne = kategorie("ohne-typ", { order: 0, containerType: undefined });
    const out = buildSelection({ kommunen: [], kategorien: [ohne, ...many] }).kategorien;
    expect(out).toHaveLength(MAX_KATEGORIEN);
    expect(out.map((k: any) => k.slug)).toEqual(many.slice(0, MAX_KATEGORIEN).map((k) => k.slug));
    expect(out.every((k: any) => k.containerType)).toBe(true);
  });

  it("real: Ausgabe gleich den ersten Einträgen der Sortierung", () => {
    const expected = real.kategorien
      .filter((k) => k.data.containerType)
      .sort((a, b) => a.data.order - b.data.order || (a.slug < b.slug ? -1 : 1))
      .slice(0, MAX_KATEGORIEN)
      .map((k) => k.slug);
    expect(buildSelection(real).kategorien.map((k: any) => k.slug)).toEqual(expected);
  });
});

describe("Fehlerfälle", () => {
  const build = (kommunen: Entry[], options?: object) =>
    buildSelection({ kommunen, kategorien: [kategorie("baume")] }, options);

  it("fehlender wp_name nennt die Kommune", () => {
    const k = kommune("ohne-wp");
    delete k.data.wp_name;
    expect(() => build([k])).toThrow(/ohne-wp.*wp_name/);
  });

  it("keine UTM-Projektion nennt Kommune und Wert", () => {
    expect(() => build([kommune("web", { map: { center: [7, 51], projection: "EPSG:3857" } })])).toThrow(
      /web.*EPSG:3857/,
    );
    expect(() => build([kommune("leer", { map: { center: [7, 51] } })])).toThrow(/leer/);
  });

  it("fehlendes center nennt die Kommune", () => {
    expect(() => build([kommune("mitte", { map: { projection: "EPSG:25832" } })])).toThrow(/mitte.*center/);
  });

  it("getOsmAdminLevel ohne Ergebnis nennt Kommune und Typ", () => {
    expect(() => build([kommune("stumm")], { getLevel: () => undefined })).toThrow(
      /stumm.*administrative/,
    );
  });

  it("doppelter slug bricht ab", () => {
    expect(() => build([kommune("zwei"), kommune("zwei")])).toThrow(/zwei/);
  });
});

describe("Determinismus", () => {
  const a = serialize(buildSelection(real));
  const b = serialize(buildSelection(real));

  it("zweimal erzeugt ergibt gleiche Bytes mit abschließendem Zeilenumbruch", () => {
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    expect(a.endsWith("\n\n")).toBe(false);
  });

  it("ohne Zeitstempel und Absolutpfade, version 1", () => {
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T|\/srv\/|\/home\/|timestamp|generated/i);
    expect(JSON.parse(a).version).toBe(1);
  });
});
