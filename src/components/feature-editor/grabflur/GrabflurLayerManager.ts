// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurLayerManager: Layer-Registrierung und Hover-Popup
//
// Verantwortlichkeiten:
// - Friedhofs-Layer (zIndex 20)
// - Grabflur-Layer (zIndex 21, initial unsichtbar)
// - Luftbild-Layer (zIndex 7, initial unsichtbar)
// - basemap.de-Layer (zIndex 15, initial unsichtbar)
// - Hover-Overlay für Feature-Tooltips
//
// Keine Kenntnis von Session, Daten oder Interaktionen.

import type { Map as OLMap } from "ol";
import VectorLayer from "ol/layer/Vector";
import TileLayer from "ol/layer/Tile";
import VectorSource from "ol/source/Vector";
import TileWMS from "ol/source/TileWMS";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";

// ---------------------------------------------------------------------------
// Layer-Konstanten
// ---------------------------------------------------------------------------

const FRIEDHOF_STYLE = new Style({
  stroke: new Stroke({ color: "#FF6900", width: 2 }),
  fill: new Fill({ color: "rgba(255, 105, 0, 0.1)" }),
});

const GRABFLUR_STYLE = new Style({
  stroke: new Stroke({ color: "#FF6900", width: 1.5 }),
  fill: new Fill({ color: "rgba(255, 105, 0, 0.08)" }),
});

const HOVER_POPUP_CSS =
  "display:none;position:absolute;background:white;border:1px solid #FF6900;border-radius:6px;padding:6px 10px;font-size:13px;pointer-events:none;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15);";

// ---------------------------------------------------------------------------
// LayerManager
// ---------------------------------------------------------------------------

/**
 * Verwaltet alle OpenLayers-Layer für den Grabflur-Editor.
 *
 * Zwei Feature-Layer (Friedhöfe + Grabflure) und zwei optionale
 * Hintergrund-Layer (Luftbild, basemap.de).
 */
export default class GrabflurLayerManager {
  private friedhofSource: VectorSource;
  private friedhofLayer: VectorLayer<VectorSource>;

  private grabflureSource: VectorSource;
  private grabflureLayer: VectorLayer<VectorSource>;

  private luftbildLayer: TileLayer<TileWMS>;
  private basemapLayer: TileLayer<TileWMS>;

  private hoverPopupElement: HTMLDivElement;
  private hoverOverlay: Overlay;

  constructor(map: OLMap, projection: string) {
    // --- Friedhofs-Layer (zIndex 20, immer sichtbar) ---
    this.friedhofSource = new VectorSource();
    this.friedhofLayer = new VectorLayer({
      source: this.friedhofSource,
      zIndex: 20,
      style: FRIEDHOF_STYLE,
    });
    map.addLayer(this.friedhofLayer);

    // --- Grabflur-Layer (zIndex 21, initial unsichtbar) ---
    this.grabflureSource = new VectorSource();
    this.grabflureLayer = new VectorLayer({
      source: this.grabflureSource,
      zIndex: 21,
      visible: false,
      style: GRABFLUR_STYLE,
    });
    map.addLayer(this.grabflureLayer);

    // --- Luftbild (WMS Köln 2024, zIndex 7, initial unsichtbar) ---
    this.luftbildLayer = new TileLayer({
      source: new TileWMS({
        url: "https://geoportal.stadt-koeln.de/wss/service/luftbilder_2024_wms/guest",
        params: { LAYERS: "luftbilder_2024_23", FORMAT: "image/png", TILED: true },
        projection: projection,
        crossOrigin: "anonymous",
      }),
      zIndex: 7,
      visible: false,
    });
    map.addLayer(this.luftbildLayer);

    // --- basemap.de (WMS, zIndex 15, initial unsichtbar) ---
    this.basemapLayer = new TileLayer({
      source: new TileWMS({
        url: "https://sgx.geodatenzentrum.de/wms_basemapde",
        params: {
          LAYERS: "de_basemapde_web_raster_farbe",
          FORMAT: "image/png",
          TRANSPARENT: "true",
          TILED: true,
        },
        projection: "EPSG:3857",
        crossOrigin: "anonymous",
      }),
      zIndex: 15,
      visible: false,
    });
    map.addLayer(this.basemapLayer);

    // --- Hover-Popup (Overlay) ---
    this.hoverPopupElement = document.createElement("div");
    this.hoverPopupElement.className = "grabflur-hover-popup";
    this.hoverPopupElement.style.cssText = HOVER_POPUP_CSS;
    document.body.appendChild(this.hoverPopupElement);

    this.hoverOverlay = new Overlay({
      element: this.hoverPopupElement,
      positioning: "bottom-center",
      offset: [0, -10],
      stopEvent: false,
    });
    map.addOverlay(this.hoverOverlay);
  }

  // -----------------------------------------------------------------------
  // Layer-Queries
  // -----------------------------------------------------------------------

  /** Friedhofs-Layer (Polygone der Friedhöfe). */
  getFriedhofLayer(): VectorLayer<VectorSource> {
    return this.friedhofLayer;
  }

  /** Source des Friedhofs-Layers (für fitToSource, clear, addFeatures). */
  getFriedhofSource(): VectorSource {
    return this.friedhofSource;
  }

  /** Grabflur-Layer (on-demand geladen). */
  getGrabflureLayer(): VectorLayer<VectorSource> {
    return this.grabflureLayer;
  }

  /** Source des Grabflur-Layers. */
  getGrabflureSource(): VectorSource {
    return this.grabflureSource;
  }

  /** Luftbild-Layer. */
  getLuftbildLayer(): TileLayer<TileWMS> {
    return this.luftbildLayer;
  }

  /** basemap.de-Layer. */
  getBasemapLayer(): TileLayer<TileWMS> {
    return this.basemapLayer;
  }

  // -----------------------------------------------------------------------
  // Grabflur-Sichtbarkeit
  // -----------------------------------------------------------------------

  /** Setzt die Sichtbarkeit des Grabflur-Layers. */
  setGrabflureVisible(visible: boolean): void {
    this.grabflureLayer.setVisible(visible);
  }

  /** Leert alle Features aus dem Grabflur-Layer. */
  clearGrabflure(): void {
    this.grabflureSource.clear();
  }

  // -----------------------------------------------------------------------
  // Hover-Popup
  // -----------------------------------------------------------------------

  /** Gibt das Hover-Overlay zurück. */
  getHoverOverlay(): Overlay {
    return this.hoverOverlay;
  }

  /** Gibt das Hover-Popup-Element (für direkte DOM-Manipulation) zurück. */
  getHoverPopupElement(): HTMLDivElement {
    return this.hoverPopupElement;
  }

  /**
   * Zeigt das Hover-Popup an einer Koordinate.
   *
   * @param coordinate  Karten-Koordinate (in der aktuellen View-Projektion)
   * @param label       Typ-Label (z. B. "Friedhof" oder "Grabflur")
   * @param name        Feature-Name (z. B. "Flur 33" oder "Friedhof Deutz")
   */
  showHoverPopup(
    coordinate: number[],
    label: string,
    name: string,
  ): void {
    this.hoverPopupElement.innerHTML = `
      <div style="font-weight:600;color:#FF6900;">${label}</div>
      <div style="color:#374151;font-size:12px;">${name}</div>`;
    this.hoverPopupElement.style.display = "block";
    this.hoverOverlay.setPosition(coordinate);
  }

  /** Versteckt das Hover-Popup. */
  hideHoverPopup(): void {
    this.hoverPopupElement.style.display = "none";
    this.hoverOverlay.setPosition(undefined);
  }
}
