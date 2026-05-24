// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: OpenLayers-Karteninitialisierung mit Projektions-Registrierung
import { Map as OLMap, View } from "ol";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { defaults } from "ol/control/defaults";
import FullScreen from "ol/control/FullScreen";
// KORREKTUR: 'get' importieren
import { transformExtent, get as getProjection } from "ol/proj";

// --- BUGFIX START ---
// Explizite Registrierung von proj4, um Caching/HMR-Probleme zu beheben.
// Diese Importe stellen sicher, dass proj4 VOR getProjection() bekannt ist.
import proj4 from "proj4";
import { register } from "ol/proj/proj4";
register(proj4);
// --- BUGFIX ENDE ---

import { registerUtm } from "@/utils/crs";
import { calculateUtmResolutions } from "@/utils/utm-resolutions";
import { ViewHistoryManager } from "@/utils/view-history-manager";
import { MAP_CONFIG } from "@/config/map-config";

/**
 * Verwaltet die Erstellung und Konfiguration der OpenLayers-Karte.
 */
export class MapManager {
  private map: OLMap;
  private view: View;
  private viewHistory: ViewHistoryManager;

  constructor(targetId: string, projection: string) {
    // 1. Projektion registrieren
    try {
      registerUtm(projection);
    } catch (error) {
      console.warn(
        `[MapManager] Registrierung der Projektion ${projection} fehlgeschlagen`,
        error,
      );
    }

    // 2. Auflösungen berechnen
    const resolutions = calculateUtmResolutions();

    // --- KORREKTUR: Projektions-Objekt explizit abrufen ---
    const projectionObject = getProjection(projection);
    if (!projectionObject) {
      // Dieser Fehler ist klarer als der OpenLayers-Fehler
      throw new Error(
        `[MapManager] Projektion '${projection}' konnte nicht von OpenLayers gefunden werden. (Registrierung fehlgeschlagen?)`,
      );
    }
    // --- ENDE KORREKTUR ---

    // 3. View erstellen
    this.view = new View({
      projection: projectionObject, // <-- KORREKTUR: Objekt statt String
      center: MAP_CONFIG.INITIAL_CENTER, // Wird sofort überschrieben
      zoom: MAP_CONFIG.INITIAL_ZOOM,
      resolutions: resolutions,
      maxZoom: resolutions.length - 1,
      minZoom: 0,
    });

    // 4. Karte erstellen
    this.map = new OLMap({
      target: targetId,
      view: this.view,
      layers: [
        new TileLayer({
          source: new OSM(),
          zIndex: MAP_CONFIG.Z_INDEX.BASE,
        }),
      ],
      controls: defaults({
        zoom: MAP_CONFIG.CONTROLS.ZOOM,
        rotate: MAP_CONFIG.CONTROLS.ROTATE,
        attribution: MAP_CONFIG.CONTROLS.ATTRIBUTION,
      }).extend([new FullScreen()]),
    });

    // 5. View History Manager initialisieren
    this.viewHistory = new ViewHistoryManager(this.view);
  }

  public getMap(): OLMap {
    return this.map;
  }

  public getViewHistory(): ViewHistoryManager {
    return this.viewHistory;
  }

  /**
   * Zoomt die Karte auf den initialen Extent.
   */
  public fitToInitialExtent(extentWGS84: number[]) {
    const transformedExtent = transformExtent(
      extentWGS84,
      "EPSG:4326",
      this.view.getProjection().getCode(),
    );

    // Warten auf Map-Render, um korrekte Größe zu haben
    this.map.once("postrender", () => {
      this.map.updateSize();
      const mapSize = this.map.getSize();
      if (mapSize && mapSize[0] > 0 && mapSize[1] > 0) {
        this.view.fit(transformedExtent, {
          size: mapSize,
          ...MAP_CONFIG.FIT_VIEW,
        });

        // Initiale Ansicht zur History hinzufügen
        this.viewHistory.pushState();
      } else {
        console.warn("[MapManager] Map-Größe ist 0, Fit-View verzögert.");
        setTimeout(() => this.fitToInitialExtent(extentWGS84), 200);
      }
    });
  }
}
