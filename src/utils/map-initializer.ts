/**
 * Map Initializer Module for Feature Editor
 * Centralizes map creation with proper configuration
 */

import { MAP_CONFIG } from "../config/map-config";

import { logger } from "./logger";

import { Map as OLMap, View } from "ol";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { defaults } from "ol/control/defaults";
import FullScreen from "ol/control/FullScreen";
import { registerUtm } from "./crs";
import { calculateUtmResolutions } from "./utm-resolutions";

/**
 * Initialize a feature editor map with proper configuration
 * @param targetId - The HTML element ID for the map container
 * @returns Fully initialized OLMap instance
 */
export function initFeatureEditorMap(targetId: string): OLMap {
  // Check if DOM element exists
  const target = document.getElementById(targetId);
  if (!target) {
    logger.warn(`[MapInit] Map target element '${targetId}' not found`);
    return null as unknown as OLMap;
  }

  // Register UTM projection if needed (for EPSG:25832 support)
  try {
    registerUtm(MAP_CONFIG.PROJECTION);
  } catch (error) {
    logger.warn(
      "[MapInit] Failed to register UTM projection, using default:",
      error,
    );
  }

  // Calculate resolutions for UTM projection
  const resolutions = calculateUtmResolutions();

  // Create base OSM layer
  const baseLayer = new TileLayer({
    source: new OSM(),
    zIndex: MAP_CONFIG.Z_INDEX.BASE,
  });

  // Create map view with UTM configuration
  const view = new View({
    projection: MAP_CONFIG.PROJECTION,
    center: MAP_CONFIG.INITIAL_CENTER,
    zoom: MAP_CONFIG.INITIAL_ZOOM,
    resolutions: resolutions,
    maxZoom: resolutions.length - 1,
    minZoom: 0,
  });

  // Create map with controls
  const map = new OLMap({
    target: target,
    layers: [baseLayer],
    view: view,
    controls: buildControls(),
  });

  // Fix container height issue if needed
  if (target && target.clientHeight === 0) {
    logger.warn("[MapInit] Map container had height 0 - forcing updateSize()");
    target.style.minHeight = "400px";
    setTimeout(() => map.updateSize(), 100);
  }

  // Log initialization for debugging
  logger.info("[MapInit] FeatureEditor map initialized", {
    projection: map.getView().getProjection().getCode(),
    zoom: map.getView().getZoom(),
    target: targetId,
  });

  return map;
}

/**
 * Build map controls with optimized configuration
 */
function buildControls(): any[] {
  return defaults({
    zoom: MAP_CONFIG.CONTROLS.ZOOM,
    rotate: MAP_CONFIG.CONTROLS.ROTATE,
    attribution: MAP_CONFIG.CONTROLS.ATTRIBUTION,
  }).extend([
    new FullScreen({
      className: MAP_CONFIG.FULLSCREEN.CLASS_NAME,
      label: MAP_CONFIG.FULLSCREEN.LABEL,
      labelActive: MAP_CONFIG.FULLSCREEN.LABEL_ACTIVE,
      tipLabel: MAP_CONFIG.FULLSCREEN.TIP_LABEL,
    }),
  ]);
}
