// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für p2d2Selector/js/wfsRequest.js (CQL, Layer-URL, Stage-Werte)
//
// Vertrag: buildLayerUrl liefert dieselbe innere WFS-URL wie buildWFSURL aus
// @p2d2/core und für Köln/Friedhöfe genau die frühere statische Layer-URL.
// Kein Netzwerk, keine DB.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildWFSURL } from "../../packages/core/src/wfst/wfs-url";
import {
  quoteCql,
  buildCql,
  buildLayerUrl,
  readStage,
  selectionRequest,
} from "../../supplement/masterportal/addons/p2d2Selector/js/wfsRequest.js";
import { quoteCql as editorQuoteCql } from "../../supplement/masterportal/addons/p2d2FeatureEditor/js/editorUrl.js";

const RES = resolve(__dirname, "../../supplement/masterportal/portal/resources");
const readJson = (name: string): any => JSON.parse(readFileSync(resolve(RES, name), "utf8"));
const EDITOR_CFG = readJson("p2d2-editor-config.json");
const SELECTION = readJson("p2d2-selection.json");
const LAYER_ID = "p2d2-geo-containers";
const STAGE = EDITOR_CFG.layers[LAYER_ID];

// Frühere statische URL des Friedhofs-Layers Köln (services-p2d2.json bis C1).
const FORMER_LAYER_URL =
  "/api/wfs-proxy?url=https%3A%2F%2Fgeoportal.udp.data-dna.eu%2Fgeoserver%2Fde1%2Fows%3Fservice%3DWFS" +
  "%26version%3D2.0.0%26request%3DGetFeature%26typeName%3Dgeo-containers%26outputFormat%3Dapplication%252Fjson" +
  "%26srsName%3DEPSG%253A4326%26CQL_FILTER%3Dwp_name%253D'de-K%25C3%25B6ln'%2520AND%2520container_type%253D'cemetery'" +
  "%2520AND%2520osm_admin_level%253D8";

const innerOf = (url: string, proxyPath = STAGE.proxyPath) => {
  const prefix = `${proxyPath}?url=`;
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(prefix.length));
};

describe("quoteCql und buildCql", () => {
  it("quoteCql verdoppelt Hochkommata wie im p2d2FeatureEditor", () => {
    for (const v of ["fr-Côte-d'Ivoire", "a''b", "ohne", "'"]) expect(quoteCql(v)).toBe(editorQuoteCql(v));
    expect(quoteCql("fr-Côte-d'Ivoire")).toBe("fr-Côte-d''Ivoire");
  });

  it("Köln/Friedhöfe ergibt das CQL des Standalone (wfs-layer-manager.ts)", () => {
    expect(buildCql({ wpName: "de-Köln", containerType: "cemetery", level: 8 })).toBe(
      "wp_name='de-Köln' AND container_type='cemetery' AND osm_admin_level=8",
    );
  });

  it("Leerzeichen und Umlaute bleiben im CQL unverändert", () => {
    expect(buildCql({ wpName: "de-San Francisco", containerType: "administrative", level: 6 })).toBe(
      "wp_name='de-San Francisco' AND container_type='administrative' AND osm_admin_level=6",
    );
  });

  it("ein Hochkomma im Namen wird verdoppelt", () => {
    expect(buildCql({ wpName: "fr-Côte-d'Ivoire", containerType: "cemetery", level: 8 })).toBe(
      "wp_name='fr-Côte-d''Ivoire' AND container_type='cemetery' AND osm_admin_level=8",
    );
  });

  it("Level als String, Kommazahl oder fehlend wird abgelehnt", () => {
    for (const level of ["8", 8.5, undefined, null, Number.NaN]) {
      expect(() => buildCql({ wpName: "de-Köln", containerType: "cemetery", level } as any), String(level)).toThrow(
        /level muss eine ganze Zahl/,
      );
    }
  });

  it("leerer Name oder Typ wird abgelehnt", () => {
    expect(() => buildCql({ wpName: "", containerType: "cemetery", level: 8 })).toThrow(/wpName/);
    expect(() => buildCql({ wpName: "de-Köln", containerType: " ", level: 8 })).toThrow(/containerType/);
  });
});

describe("buildLayerUrl", () => {
  const koeln = () =>
    buildLayerUrl({ ...STAGE, cql: buildCql({ wpName: "de-Köln", containerType: "cemetery", level: 8 }) });

  it("Köln/Friedhöfe: Zeichen für Zeichen die frühere statische Layer-URL", () => {
    expect(koeln()).toBe(FORMER_LAYER_URL);
  });

  it("innere URL: Parameter, kein count, CQL zurückgewinnbar", () => {
    const inner = new URL(innerOf(koeln()));
    expect(inner.origin + inner.pathname).toBe(STAGE.wfsBase);
    expect([...inner.searchParams.keys()]).toEqual([
      "service",
      "version",
      "request",
      "typeName",
      "outputFormat",
      "srsName",
      "CQL_FILTER",
    ]);
    expect(inner.searchParams.get("count")).toBeNull();
    expect(inner.searchParams.get("srsName")).toBe("EPSG:4326");
    expect(inner.searchParams.get("CQL_FILTER")).toBe(
      "wp_name='de-Köln' AND container_type='cemetery' AND osm_admin_level=8",
    );
  });

  // Vertrag mit @p2d2/core: gleiche Eingaben → dieselbe innere WFS-URL.
  const cases = [
    { wpName: "de-Köln", containerType: "cemetery", level: 8 },
    { wpName: "de-San Francisco", containerType: "administrative", level: 6 },
    { wpName: "fr-Côte-d'Ivoire", containerType: "cemetery", level: 8 },
    { wpName: "de-Hangzhou", containerType: "administrative", level: 5 },
  ];
  for (const c of cases) {
    it(`innere URL = buildWFSURL (@p2d2/core) für ${c.wpName}`, () => {
      const cql = buildCql(c);
      const core = buildWFSURL(
        { endpoint: STAGE.wfsBase, workspace: "de1", namespace: "unused" },
        STAGE.typeName,
        { CQL_FILTER: cql },
      );
      expect(innerOf(buildLayerUrl({ ...STAGE, cql }))).toBe(core);
      // Äußere Kodierung wie src/utils/wfs-auth.ts: proxy?url=encodeURIComponent(url)
      expect(buildLayerUrl({ ...STAGE, cql })).toBe(`${STAGE.proxyPath}?url=${encodeURIComponent(core)}`);
    });
  }

  it("Pflichtwerte ohne Standard, wfsBase ohne Query", () => {
    const cql = "a=1";
    expect(() => buildLayerUrl({ ...STAGE, cql, proxyPath: undefined } as any)).toThrow(/proxyPath/);
    expect(() => buildLayerUrl({ ...STAGE, cql, typeName: "" })).toThrow(/typeName/);
    expect(() => buildLayerUrl({ ...STAGE, cql: "" })).toThrow(/cql/);
    expect(() => buildLayerUrl({ ...STAGE, cql, wfsBase: `${STAGE.wfsBase}?x=1` })).toThrow(/Query/);
  });
});

describe("readStage", () => {
  it("liest die drei Stage-Werte des Auswahl-Layers aus p2d2-editor-config.json", () => {
    expect(readStage(EDITOR_CFG, LAYER_ID)).toEqual({
      ok: true,
      stage: {
        wfsBase: "https://geoportal.udp.data-dna.eu/geoserver/de1/ows",
        typeName: "geo-containers",
        proxyPath: "/api/wfs-proxy",
      },
    });
  });

  it("fehlender Layer, fehlende oder leere Schlüssel → Fehler mit Text, kein Standard", () => {
    expect(readStage({ layers: {} }, LAYER_ID)).toEqual({
      ok: false,
      error: "p2d2-editor-config: layers.p2d2-geo-containers fehlt",
    });
    expect(readStage(null, LAYER_ID).ok).toBe(false);
    const r = readStage({ layers: { [LAYER_ID]: { wfsBase: "https://x/ows", typeName: " " } } }, LAYER_ID);
    expect(r).toEqual({
      ok: false,
      error: "p2d2-editor-config: layers.p2d2-geo-containers.typeName, proxyPath fehlt oder ist leer",
    });
    const q = readStage({ layers: { [LAYER_ID]: { ...STAGE, wfsBase: "https://x/ows?a=1" } } }, LAYER_ID);
    expect(q.ok).toBe(false);
  });
});

describe("selectionRequest mit p2d2-selection.json", () => {
  const kommune = (slug: string) => SELECTION.kommunen.find((k: any) => k.slug === slug);
  const kategorie = (slug: string) => SELECTION.kategorien.find((k: any) => k.slug === slug);

  it("Level je containerType aus der Auswahl-Datei", () => {
    const r = selectionRequest({ kommune: kommune("koeln"), kategorie: kategorie("friedhoefe"), stage: STAGE });
    expect(r.url).toBe(FORMER_LAYER_URL);
    const sf = selectionRequest({ kommune: kommune("san-francisco"), kategorie: kategorie("baume"), stage: STAGE });
    expect(sf.cql).toBe("wp_name='de-San Francisco' AND container_type='administrative' AND osm_admin_level=6");
  });

  it("jede Kombination aus Kommune und Kategorie ergibt einen Request", () => {
    for (const k of SELECTION.kommunen) {
      for (const c of SELECTION.kategorien) {
        expect(() => selectionRequest({ kommune: k, kategorie: c, stage: STAGE }), `${k.slug}|${c.slug}`).not.toThrow();
      }
    }
  });

  it("Kommune ohne Level für den containerType → Fehler", () => {
    expect(() =>
      selectionRequest({ kommune: { ...kommune("koeln"), osmAdminLevel: {} }, kategorie: kategorie("friedhoefe"), stage: STAGE }),
    ).toThrow(/level/);
  });
});
