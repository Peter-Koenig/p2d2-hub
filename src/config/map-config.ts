// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/**
 * Centralized Map Configuration
 * Provides consistent configuration across all map components
 */

export const MAP_CONFIG = {
  // Projection settings
  PROJECTION: "EPSG:25832" as const,

  // Initial view settings
  INITIAL_CENTER: [376000, 5648000] as [number, number], // Cologne area
  INITIAL_ZOOM: 12,

  // Layer z-index hierarchy
  Z_INDEX: {
    BASE: 5, // OSM base layer
    LUFTBILD: 7, // Kölner Luftbild 2024
    CEMETERY_BG: 10, // Cemetery background polygon
    GEOTIFF: 12, // Future: GeoTIFF layer
    ORTHOPHOTO: 13, // Future: Orthophoto layer
    BASEMAP: 15, // basemap.de Layer
    GRABFLUR: 20, // Grabflur polygons
    GRAVES: 25, // Future: Individual graves
    LABELS: 30, // Future: Text labels
    CONTROLS: 40, // UI elements/overlays
  },

  // Control settings
  CONTROLS: {
    ZOOM: true,
    ROTATE: false, // Disabled for better performance
    ATTRIBUTION: true,
  },

  // FullScreen control settings
  FULLSCREEN: {
    CLASS_NAME: "custom-fullscreen",
    LABEL: "⛶",
    LABEL_ACTIVE: "✕",
    TIP_LABEL: "Vollbildmodus",
  },

  // Fit view settings
  FIT_VIEW: {
    DURATION: 500,
    PADDING: [20, 20, 20, 20] as [number, number, number, number],
    MAX_ZOOM: 18,
    CONSTRAIN_RESOLUTION: false,
  },
} as const;
