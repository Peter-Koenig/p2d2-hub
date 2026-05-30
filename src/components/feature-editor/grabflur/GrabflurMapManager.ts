// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurMapManager: Karten-Initialisierung für den Grabflur-Editor
//
// Eigenständige Implementierung (kein Wrapper um MapManager aus
// feature-editor/). Löst die Race-Condition beim WFS-Load explizit
// durch ein zweistufiges postrender-Pattern in fitToSource().

import { Map as OLMap, View } from "ol";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { defaults as defaultControls } from "ol/control/defaults";
import FullScreen from "ol/control/FullScreen";
import { defaults as defaultInteractions } from "ol/interaction";
import { transformExtent, get as getProjection } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import { MAP_CONFIG } from "@/config/map-config";
import { ViewHistoryManager } from "@/utils/view-history-manager";
import { registerUtm } from "@/utils/crs";
import { calculateUtmResolutions } from "@/utils/utm-resolutions";

// --- proj4-Registrierung (für UTM-Projektionen) ---
import proj4 from "proj4";
import { register } from "ol/proj/proj4";
register(proj4);

/**
 * Optionen für fitToSource() – analog zu OpenLayers' View.fit()-Optionen,
 * aber auf die für den Grabflur-Editor relevanten Felder reduziert.
 */
export interface FitOptions {
  padding?: [number, number, number, number];
  maxZoom?: number;
  duration?: number;
}

/**
 * Verwaltet die OpenLayers-Karte für den Grabflur-Editor.
 *
 * Verantwortlichkeiten:
 * - Map-Erstellung mit UTM-Projektion
 * - View-Initialisierung
 * - ViewHistory-Manager
 * - DblClickZoom-Deaktivierung
 * - fitToSource() mit postrender-Guard (Race-Condition-Lösung)
 */
export default class GrabflurMapManager {
  private map: OLMap;
  private view: View;
  private viewHistory: ViewHistoryManager;
  private initialized = false;

  constructor(targetId: string, projection: string) {
    // 1. Projektion registrieren (UTM / EPSG-gestützt)
    try {
      registerUtm(projection);
    } catch (error) {
      console.warn(
        "[GrabflurMapManager] Registrierung der Projektion",
        projection,
        "fehlgeschlagen",
        error,
      );
    }

    // 2. Auflösungen berechnen
    const resolutions = calculateUtmResolutions();

    // 3. Projektions-Objekt abrufen
    const projectionObject = getProjection(projection);
    if (!projectionObject) {
      throw new Error(
        `[GrabflurMapManager] Projektion '${projection}' konnte nicht von OpenLayers gefunden werden (Registrierung fehlgeschlagen?)`,
      );
    }

    // 4. View erstellen
    this.view = new View({
      projection: projectionObject,
      center: MAP_CONFIG.INITIAL_CENTER,
      zoom: MAP_CONFIG.INITIAL_ZOOM,
      resolutions,
      maxZoom: resolutions.length - 1,
      minZoom: 0,
    });

    // 5. Karte erstellen (mit OSM als Fallback-Basis)
    this.map = new OLMap({
      target: targetId,
      view: this.view,
      layers: [
        new TileLayer({
          source: new OSM(),
          zIndex: MAP_CONFIG.Z_INDEX.BASE,
        }),
      ],
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
      controls: defaultControls({
        zoom: MAP_CONFIG.CONTROLS.ZOOM,
        rotate: MAP_CONFIG.CONTROLS.ROTATE,
        attribution: MAP_CONFIG.CONTROLS.ATTRIBUTION,
      }).extend([new FullScreen()]),
    });

    // 6. ViewHistory initialisieren
    this.viewHistory = new ViewHistoryManager(this.view);

    // 7. DblClickZoom deaktivieren (stört die 1-Klick/2-Klick-Erkennung)
    this.map.getInteractions().forEach((interaction) => {
      if (interaction.constructor.name === "DoubleClickZoom") {
        interaction.setActive(false);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Öffentliche API
  // -----------------------------------------------------------------------

  /** Gibt die OpenLayers-Map-Instanz zurück. */
  getMap(): OLMap {
    return this.map;
  }

  /** Gibt den ViewHistoryManager zurück. */
  getViewHistory(): ViewHistoryManager {
    return this.viewHistory;
  }

  /**
   * Führt einen fit() auf die angegebene VectorSource aus – jedoch erst
   * NACH dem ersten postrender, damit die Map garantiert eine echte Größe
   * hat (nicht [0,0]).
   *
   * Dies löst die bekannte Race-Condition beim initialen WFS-Load.
   *
   * @param source    VectorSource mit den geladenen Features
   * @param options   Optionen für fit() (padding, maxZoom, duration)
   */
  fitToSource(source: VectorSource, options?: FitOptions): void {
    // Bereits initialisiert → sofort fit() ausführen
    if (this.initialized) {
      this.executeFit(source, options);
      this.viewHistory.pushState();
      return;
    }

    // Erster Aufruf → auf postrender warten
    this.map.once("postrender", () => {
      this.map.updateSize();
      const mapSize = this.map.getSize();
      if (mapSize && mapSize[0] > 0 && mapSize[1] > 0) {
        this.executeFit(source, options);
        this.viewHistory.pushState(); // Initialen Übersichts-Zoom speichern
        this.initialized = true;
      } else {
        // Fallback: erneuter Versuch nach 200ms
        console.warn(
          "[GrabflurMapManager] Map-Größe ist 0 – wiederhole fit() in 200ms",
        );
        setTimeout(() => this.fitToSource(source, options), 200);
      }
    });

    // Sicherstellen, dass ein Render getriggert wird
    this.map.render();
  }

  /**
   * Führt einen fit() auf eine manuell berechnete BBOX aus.
   * Wird z. B. verwendet, wenn der Cemetery-Extent bereits bekannt ist.
   *
   * @param extent    [minX, minY, maxX, maxY] in der Kartenprojektion
   * @param options   Optionen für fit() (padding, maxZoom, duration)
   */
  fitToExtent(extent: number[], options?: FitOptions): void {
    if (!extent || !extent.every(Number.isFinite)) {
      console.warn("[GrabflurMapManager] Ungültiger Extent für fitToExtent");
      return;
    }

    const mapSize = this.map.getSize();
    if (mapSize && mapSize[0] > 0 && mapSize[1] > 0) {
      this.view.fit(extent, {
        size: mapSize,
        padding: options?.padding ?? [50, 50, 50, 50],
        maxZoom: options?.maxZoom ?? 20,
        duration: options?.duration ?? 400,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Privat
  // -----------------------------------------------------------------------

  /**
   * Führt den eigentlichen fit()-Aufruf aus (ohne postrender-Guard).
   */
  private executeFit(source: VectorSource, options?: FitOptions): void {
    const extent = source.getExtent();
    const mapSize = this.map.getSize();

    if (!mapSize || mapSize[0] <= 0 || !extent.every(Number.isFinite)) {
      console.warn(
        "[GrabflurMapManager] executeFit abgebrochen – ungültige Map-Größe oder Extent",
        { mapSize, extent },
      );
      return;
    }

    this.view.fit(extent, {
      size: mapSize,
      padding: options?.padding ?? [50, 50, 50, 50],
      maxZoom: options?.maxZoom ?? 16,
    });
  }
}
