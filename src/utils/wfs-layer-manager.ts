/**
 * WFS Layer Manager - Complete corrected version
 * State-of-the-Art WFS Layer Management für p2d2
 *
 * Uses anonymous WFS read access (no credentials required).
 */

import { Map as OLMap } from "ol";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { wfsAuthClient } from "./wfs-auth";
import { dispatchCrossWindowEvent } from "./cross-window-events";
import { P2D2EventType } from "./events";
import { mapState } from "./map-state";
import type { KommuneData } from "./kommune-utils";

// Type definitions
interface WFSLayerConfig {
  wpName: string;
  containerType: string;
  osmAdminLevel: number;
}

export class WFSLayerManager {
  private map: OLMap;
  private activeLayer: VectorLayer<VectorSource> | null = null;
  private vectorSource: VectorSource | null = null;
  private currentState: {
    kommune: KommuneData | null;
    categorySlug: string | null;
  } = { kommune: null, categorySlug: null };
  private layerCache = new Map<string, VectorLayer<VectorSource>>();
  private unsubscribe: (() => void) | null = null;
  private isRequestPending: boolean = false;
  private lastLoadedSignature: string = "";

  constructor(map: OLMap) {
    this.map = map;

    // Create vector source and layer
    this.vectorSource = new VectorSource();
    const vectorLayer = new VectorLayer({
      source: this.vectorSource,
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
    this.map.addLayer(vectorLayer);
    this.activeLayer = vectorLayer;

    // Initialize state subscription
    this.initStateSubscription();

    console.log(
      "[WFSLayerManager] Initialized with reactive state subscription",
    );
  }

  /**
   * Initialize subscription to mapState changes
   */
  private initStateSubscription(): void {
    this.unsubscribe = mapState.subscribe((state) => {
      this.updateLayerBasedOnState(
        state.selectedKommune,
        state.selectedCategory,
      );
    });
  }

  /**
   * Update layer based on current mapState
   */
  private async updateLayerBasedOnState(
    kommune: KommuneData | null,
    categorySlug: string | null,
  ): Promise<void> {
    console.log("[WFS] State update:", {
      kommune: kommune?.slug,
      categorySlug,
      signature: `${kommune?.slug}|${categorySlug}`,
    });

    // If either kommune or category is missing, clear layer
    if (!kommune || !categorySlug) {
      console.log("[WFS] Missing state component, clearing layer");
      this.clearLayer();
      this.lastLoadedSignature = "";
      this.currentState = { kommune: null, categorySlug: null };
      return;
    }

    // Calculate signature to avoid unnecessary reloads
    const signature = `${kommune.slug}|${categorySlug}`;
    if (signature === this.lastLoadedSignature) {
      console.log("[WFS] Signature unchanged, skipping reload");
      return;
    }

    // Check if request is already pending
    if (this.isRequestPending) {
      console.log("[WFS] Request already pending, skipping");
      return;
    }

    // Update signature and load layer
    this.lastLoadedSignature = signature;
    await this.loadLayer(kommune, categorySlug);
  }

  /**
   * Load WFS layer for kommune and category
   */
  private async loadLayer(
    kommune: KommuneData,
    categorySlug: string,
  ): Promise<void> {
    try {
      this.isRequestPending = true;

      // Dispatch load start event
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_START, {
        layerName: `${kommune.wpName}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        timestamp: Date.now(),
      });

      // Get container type from category
      const containerType = this.getContainerType(categorySlug);
      const osmAdminLevel = this.getOsmAdminLevel(kommune, containerType);

      // Build CQL filter with correct field names for WFS (backend schema: wp_name, container_type, osm_admin_level)
      const cqlFilter = `wp_name='${kommune.wpName}' AND container_type='${containerType}' AND osm_admin_level=${osmAdminLevel}`;
      console.log("[WFS] CQL Filter:", cqlFilter);

      // Build WFS URL (anonymous read access)
      const wfsUrl = wfsAuthClient.buildWFSURL("p2d2_containers", {
        CQL_FILTER: cqlFilter,
        srsName: "EPSG:4326",
      });
      console.log("[WFS] Request URL:", wfsUrl);

      // Fetch GeoJSON data (anonymous)
      const response = await wfsAuthClient.fetchWFS(wfsUrl);
      if (!response.ok) {
        throw new Error(
          `WFS request failed: ${response.status} ${response.statusText}`,
        );
      }

      const geoJson = await response.json();
      const features = new GeoJSON().readFeatures(geoJson, {
        dataProjection: "EPSG:4326",
        featureProjection: this.map.getView().getProjection(),
      });

      console.log(`[WFS] Loaded ${features.length} features`);

      // Clear existing features and add new ones
      this.vectorSource?.clear();
      this.vectorSource?.addFeatures(features);

      // Update current state and ensure layer is visible
      this.currentState = { kommune, categorySlug };
      if (this.activeLayer) {
        this.activeLayer.setVisible(true);
      }

      // Dispatch load complete event
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_COMPLETE, {
        layerName: `${kommune.wpName}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        featureCount: features.length,
        timestamp: Date.now(),
        success: true,
      });
    } catch (error) {
      console.error("[WFS] Failed to load layer:", error);

      // Dispatch error event
      dispatchCrossWindowEvent(P2D2EventType.WFS_LOAD_ERROR, {
        layerName: `${kommune.wpName}-${categorySlug}`,
        kommuneSlug: kommune.slug,
        categorySlug,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    } finally {
      this.isRequestPending = false;
    }
  }

  /**
   * Clear vector source (hide layer)
   */
  private clearLayer(): void {
    this.vectorSource?.clear();
    console.log("[WFS] Layer cleared");
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
    // Delegate to reactive state update handler
    await this.updateLayerBasedOnState(kommune, categorySlug);
  }

  /**
   * Enhanced hideLayer with state management
   */
  hideLayer(): void {
    if (this.activeLayer) {
      this.activeLayer.setVisible(false);
    }
    this.vectorSource?.clear();
    this.currentState = { kommune: null, categorySlug: null };
    this.lastLoadedSignature = "";
    console.log("[WFS] Layer hidden and cleared");
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
      wpName: kommune.wpName,
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
      wpName: config.wpName,
      containerType: config.containerType,
      osmAdminLevel: config.osmAdminLevel,
    });

    // Create properly encoded CQL filter - use backend schema field names (wp_name, container_type, osm_admin_level)
    const cqlFilter = `wp_name='${config.wpName}' AND container_type='${config.containerType}' AND osm_admin_level=${config.osmAdminLevel}`;

    const wfsUrl = wfsAuthClient.buildWFSURL("p2d2_containers", {
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
