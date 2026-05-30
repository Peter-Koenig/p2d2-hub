// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurDataManager: WFS-Daten laden für Friedhöfe + Grabflure
//
// Verantwortlichkeiten:
// - Friedhofs-Polygone via WFS laden (container_type='cemetery' AND osm_admin_level=8)
// - Grabflur-Polygone on-demand per BBOX-Filter laden
// - Kein map-/view-Zugriff – gibt nur Daten zurück
// - Kein fit() – das macht der Orchestrator

import GeoJSON from "ol/format/GeoJSON";
import type Feature from "ol/Feature";
import type { Geometry } from "ol/geom";
import { transformExtent } from "ol/proj";
import { wfsAuthClient } from "@/utils/wfs-auth";

// ---------------------------------------------------------------------------
// GrabflurDataManager
// ---------------------------------------------------------------------------

/**
 * Lädt WFS-Daten für den Grabflur-Editor.
 *
 * Zwei Ladevorgänge:
 * 1. `loadFriedhoefe()` – alle Friedhöfe der Kommune (einmalig beim Start)
 * 2. `loadGrabflureForFriedhof()` – Grabflure eines bestimmten Friedhofs
 *    (on-demand nach Klick auf Friedhof, per BBOX-Filter)
 *
 * Beide Methoden geben `Feature<Geometry>[]` zurück – das Hinzufügen zu
 * Layern und das fit() obliegt dem Aufrufer (Orchestrator).
 */
export default class GrabflurDataManager {
  private geojsonFormat: GeoJSON;

  constructor() {
    this.geojsonFormat = new GeoJSON();
  }

  /**
   * Lädt alle Friedhofs-Polygone der Kommune via WFS.
   *
   * Sucht nach:
   *   container_type='cemetery'
   *   AND osm_admin_level=8
   *   AND wp_name='{wpName}'
   *
   * Setzt auf jedem Feature die Attribute `name` und `container_type`.
   *
   * @param wpName     Workplace-Name (z. B. "de-Koeln")
   * @param projection Aktive Kartenprojektion (z. B. "EPSG:3857" oder "EPSG:25832")
   * @returns          Array von OpenLayers-Features (leer bei keinem Treffer)
   * @throws           Bei WFS-Fehlern (HTTP-Status, Netzwerk)
   */
  async loadFriedhoefe(
    wpName: string,
    projection: string,
  ): Promise<Feature<Geometry>[]> {
    const baseUrl = wfsAuthClient.buildWFSURL("geo-containers");
    const cqlFilter = [
      `container_type='cemetery'`,
      `osm_admin_level=8`,
      `wp_name='${wpName}'`,
    ].join(" AND ");
    const wfsUrl = `${baseUrl}&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;

    const response = await wfsAuthClient.fetchWFS(wfsUrl);
    if (!response.ok) {
      throw new Error(
        `WFS-Fehler beim Laden der Friedhöfe: ${response.status} ${response.statusText}`,
      );
    }

    const geojson = await response.json();
    const features = this.geojsonFormat.readFeatures(geojson, {
      dataProjection: "EPSG:4326",
      featureProjection: projection,
    });

    // Attribute aus den Roh-Properties übernehmen
    if (geojson.features) {
      geojson.features.forEach((raw: any, i: number) => {
        if (features[i]) {
          features[i].set("name", raw.properties?.name || "Unbenannt");
          features[i].set(
            "container_type",
            raw.properties?.container_type || "",
          );
        }
      });
    }

    return features;
  }

  /**
   * Lädt Grabflur-Polygone für einen bestimmten Friedhof via BBOX-Filter.
   *
   * Der Extent des Friedhofs wird von der Kartenprojektion nach
   * EPSG:4326 transformiert und als BBOX an den WFS gesendet.
   *
   * Setzt auf jedem Feature:
   *   p2d2_uuid, fh_nr, fh_name, flur_nr, wp_name, workflow_status, name
   *
   * @param friedhofExtent Extent des Friedhofs in der Kartenprojektion
   * @param projection     Aktive Kartenprojektion
   * @returns              Array von OpenLayers-Features (leer bei keinem Treffer)
   * @throws               Bei WFS-Fehlern
   */
  async loadGrabflureForFriedhof(
    friedhofExtent: number[],
    projection: string,
  ): Promise<Feature<Geometry>[]> {
    // Extent von der Kartenprojektion nach WGS84 transformieren
    const extentWGS84 = transformExtent(
      friedhofExtent,
      projection,
      "EPSG:4326",
    );
    const bboxFilter = [
      extentWGS84[0],
      extentWGS84[1],
      extentWGS84[2],
      extentWGS84[3],
      "EPSG:4326",
    ].join(",");

    const wfsUrl = wfsAuthClient.buildWFSURL("grabflure", {
      bbox: bboxFilter,
    });

    const response = await wfsAuthClient.fetchWFS(wfsUrl);
    if (!response.ok) {
      throw new Error(
        `WFS-Fehler beim Laden der Grabflure: ${response.status} ${response.statusText}`,
      );
    }

    const geojson = await response.json();
    const features = this.geojsonFormat.readFeatures(geojson, {
      dataProjection: "EPSG:4326",
      featureProjection: projection,
    });

    // Attribute aus den Roh-Properties übernehmen
    if (geojson.features) {
      geojson.features.forEach((raw: any, i: number) => {
        if (features[i]) {
          const p = raw.properties || {};
          features[i].set("p2d2_uuid", p.p2d2_uuid || "");
          features[i].set("fh_nr", p.fh_nr || "");
          features[i].set("fh_name", p.fh_name || "");
          features[i].set("flur_nr", p.flur_nr || "");
          features[i].set("wp_name", p.wp_name || "");
          features[i].set("workflow_status", p.workflow_status || "");
          // Anzeigename für Hover-Popup
          const label = p.flur_nr
            ? `Flur ${p.flur_nr}`
            : p.fh_name || "Unbenannt";
          features[i].set("name", label);
        }
      });
    }

    return features;
  }
}
