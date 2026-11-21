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

// Konfiguration des Friedhofs-Layers (Stage de1). Kind-Level, Trenner,
// Präfixfelder und Proxy-Pfad kommen von dort, nicht aus dem Modul.
const EDITOR_CFG = JSON.parse(
  read("supplement/masterportal/portal/resources/p2d2-editor-config.json"),
);
const FH = EDITOR_CFG.layers["p2d2-geo-containers"];
const KIDS = { childLevel: FH.children.level, separator: FH.children.separator };
const PREFIX_FIELDS: string[] = FH.children.prefixFields;
const PROXY: string = FH.proxyPath;

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
  it("Präfixfelder der Konfiguration: admin_name, dann name", () => {
    expect(PREFIX_FIELDS).toEqual(["admin_name", "name"]);
  });

  it("admin_name hat Vorrang, getrimmt", () => {
    expect(
      childPrefix({ name: "Deutzer Friedhof", admin_name: "Deutz" }, PREFIX_FIELDS),
    ).toBe("Deutz");
    expect(
      childPrefix(
        { name: "Nordfriedhof (neuer Teil)", admin_name: "Nordfriedhof (neuer Teil)" },
        PREFIX_FIELDS,
      ),
    ).toBe("Nordfriedhof (neuer Teil)");
    expect(childPrefix({ name: "X", admin_name: "  Deutz  " }, PREFIX_FIELDS)).toBe("Deutz");
  });

  it("ohne Präfixfelder oder ohne Treffer wirft", () => {
    expect(() => childPrefix({ name: "X" }, [] as string[])).toThrow();
    expect(() => childPrefix({ name: "X" }, undefined as any)).toThrow();
    expect(() => childPrefix({ name: " ", admin_name: null }, PREFIX_FIELDS)).toThrow();
  });

  it("null, leer und nur Leerzeichen fallen auf name zurück", () => {
    for (const admin of [null, undefined, "", "   "]) {
      expect(childPrefix({ name: "Friedhof Lövenich", admin_name: admin }, PREFIX_FIELDS)).toBe(
        "Friedhof Lövenich",
      );
    }
  });
});

describe("buildChildCql", () => {
  it("Aufbau und Muster (name LIKE '<Präfix>-%')", () => {
    expect(
      buildChildCql({ wpName: "de-Köln", containerType: "cemetery", prefix: "Deutz", ...KIDS }),
    ).toBe(
      "osm_admin_level=10 AND wp_name='de-Köln' AND container_type='cemetery' AND (name LIKE 'Deutz-%')",
    );
  });

  it("Friedhofs-Konfiguration ergibt Zeichen für Zeichen das CQL des Standalone", () => {
    // Nachbildung von loadGrabflurData (src/utils/feature-popup-handler.ts)
    // für Werte ohne Hochkomma.
    const standalone = (wp: string, type: string, prefix: string) =>
      `osm_admin_level=10 AND wp_name='${wp}' AND container_type='${type}' AND (name LIKE '${prefix}-%')`;
    const src = read("src/utils/feature-popup-handler.ts");
    expect(src).toContain(
      "const cqlFilter = `osm_admin_level=10 AND wp_name='${cemeteryProps.wp_name}' AND container_type='${containerType}' AND (name LIKE '${namePattern}')`;",
    );
    expect(src).toContain("const namePattern = `${prefix}-%`;");
    for (const p of fixture.parents) {
      const prefix = childPrefix(p, PREFIX_FIELDS);
      expect(
        buildChildCql({ wpName: p.wp_name, containerType: p.container_type, prefix, ...KIDS }),
      ).toBe(standalone(p.wp_name, p.container_type, prefix));
    }
  });

  it("Kind-Level und Trenner sind Parameter", () => {
    expect(
      buildChildCql({
        wpName: "w",
        containerType: "t",
        prefix: "P",
        childLevel: 11,
        separator: "/",
      }),
    ).toBe("osm_admin_level=11 AND wp_name='w' AND container_type='t' AND (name LIKE 'P/%')");
    const base = { wpName: "w", containerType: "t", prefix: "P" };
    expect(() => buildChildCql({ ...base, separator: "-" } as any)).toThrow();
    expect(() => buildChildCql({ ...base, childLevel: "10", separator: "-" } as any)).toThrow();
    expect(() => buildChildCql({ ...base, childLevel: 10 } as any)).toThrow();
    expect(() => buildChildCql({ ...base, childLevel: 10, separator: "" })).toThrow();
  });

  it("Hochkommata in allen drei Werten werden verdoppelt", () => {
    const cql = buildChildCql({
      wpName: "de-O'Ville",
      containerType: "ce'metery",
      prefix: "St. Mary's",
      ...KIDS,
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
    const cql = buildChildCql({
      wpName: "de-Köln",
      containerType: "cemetery",
      prefix: "Deutz",
      ...KIDS,
    });
    const out = buildChildCheckUrl({ wfsBase, typeName: "geo-containers", cql, proxyPath: PROXY });
    expect(out.startsWith("/api/wfs-proxy?url=")).toBe(true);
    const inner = parse(out).searchParams.get("url")!;
    expect(decodeURIComponent(out.slice("/api/wfs-proxy?url=".length))).toBe(inner);
    const innerUrl = new URL(inner);
    expect(innerUrl.origin + innerUrl.pathname).toBe(wfsBase);
    expect(innerUrl.searchParams.get("count")).toBe("1");
    expect(innerUrl.searchParams.get("typeName")).toBe("geo-containers");
    expect(innerUrl.searchParams.get("CQL_FILTER")).toBe(cql);
  });

  // Frühere statische URL des Friedhofs-Layers in services-p2d2.json (bis der
  // Layer dynamisch wurde, im Browser auf de1 geprüft). Dieselbe Zeichenkette
  // prüft masterportal-selector-request.test.ts für buildLayerUrl.
  const FORMER_LAYER_URL =
    "/api/wfs-proxy?url=https%3A%2F%2Fgeoportal.udp.data-dna.eu%2Fgeoserver%2Fde1%2Fows%3Fservice%3DWFS" +
    "%26version%3D2.0.0%26request%3DGetFeature%26typeName%3Dgeo-containers%26outputFormat%3Dapplication%252Fjson" +
    "%26srsName%3DEPSG%253A4326%26CQL_FILTER%3Dwp_name%253D'de-K%25C3%25B6ln'%2520AND%2520container_type%253D'cemetery'" +
    "%2520AND%2520osm_admin_level%253D8";

  it("gleicher Aufbau wie die frühere WFS-URL des Friedhofs-Layers", () => {
    const prefix = "/api/wfs-proxy?url=";
    const layerInner = decodeURIComponent(FORMER_LAYER_URL.slice(prefix.length));
    const layerCql = new URL(layerInner).searchParams.get("CQL_FILTER")!;
    const out = buildChildCheckUrl({
      wfsBase: FH.wfsBase,
      typeName: FH.typeName,
      cql: layerCql,
      proxyPath: PROXY,
    });
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

  it("ohne proxyPath wirft (kein Standardwert)", () => {
    expect(() =>
      buildChildCheckUrl({ wfsBase, typeName: "geo-containers", cql: "a=1" } as any),
    ).toThrow();
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
        prefix: childPrefix(p, PREFIX_FIELDS),
        ...KIDS,
      });
      expect(cql.startsWith("osm_admin_level=10 AND ")).toBe(true);
      expect(stripLiterals(cql)).toBe(
        "osm_admin_level=10 AND wp_name=<lit> AND container_type=<lit> AND (name LIKE <lit>)",
      );
    }
  });

  it("Kind-Namen passen nur zum Präfix ihres Elternteils", () => {
    const prefixes = fixture.parents.map((p: any) => childPrefix(p, PREFIX_FIELDS));
    expect(prefixes).toContain("Deutz");
    for (const child of fixture.children as string[]) {
      const hits = prefixes.filter((pre: string) => child.startsWith(`${pre}-`));
      expect(hits, child).toHaveLength(1);
    }
  });
});

// Projektions-Switch (Add-on p2d2Crs): Die Editor-URL bekommt immer das lokale
// CRS, auch wenn die Karte gerade in EPSG:3857 steht (wie der Standalone,
// src/utils/feature-popup-handler.ts, projection: localCRS).
describe("editorProjection ↔ Projektions-Switch", () => {
  const load = () =>
    import("../../supplement/masterportal/addons/p2d2FeatureEditor/js/editorProjection.js");

  it("bei aktivem 3857 bleibt projection in der Editor-URL UTM", async () => {
    const { editorProjection } = await load();
    const projection = editorProjection({ localCrs: "EPSG:25832", viewProjection: "EPSG:3857" });
    const url = parse(buildEditorUrl({ ...GOLDEN_INPUT, projection }));
    expect(url.searchParams.get("projection")).toBe("EPSG:25832");
    expect(isUtm(url.searchParams.get("projection")!)).toBe(true);
  });

  it("ohne Add-on p2d2Crs gilt die Projektion der View", async () => {
    const { editorProjection } = await load();
    for (const localCrs of [undefined, null, ""]) {
      expect(editorProjection({ localCrs, viewProjection: "EPSG:25832" })).toBe("EPSG:25832");
    }
  });

  it("index.js: URL mit lokalem CRS, Extent mit View-Projektion", () => {
    const index = read("supplement/masterportal/addons/p2d2FeatureEditor/index.js");
    expect(index).toContain('store.getters["Modules/P2d2Crs/localCrs"]');
    expect(index).toMatch(/transformExtent\(extent,\s*viewProjection,\s*EDITOR_EXTENT_CRS\)/);
    expect(index).toMatch(/projection:\s*editorProjection\(/);
  });
});
