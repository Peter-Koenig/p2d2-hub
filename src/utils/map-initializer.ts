/**
 * Map Initializer Module for Feature Editor
 * Centralizes map creation with proper configuration
 */

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
    // Register UTM projection if needed (for EPSG:25832 support)
    try {
        registerUtm("EPSG:25832");
    } catch (error) {
        console.warn("Failed to register UTM projection, using default:", error);
    }

    // Calculate resolutions for UTM projection
    const resolutions = calculateUtmResolutions();

    // Create base OSM layer
    const baseLayer = new TileLayer({
        source: new OSM(),
        zIndex: 5, // Base layer z-index
    });

    // Create map view with UTM configuration
    const view = new View({
        projection: "EPSG:25832", // Use UTM by default for better precision
        center: [0, 0], // Will be set by feature extent
        zoom: 0,
        resolutions: resolutions,
        maxZoom: resolutions.length - 1,
        minZoom: 0,
    });

    // Create map with controls
    const map = new OLMap({
        target: targetId,
        layers: [baseLayer],
        view: view,
        controls: defaults().extend([
            new FullScreen({
                className: "custom-fullscreen",
                label: "⛶",
                labelActive: "✕",
                tipLabel: "Vollbildmodus",
            }),
        ]),
    });

    // Log initialization for debugging
    console.log("FeatureEditor map initialized", {
        projection: view.getProjection().getCode(),
        target: targetId,
        resolutions: resolutions.length,
    });

    return map;
}
