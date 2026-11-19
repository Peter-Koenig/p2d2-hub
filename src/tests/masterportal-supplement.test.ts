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

// Erwartete innere WFS-URL (Workspace de1, Friedhöfe Köln).
const INNER_WFS =
  "https://geoportal.udp.data-dna.eu/geoserver/de1/ows?service=WFS&version=2.0.0&request=GetFeature" +
  "&typeName=geo-containers&outputFormat=application%2Fjson&srsName=EPSG%3A4326" +
  "&CQL_FILTER=wp_name%3D'de-K%C3%B6ln'%20AND%20container_type%3D'cemetery'%20AND%20osm_admin_level%3D8";

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
    expect(refs).toEqual(["p2d2-osm", "p2d2-geo-containers-koeln", "p2d2-osm"]);
    for (const id of refs) expect(svcIds.has(id), id).toBe(true);
  });

  it("TopPlus Open (ID 3) und zoomTo auf nicht vorhandenen Layer sind entfernt", () => {
    expect(svcIds.has("3")).toBe(false);
    expect(JSON.stringify(cfg)).not.toContain("unterkuenfte_wfs");
    expect(cfg.portalConfig.map.zoomTo).toBeUndefined();
  });

  it("extent [minX,minY,maxX,maxY] ist geordnet und enthält startCenter", () => {
    const [minX, minY, maxX, maxY] = mapView.extent;
    const [cx, cy] = mapView.startCenter;
    expect(minX).toBeLessThan(maxX);
    expect(minY).toBeLessThan(maxY);
    expect(cx).toBeGreaterThan(minX);
    expect(cx).toBeLessThan(maxX);
    expect(cy).toBeGreaterThan(minY);
    expect(cy).toBeLessThan(maxY);
    expect(mapView.epsg).toBe("EPSG:25832");
    const levels = mapView.options.map((o: any) => o.zoomLevel);
    expect(levels).toContain(mapView.startZoomLevel);
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

  it("Friedhofs-Layer: GeoJSON über den Stage-Proxy, Style vorhanden", () => {
    const fh = svc.find((l) => l.id === "p2d2-geo-containers-koeln");
    expect(fh.typ).toBe("GeoJSON");
    const prefix = "/api/wfs-proxy?url=";
    expect(fh.url.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(fh.url.slice(prefix.length))).toBe(INNER_WFS);
    expect(styles.some((s) => s.styleId === fh.styleId)).toBe(true);
    expect(styles.some((s) => s.styleId === "unterkuenfte")).toBe(true);
  });
});
