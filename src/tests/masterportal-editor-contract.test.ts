// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vertragstest Masterportal-Modul editorUrl.js ↔ Astro-Feature-Editor
//
// Das Modul liegt in der Masterportal-Quelle (supplement/masterportal/addons/
// p2d2FeatureEditor/js/editorUrl.js) und wird hier per relativem Pfad als
// Testcode importiert. Geprüft wird gegen den echten Quelltext der Zielseite
// (src/pages/feature-editor/[featureId].astro), gegen die Extent-Regel aus
// EditorState.ts, das UTM-Muster aus src/utils/crs.ts und die WFS-URL des
// Friedhofs-Layers in services-p2d2.json. Kein Netzwerk, keine DB.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  quoteCql,
  childPrefix,
  buildChildCql,
  buildChildCheckUrl,
  toExtentParam,
  buildEditorUrl,
} from "../../supplement/masterportal/addons/p2d2FeatureEditor/js/editorUrl.js";
import { isUtm } from "../utils/crs";

const ROOT = resolve(__dirname, "../..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const fixture = JSON.parse(
  read("src/tests/fixtures/koeln-cemeteries.synthetic.json"),
);

// Beispiel aus einer erfolgreichen Handprobe auf der Stage de1.
const GOLDEN_URL =
  "/feature-editor/J%C3%BCdischer%20Friedhof%20K%C3%B6ln-Bocklem%C3%BCnd" +
  "?wp_name=de-K%C3%B6ln&container_type=cemetery" +
  "&name=J%C3%BCdischer%20Friedhof%20K%C3%B6ln-Bocklem%C3%BCnd" +
  "&extent=6.8700984,50.9697476,6.87378,50.9745729&projection=EPSG:25832";

const GOLDEN_INPUT = {
  name: "Jüdischer Friedhof Köln-Bocklemünd",
  wpName: "de-Köln",
  containerType: "cemetery",
  extentWGS84: [6.8700984, 50.9697476, 6.87378, 50.9745729],
  projection: "EPSG:25832",
};

const parse = (relative: string): URL => new URL(relative, "http://x.invalid");

// Entfernt alle korrekt gequoteten CQL-Literale ('…' mit '' als Escape).
// Bleibt danach ein Hochkomma übrig, ist die Quotierung kaputt.
const stripLiterals = (cql: string): string =>
  cql.replace(/'(?:[^']|'')*'/g, "<lit>");

describe("buildEditorUrl ↔ Zielseite /feature-editor/[featureId]", () => {
  it("setzt jeden von der Zielseite gelesenen Parameter nichtleer", () => {
    const page = read("src/pages/feature-editor/[featureId].astro");
    const required = [
      ...page.matchAll(/searchParams\.get\(\s*["']([A-Za-z_]+)["']\s*\)/g),
    ].map((m) => m[1]);
    // Schutz gegen ein veraltetes Suchmuster: die fünf bekannten Parameter.
    expect(required).toEqual(
      expect.arrayContaining([
        "wp_name",
        "container_type",
        "name",
        "extent",
        "projection",
      ]),
    );
    const sp = parse(buildEditorUrl(GOLDEN_INPUT)).searchParams;
    for (const key of required) {
      expect(sp.get(key), key).toBeTruthy();
    }
  });

  it("extent lässt sich mit der Regel aus EditorState.ts parsen", () => {
    const editorState = read("src/components/feature-editor/EditorState.ts");
    expect(editorState).toMatch(/\.split\(","\)\s*\.map\(Number\)/);
    const extent = parse(buildEditorUrl(GOLDEN_INPUT))
      .searchParams.get("extent")!
      .split(",")
      .map(Number);
    expect(extent).toHaveLength(4);
    for (const v of extent) expect(Number.isFinite(v)).toBe(true);
    const [minX, minY, maxX, maxY] = extent;
    expect(minX).toBeLessThan(maxX);
    expect(minY).toBeLessThan(maxY);
  });

  it("Pfad /feature-editor/<encodeURIComponent(name)>, projection ist UTM", () => {
    const url = parse(buildEditorUrl(GOLDEN_INPUT));
    expect(url.pathname).toBe(
      `/feature-editor/${encodeURIComponent(GOLDEN_INPUT.name)}`,
    );
    expect(isUtm(url.searchParams.get("projection")!)).toBe(true);
    expect(buildEditorUrl(GOLDEN_INPUT).startsWith("/feature-editor/")).toBe(
      true,
    );
  });

  it("goldener Fall: gleiche searchParams wie die Handprobe", () => {
    const got = parse(buildEditorUrl(GOLDEN_INPUT));
    const want = parse(GOLDEN_URL);
    expect(got.pathname).toBe(want.pathname);
    expect(Object.fromEntries(got.searchParams)).toEqual(
      Object.fromEntries(want.searchParams),
    );
  });

  it("osm_admin_level nur, wenn übergeben", () => {
    const sp = parse(
      buildEditorUrl({ ...GOLDEN_INPUT, osmAdminLevel: 8 }),
    ).searchParams;
    expect(sp.get("osm_admin_level")).toBe("8");
    expect(parse(buildEditorUrl(GOLDEN_INPUT)).searchParams.has("osm_admin_level")).toBe(false);
  });

  it("fehlende oder leere Pflichtwerte werfen", () => {
    for (const key of ["name", "wpName", "containerType", "projection"]) {
      expect(() => buildEditorUrl({ ...GOLDEN_INPUT, [key]: "" }), key).toThrow();
      expect(() => buildEditorUrl({ ...GOLDEN_INPUT, [key]: undefined }), key).toThrow();
    }
    expect(() =>
      buildEditorUrl({ ...GOLDEN_INPUT, extentWGS84: undefined as any }),
    ).toThrow();
  });
});

describe("childPrefix", () => {
  it("admin_name hat Vorrang, getrimmt", () => {
    expect(childPrefix({ name: "Deutzer Friedhof", admin_name: "Deutz" })).toBe("Deutz");
    expect(
      childPrefix({ name: "Nordfriedhof (neuer Teil)", admin_name: "Nordfriedhof (neuer Teil)" }),
    ).toBe("Nordfriedhof (neuer Teil)");
    expect(childPrefix({ name: "X", admin_name: "  Deutz  " })).toBe("Deutz");
  });

  it("null, leer und nur Leerzeichen fallen auf name zurück", () => {
    for (const admin of [null, undefined, "", "   "]) {
      expect(childPrefix({ name: "Friedhof Lövenich", admin_name: admin })).toBe(
        "Friedhof Lövenich",
      );
    }
  });
});

describe("buildChildCql", () => {
  it("Aufbau und Muster (name LIKE '<Präfix>-%')", () => {
    expect(
      buildChildCql({ wpName: "de-Köln", containerType: "cemetery", prefix: "Deutz" }),
    ).toBe(
      "osm_admin_level=10 AND wp_name='de-Köln' AND container_type='cemetery' AND (name LIKE 'Deutz-%')",
    );
  });

  it("Hochkommata in allen drei Werten werden verdoppelt", () => {
    const cql = buildChildCql({
      wpName: "de-O'Ville",
      containerType: "ce'metery",
      prefix: "St. Mary's",
    });
    expect(cql).toContain("wp_name='de-O''Ville'");
    expect(cql).toContain("container_type='ce''metery'");
    expect(cql).toContain("(name LIKE 'St. Mary''s-%')");
    expect(stripLiterals(cql)).not.toContain("'");
  });

  it("quoteCql verdoppelt jedes Hochkomma", () => {
    expect(quoteCql("a'b''c")).toBe("a''b''''c");
    expect(quoteCql("ohne")).toBe("ohne");
  });
});

describe("buildChildCheckUrl", () => {
  const wfsBase = "https://geoportal.udp.data-dna.eu/geoserver/de1/ows";

  it("url-Parameter dekodiert zur inneren URL mit count=1 und typeName", () => {
    const cql = buildChildCql({ wpName: "de-Köln", containerType: "cemetery", prefix: "Deutz" });
    const out = buildChildCheckUrl({ wfsBase, typeName: "geo-containers", cql });
    expect(out.startsWith("/api/wfs-proxy?url=")).toBe(true);
    const inner = parse(out).searchParams.get("url")!;
    expect(decodeURIComponent(out.slice("/api/wfs-proxy?url=".length))).toBe(inner);
    const innerUrl = new URL(inner);
    expect(innerUrl.origin + innerUrl.pathname).toBe(wfsBase);
    expect(innerUrl.searchParams.get("count")).toBe("1");
    expect(innerUrl.searchParams.get("typeName")).toBe("geo-containers");
    expect(innerUrl.searchParams.get("CQL_FILTER")).toBe(cql);
  });

  it("gleicher Aufbau wie die WFS-URL des Friedhofs-Layers in services-p2d2.json", () => {
    const svc = JSON.parse(
      read("supplement/masterportal/portal/resources/services-p2d2.json"),
    );
    const layer = svc.find((l: any) => l.id === "p2d2-geo-containers-koeln");
    const prefix = "/api/wfs-proxy?url=";
    const layerInner = decodeURIComponent(layer.url.slice(prefix.length));
    const layerCql = new URL(layerInner).searchParams.get("CQL_FILTER")!;
    const out = buildChildCheckUrl({ wfsBase, typeName: "geo-containers", cql: layerCql });
    const inner = decodeURIComponent(out.slice(prefix.length));
    expect(inner.replace("&count=1", "")).toBe(layerInner);
  });

  it("eigener proxyPath wird übernommen", () => {
    const out = buildChildCheckUrl({
      wfsBase,
      typeName: "geo-containers",
      cql: "a=1",
      proxyPath: "/p",
    });
    expect(out.startsWith("/p?url=")).toBe(true);
  });
});

describe("toExtentParam", () => {
  it("formatiert mit höchstens sieben Nachkommastellen", () => {
    expect(toExtentParam([6.8700984, 50.9697476, 6.87378, 50.9745729])).toBe(
      "6.8700984,50.9697476,6.87378,50.9745729",
    );
    expect(toExtentParam([6.123456789, 50.1, 6.2, 50.987654321])).toBe(
      "6.1234568,50.1,6.2,50.9876543",
    );
  });

  it("Fehlerfälle werfen", () => {
    const bad: unknown[] = [
      undefined,
      null,
      "6,50,7,51",
      [6, 50, 7],
      [6, 50, 7, 51, 0],
      [6, 50, "7", 51],
      [6, 50, NaN, 51],
      [6, 50, Infinity, 51],
      [7, 50, 6, 51],
      [6, 51, 7, 50],
      [6, 50, 6, 51],
      [6, 50, 7, 50],
    ];
    for (const b of bad) expect(() => toExtentParam(b as any), String(b)).toThrow();
  });
});

describe("synthetische Köln-Fixture", () => {
  it("alle sechs Eltern ergeben gültiges CQL ohne unmaskierte Hochkommata", () => {
    expect(fixture.parents).toHaveLength(6);
    for (const p of fixture.parents) {
      const cql = buildChildCql({
        wpName: p.wp_name,
        containerType: p.container_type,
        prefix: childPrefix(p),
      });
      expect(cql.startsWith("osm_admin_level=10 AND ")).toBe(true);
      expect(stripLiterals(cql)).toBe(
        "osm_admin_level=10 AND wp_name=<lit> AND container_type=<lit> AND (name LIKE <lit>)",
      );
    }
  });

  it("Kind-Namen passen nur zum Präfix ihres Elternteils", () => {
    const prefixes = fixture.parents.map((p: any) => childPrefix(p));
    expect(prefixes).toContain("Deutz");
    for (const child of fixture.children as string[]) {
      const hits = prefixes.filter((pre: string) => child.startsWith(`${pre}-`));
      expect(hits, child).toHaveLength(1);
    }
  });
});
