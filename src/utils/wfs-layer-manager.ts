/**
 * WFS Layer Manager - Complete corrected version
 * State-of-the-Art WFS Layer Management für p2d2
 */

import { Map as OLMap } from "ol";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { wfsAuthClient } from "./wfs-auth";
import { dispatchCrossWindowEvent } from "./cross-window-events";
import { P2D2EventType } from "./events";

// Type definitions
interface WFSLayerConfig {
  wpName: string;
  containerType: string;
  osmAdminLevel: number;
}

interface KommuneData {
  slug: string;
  wp_name: string;
  osmAdminLevels: number[];
}

export class WFSLayerManager {
  private map: OLMap;
  private activeLayer: VectorLayer<VectorSource> | null = null;
  private currentState: {
    kommune: KommuneData | null;
    categorySlug: string | null;
  } = { kommune: null, categorySlug: null };
  private layerCache = new Map<string, VectorLayer<VectorSource>>();

  constructor(map: OLMap) {
    this.map = map;
  }

  /**
   * Toggle WFS layer for kommune/kategorie combination
   */
  async toggleLayer(kommune: KommuneData, categorySlug: string): Promise<void> {
    try {
      const isSameSelection = this.isSameSelection(kommune, categorySlug);

      if (isSameSelection && this.activeLayer) {
        // Toggle OFF: Hide current layer
        this.hideLayer();
        // Button-States werden von Grid-Komponenten verwaltet
      } else {
        // Toggle ON: Show new layer (or switch to different)
        await this.displayLayer(kommune, categorySlug);
        // Button-States werden von Grid-Komponenten verwaltet
      }
    } catch (error) {
      console.error("[WFS] Toggle failed:", error);
    }
  }

  /**
   * Enhanced displayLayer with state management
   */
  async displayLayer(
    kommune: KommuneData,
    categorySlug: string,
  ): Promise<void> {
    try {
      // NEU: Event dispatchen
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_START, {
        layerName: `${kommune.wp_name}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        timestamp: Date.now(),
      });

      // Hide existing layer but keep cached
      if (this.activeLayer) {
        this.activeLayer.setVisible(false);
      }

      // Button-States werden von Grid-Komponenten verwaltet

      const config = this.buildLayerConfig(kommune, categorySlug);
      const cacheKey = `${config.wpName}-${config.containerType}-${config.osmAdminLevel}`;

      // Try to get from cache first
      let layer = this.layerCache.get(cacheKey);
      if (!layer) {
        console.log("[WFS] Creating new layer for:", cacheKey);
        layer = await this.createWFSLayer(config);
        this.layerCache.set(cacheKey, layer);
        this.map.addLayer(layer);
      } else {
        console.log("[WFS] Reusing cached layer for:", cacheKey);
      }

      this.activeLayer = layer;

      // Show layer
      this.activeLayer.setVisible(true);

      // NEU: Event dispatchen
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_COMPLETE, {
        layerName: `${kommune.wp_name}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        featureCount: 0, // TODO: actual feature count
        timestamp: Date.now(),
        success: true,
      });

      // Update state
      this.currentState = { kommune, categorySlug };

      console.log(
        `[WFS] Layer displayed: ${config.wpName} - ${config.containerType}`,
      );
    } catch (error) {
      console.error("[WFS] Failed to display layer:", error);
      // NEU: Event dispatchen
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_ERROR, {
        layerName: `${kommune.wp_name}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Enhanced hideLayer with state management
   */
  hideLayer(): void {
    if (this.activeLayer) {
      this.activeLayer.setVisible(false);
      this.currentState = { kommune: null, categorySlug: null };
      // Button-States werden von Grid-Komponenten verwaltet
      console.log("[WFS] Layer hidden");
    }
  }

  /**
   * Build WFS layer configuration from kommune and category
   */
  private buildLayerConfig(
    kommune: KommuneData,
    categorySlug: string,
  ): WFSLayerConfig {
    const containerType = this.getContainerType(categorySlug);
    const osmAdminLevel = this.getOsmAdminLevel(kommune, containerType);

    return {
      wpName: kommune.wp_name,
      containerType,
      osmAdminLevel,
    };
  }

  /**
   * Map category slug to container type
   */
  private getContainerType(categorySlug: string): string {
    // Try to get from embedded client-side category data first
    try {
      const categoryDataElement = document.getElementById("category-data");
      if (categoryDataElement) {
        const categoryMapStr =
          categoryDataElement.getAttribute("data-category-map");
        if (categoryMapStr) {
          const categoryMap = JSON.parse(categoryMapStr);
          if (categoryMap[categorySlug]?.containerType) {
            return categoryMap[categorySlug].containerType;
          }
        }
      }
    } catch (error) {
      console.error("[WFS] Failed to load category data from HTML:", error);
    }

    // Fehler werfen statt Fallback, wenn containerType nicht gefunden
    const errorMsg =
      `[WFS] No containerType found for category '${categorySlug}'. ` +
      `Make sure the category exists in src/content/kategorien/ ` +
      `and has a 'containerType' field in its frontmatter.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Determine OSM admin level based on kommune and container type
   */
  private getOsmAdminLevel(
    kommune: KommuneData,
    containerType: string,
  ): number {
    if (containerType === "cemetery") {
      return 8; // Friedhöfe immer Level 8
    }

    if (containerType === "administrative") {
      const levels = kommune.osmAdminLevels || [];

      // Verbesserte OSM Admin Level Logik für administrative Ebenen
      console.log("[WFS] OSM Admin Levels for", kommune.slug, ":", levels);

      // Regel: Nimm die NÄCHSTE Ebene nach der Kommune-Grenze
      if (levels.length > 1) {
        // Zweites Element = nächste Untergliederung nach Kommune-Grenze
        const nextLevel = levels[1];
        console.log(
          "[WFS] Using next admin level:",
          nextLevel,
          "from levels:",
          levels,
        );
        return nextLevel;
      } else if (levels.length === 1) {
        // Einzige verfügbare Ebene (Sonderfall wie Stadtstaaten)
        const onlyLevel = levels[0];
        console.log("[WFS] Using only available admin level:", onlyLevel);
        return onlyLevel;
      } else {
        console.warn(
          "[WFS] No OSM admin levels available for",
          kommune.slug,
          "using fallback 8",
        );
      }
    }

    return 8; // Fallback
  }

  /**
   * Create OpenLayers WFS VectorLayer
   */
  private async createWFSLayer(
    config: WFSLayerConfig,
  ): Promise<VectorLayer<VectorSource>> {
    console.log("[WFS] WFS request with:", {
      wp_name: config.wpName,
      containertype: config.containerType,
      osmadminlevel: config.osmAdminLevel,
    });

    // Create properly encoded CQL filter - wp_name should NOT be double-encoded
    const cqlFilter = `wp_name='${config.wpName}' AND container_type='${config.containerType}' AND osm_admin_level=${config.osmAdminLevel}`;

    const wfsUrl = wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    // Create vector layer
    const layer = new VectorLayer({
      source: new VectorSource({
        url: wfsUrl,
        format: new GeoJSON(),
      }),
      style: new Style({
        stroke: new Stroke({
          color: "#FF6900",
          width: 2,
        }),
        fill: new Fill({
          color: "rgba(255, 105, 0, 0.1)",
        }),
      }),
      visible: true,
    });

    return layer;
  }

  /**
   * Check if selection is same as current
   */
  private isSameSelection(kommune: KommuneData, categorySlug: string): boolean {
    return (
      this.currentState.kommune?.slug === kommune.slug &&
      this.currentState.categorySlug === categorySlug
    );
  }

  /**
   * Get current active layer (for debugging)
   */
  getActiveLayer(): VectorLayer<VectorSource> | null {
    return this.activeLayer;
  }

  /**
   * Check if layer is currently displayed
   */
  hasActiveLayer(): boolean {
    return this.activeLayer !== null;
  }

  /**
   * Get current state (for debugging)
   */
  getCurrentState() {
    return {
      ...this.currentState,
      hasActiveLayer: this.hasActiveLayer(),
      isVisible: this.activeLayer?.getVisible() || false,
    };
  }
}

export default WFSLayerManager;
