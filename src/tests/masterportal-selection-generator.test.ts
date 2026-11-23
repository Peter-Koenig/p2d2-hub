// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vertrags- und Drift-Tests des Generators für p2d2-selection.json
//
// Offline: liest src/content und die committete Datei, kein Netzwerk, keine DB.
// Erwartete Level kommen direkt aus getOsmAdminLevel (Quelle in @p2d2/core).
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

// ── map.extent (Teil der Kommunenwahl, Report 027 Abschnitt 4.4) ─────────────
describe("map.extent", () => {
  const build = (k: Entry) =>
    buildSelection({ kommunen: [k], kategorien: [kategorie("baume")] }, { imageExists: () => true, warn: () => {} });
  const withExtent = (extent: unknown) =>
    kommune("ext", { map: { center: [7, 51], projection: "EPSG:25832", extent } });

  it("gültiger Extent wird übernommen, fehlender Extent fehlt auch in der Ausgabe", () => {
    expect(build(withExtent([6.5, 50.5, 7.5, 51.5])).kommunen[0].map.extent).toEqual([6.5, 50.5, 7.5, 51.5]);
    expect("extent" in build(kommune("ohne")).kommunen[0].map).toBe(false);
  });

  it("ungültiger Extent nennt Kommune und Regel", () => {
    expect(() => build(withExtent([7.5, 50.5, 6.5, 51.5]))).toThrow(/ext.*minLon/);
    expect(() => build(withExtent([6.5, 50.5, 7.5, 95]))).toThrow(/ext.*Wertebereich/);
    expect(() => build(withExtent([7.1, 51.1, 7.5, 51.5]))).toThrow(/ext.*center.*außerhalb/);
  });

  it("real: Extent genau bei den Kommunen aus Report 027 (Flensburg und Hangzhou ohne)", () => {
    const withExt = buildSelection(real)
      .kommunen.filter((k: any) => k.map.extent)
      .map((k: any) => k.slug)
      .sort();
    expect(withExt).toEqual(
      ["berlin", "bonn", "bornheim", "dortmund", "hamburg", "kiel", "koeln", "kronshagen", "san-francisco"],
    );
  });
});

// ── Bilder (Weg 1: Generator und Supplement) ─────────────────────────────────
describe("Bildregel wie im Standalone", () => {
  const { imageFileName, IMAGE_URL_PREFIX } = gen;

  it("<slug>_<image_version>.jpg, Standard 001", () => {
    expect(imageFileName("koeln", "001")).toBe("koeln_001.jpg");
    expect(imageFileName("bonn", "002")).toBe("bonn_002.jpg");
    expect(imageFileName("kiel", undefined)).toBe("kiel_001.jpg");
    expect(IMAGE_URL_PREFIX).toBe("resources/img/p2d2");
  });

  it("Vertrag: KommunenGrid.astro und Kategorien.astro bilden den Pfad nach derselben Regel", () => {
    const grid = readFileSync(join(ROOT, "src/components/KommunenGrid.astro"), "utf8");
    const card = readFileSync(join(ROOT, "src/components/Kategorien.astro"), "utf8");
    expect(grid).toContain('entry.data.image_version ?? "001"');
    expect(grid).toContain("`/images/kommunen/${entry.slug}_${imageVersion}.jpg`");
    expect(card).toContain('imageVersion = "001"');
    expect(card).toContain("`/images/kategorien/${slug}_${imageVersion}.jpg`");
  });

  it("image je Eintrag; fehlt die Datei: null und Warnung mit Eintrag und Datei", () => {
    const warnings: string[] = [];
    const out = buildSelection(
      { kommunen: [kommune("da"), kommune("weg", { image_version: "007" })], kategorien: [kategorie("baume")] },
      { imageExists: (_kind: string, file: string) => file !== "weg_007.jpg", warn: (m: string) => warnings.push(m) },
    );
    const bySlug = Object.fromEntries(out.kommunen.map((k: any) => [k.slug, k.image]));
    expect(bySlug).toEqual({ da: "resources/img/p2d2/kommunen/da_001.jpg", weg: null });
    expect(out.kategorien[0].image).toBe("resources/img/p2d2/kategorien/baume_001.jpg");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/weg.*weg_007\.jpg/);
  });

  it("real: oeffentlicherraum nutzt die Kleinschreibung des Slugs, nicht oeffentlicherRaum_*", () => {
    const k = buildSelection(real).kategorien.find((c: any) => c.slug === "oeffentlicherraum");
    expect(k.image).toBe("resources/img/p2d2/kategorien/oeffentlicherraum_001.jpg");
  });

  it("real: jedes Bild ist vorhanden und gleich der Quelle; keine verwaisten Dateien", () => {
    const result = gen.checkGenerated(gen.defaultPaths(ROOT));
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    const s = buildSelection(real);
    expect([...s.kommunen, ...s.kategorien].every((e: any) => typeof e.image === "string")).toBe(true);
  });
});

describe("Generator mit temporärer Collection", () => {
  const md = (data: Record<string, unknown>) =>
    `---\n${Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n`;
  const jpg = (seed: string) => Buffer.from(`\xff\xd8\xff${seed}`, "latin1");

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "p2d2-gen-"));
    const paths = gen.defaultPaths(root);
    for (const d of [paths.kommunenDir, paths.kategorienDir, paths.imageSourceDirs.kommunen, paths.imageSourceDirs.kategorien]) {
      mkdirSync(d, { recursive: true });
    }
    mkdirSync(dirname(paths.outputFile), { recursive: true });
    writeFileSync(
      join(paths.kommunenDir, "alpha.md"),
      md({ title: "Alpha", slug: "alpha", wp_name: "de-Alpha", order: 1, map: { center: [7, 51], projection: "EPSG:25832" } }),
    );
    writeFileSync(
      join(paths.kategorienDir, "baume.md"),
      md({ title: "Bäume", icon: "baume", order: 1, description: "x", containerType: "administrative" }),
    );
    writeFileSync(join(paths.imageSourceDirs.kommunen, "alpha_001.jpg"), jpg("a"));
    writeFileSync(join(paths.imageSourceDirs.kategorien, "baume_001.jpg"), jpg("b"));
    return { root, paths };
  }
  const quiet = { warn: () => {}, log: () => {} };
  const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));

  it("neuer Eintrag erscheint nach dem Generieren samt Bild; --check ist danach grün", () => {
    const { root, paths } = setup();
    try {
      gen.writeGenerated(paths, quiet);
      expect(gen.checkGenerated(paths).ok).toBe(true);

      // Neue Kommune mit Bild in Collection und Standalone-Ordner
      writeFileSync(
        join(paths.kommunenDir, "Beta.md"),
        md({ title: "Beta", slug: "beta", wp_name: "de-Beta", order: 2, image_version: "002", map: { center: [8, 52], projection: "EPSG:25832" } }),
      );
      writeFileSync(join(paths.imageSourceDirs.kommunen, "beta_002.jpg"), jpg("c"));
      expect(gen.checkGenerated(paths).ok).toBe(false);

      gen.writeGenerated(paths, quiet);
      const beta = read(paths.outputFile).kommunen.find((k: any) => k.slug === "beta");
      expect(beta.image).toBe("resources/img/p2d2/kommunen/beta_002.jpg");
      expect(readFileSync(join(paths.imageTargetDir, "kommunen/beta_002.jpg"))).toEqual(jpg("c"));
      expect(gen.checkGenerated(paths)).toEqual({ ok: true, problems: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--check meldet abweichendes Bild, fehlendes Bild und verwaiste Datei", () => {
    const { root, paths } = setup();
    try {
      gen.writeGenerated(paths, quiet);
      writeFileSync(join(paths.imageTargetDir, "kommunen/alpha_001.jpg"), jpg("geändert"));
      rmSync(join(paths.imageTargetDir, "kategorien/baume_001.jpg"));
      writeFileSync(join(paths.imageTargetDir, "kommunen/alt_001.jpg"), jpg("alt"));
      const { ok, problems } = gen.checkGenerated(paths);
      expect(ok).toBe(false);
      expect(problems.join("\n")).toMatch(/alpha_001\.jpg.*Quelle/);
      expect(problems.join("\n")).toMatch(/baume_001\.jpg.*fehlt/);
      expect(problems.join("\n")).toMatch(/alt_001\.jpg.*verwaist/);

      gen.writeGenerated(paths, quiet);
      expect(gen.checkGenerated(paths)).toEqual({ ok: true, problems: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("entfernter Eintrag: Bild wird beim Generieren gelöscht, nur im Bildordner des Generators", () => {
    const { root, paths } = setup();
    try {
      gen.writeGenerated(paths, quiet);
      rmSync(join(paths.kommunenDir, "alpha.md"));
      writeFileSync(
        join(paths.kommunenDir, "gamma.md"),
        md({ title: "Gamma", slug: "gamma", wp_name: "de-Gamma", map: { center: [9, 53], projection: "EPSG:25832" } }),
      );
      const result = gen.writeGenerated(paths, quiet);
      expect(result.removed).toEqual(["kommunen/alpha_001.jpg"]);
      expect(existsSync(join(paths.imageSourceDirs.kommunen, "alpha_001.jpg"))).toBe(true);
      expect(read(paths.outputFile).kommunen.map((k: any) => [k.slug, k.image])).toEqual([["gamma", null]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
