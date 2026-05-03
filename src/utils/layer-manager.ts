// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/**
 * Layer Management Module for Feature Editor
 * Centralizes layer creation, toggling, and control initialization
 */

import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS";

import { MAP_CONFIG } from "../config/map-config";

// Layer Z-Index constants for consistent ordering
// Hierarchie: Luftbild < OSM < basemap.de < Features < Labels < Controls
export const LAYER_ZINDEX = MAP_CONFIG.Z_INDEX;

// Global variables for layer management
let luftbildLayer: TileLayer | null = null; // Kölner Luftbild WMS Layer
let basemapLayer: TileLayer | null = null; // basemap.de WMTS Layer

export function getLuftbildLayer(): TileLayer | null {
  return luftbildLayer;
}

export function getBasemapLayer(): TileLayer | null {
  return basemapLayer;
}

/**
 * Create Luftbild WMS Layer for Cologne
 * Service: Stadt Köln Luftbilder 2024
 * URL: https://geoportal.stadt-koeln.de/wss/service/luftbilder_2024_wms/guest
 * Layer: luftbilder_2024_23
 * Unterstützt EPSG:3857 und EPSG:25832
 */
export function createLuftbildLayer(projection: string): TileLayer {
  const supportedProjections = ["EPSG:3857", "EPSG:25832"];
  const useProjection = supportedProjections.includes(projection)
    ? projection
    : "EPSG:3857";

  const layer = new TileLayer({
    source: new TileWMS({
      url: "https://geoportal.stadt-koeln.de/wss/service/luftbilder_2024_wms/guest",
      params: {
        LAYERS: "luftbilder_2024_23",
        FORMAT: "image/png",
        TILED: true,
      },
      projection: useProjection,
      crossOrigin: "anonymous",
    }),
    zIndex: MAP_CONFIG.Z_INDEX.LUFTBILD,
    visible: false,
  });

  luftbildLayer = layer;
  return layer;
}

/**
 * Create basemap.de WMS Layer
 * Service: Geodatenzentrum basemap.de WMS
 * URL: https://sgx.geodatenzentrum.de/wms_basemapde
 * Layer: de_basemapde_web_raster_farbe (Farb-Variante) oder de_basemapde_web_raster_grau (Grau-Variante)
 * Unterstützt EPSG:3857 und EPSG:25832
 */
export function createBasemapLayer(): TileLayer {
  const layer = new TileLayer({
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
    zIndex: MAP_CONFIG.Z_INDEX.BASEMAP,
    visible: false,
  });

  basemapLayer = layer;
  return layer;
}

/**
 * Toggle base layer visibility
 * Unabhängiges Umschalten: Beide Layer können gleichzeitig aktiv sein
 * Persistiert beide States separat in localStorage
 * Aktualisiert Button-Status mit 'highlighted' Klasse
 */
export function toggleBaseLayer(layerName: string): void {
  if (layerName === "luftbild" && luftbildLayer) {
    // Toggle Luftbild unabhängig
    const newVisibility = !luftbildLayer.getVisible();
    luftbildLayer.setVisible(newVisibility);

    // Update nur den Luftbild-Button
    const luftbildBtn = document.querySelector(
      '[data-layer-toggle="luftbild"]',
    );
    if (luftbildBtn) {
      if (newVisibility) {
        luftbildBtn.classList.add("highlighted");
      } else {
        luftbildBtn.classList.remove("highlighted");
      }
    }
  } else if (layerName === "basemap" && basemapLayer) {
    // Toggle basemap.de unabhängig
    const newVisibility = !basemapLayer.getVisible();
    basemapLayer.setVisible(newVisibility);

    // Update nur den basemap-Button
    const basemapBtn = document.querySelector('[data-layer-toggle="basemap"]');
    if (basemapBtn) {
      if (newVisibility) {
        basemapBtn.classList.add("highlighted");
      } else {
        basemapBtn.classList.remove("highlighted");
      }
    }
  }

  // Persistiere beide States separat in localStorage
  try {
    localStorage.setItem(
      "luftbildVisible",
      String(luftbildLayer ? luftbildLayer.getVisible() : false),
    );
    localStorage.setItem(
      "basemapVisible",
      String(basemapLayer ? basemapLayer.getVisible() : false),
    );
  } catch (error) {
    console.warn("Could not persist layer states", error);
  }

  console.log("Layer toggle:", {
    luftbild: luftbildLayer ? luftbildLayer.getVisible() : false,
    basemap: basemapLayer ? basemapLayer.getVisible() : false,
  });
}

/**
 * Initialize layer controls and event listeners
 * Registriert Click-Handler für Layer-Toggle-Buttons
 * Stellt vorherige Layer-Auswahl aus localStorage wieder her
 * Positionierung: Rechts oben unterhalb des Fullscreen-Buttons
 */
export function initLayerControls(): void {
  // Add event listeners for layer toggle buttons
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest("[data-layer-toggle]");
    if (!button) return;

    const layerName = (button as HTMLElement).dataset.layerToggle;
    if (layerName) {
      toggleBaseLayer(layerName);
    }
  });

  // Restore previous layer states from localStorage
  try {
    const luftbildVisible = localStorage.getItem("luftbildVisible") === "true";
    const basemapVisible = localStorage.getItem("basemapVisible") === "true";

    if (luftbildVisible && luftbildLayer) {
      luftbildLayer.setVisible(true);
      const btn = document.querySelector('[data-layer-toggle="luftbild"]');
      if (btn) btn.classList.add("highlighted");
    }

    if (basemapVisible && basemapLayer) {
      basemapLayer.setVisible(true);
      const btn = document.querySelector('[data-layer-toggle="basemap"]');
      if (btn) btn.classList.add("highlighted");
    }
  } catch (error) {
    console.warn("Could not restore layer states from localStorage", error);
  }
}

/**
 * Get current layer states for debugging
 */
export function getLayerStates(): { luftbild: boolean; basemap: boolean } {
  return {
    luftbild: luftbildLayer ? luftbildLayer.getVisible() : false,
    basemap: basemapLayer ? basemapLayer.getVisible() : false,
  };
}
