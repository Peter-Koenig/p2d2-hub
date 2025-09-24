// WFS Layer Manager - Complete corrected version
import { Map as OLMap } from "ol";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { wfsAuthClient } from "./wfs-auth";

// Type definitions
interface WFSLayerConfig {
  wpName: string;
  containerType: string;
  osmAdminLevel: number;
}

interface KommuneData {
  slug: string;
  wp_name: string; // KORRIGIERT: wp_name statt wpname
  osmAdminLevels: number[];
}

export class WFSLayerManager {
  private map: OLMap; // KORRIGIERT: Typ-Alias
  private activeLayer: VectorLayer<VectorSource> | null = null;
  private currentState: {
    kommune: KommuneData | null;
    categorySlug: string | null;
  } = { kommune: null, categorySlug: null };
  private layerCache: Map<string, VectorLayer<VectorSource>> = new Map(); // KORRIGIERT: JavaScript Map

  constructor(map: OLMap) {
    this.map = map;
  }

  // NEW: switchLayer method für direkten Kommune-Wechsel
  async switchLayer(kommune: KommuneData, categorySlug: string): Promise<void> {
    try {
      console.log(
        "[WFS] Switching layer to:",
        kommune.wp_name,
        "-",
        categorySlug,
      );

      // ALWAYS hide current layer first
      if (this.activeLayer) {
        this.activeLayer.setVisible(false);
        console.log("[WFS] Hidden previous layer");
      }

      // Clear UI state
      this.clearButtonStates();

      // Show new layer
      await this.displayLayer(kommune, categorySlug);
      this.updateButtonStates(kommune, categorySlug);
    } catch (error) {
      console.error("[WFS] Switch failed:", error);
    }
  }

  // EXISTING toggleLayer method für Kategorie-Klicks
  async toggleLayer(kommune: KommuneData, categorySlug: string): Promise<void> {
    try {
      const isSameSelection = this.isSameSelection(kommune, categorySlug);

      if (isSameSelection && this.activeLayer) {
        // Toggle OFF: Hide current layer
        this.hideLayer();
        this.clearButtonStates();
      } else {
        // Toggle ON: Show new layer
        await this.displayLayer(kommune, categorySlug);
        this.updateButtonStates(kommune, categorySlug);
      }
    } catch (error) {
      console.error("[WFS] Toggle failed:", error);
    }
  }

  async displayLayer(
    kommune: KommuneData,
    categorySlug: string,
  ): Promise<void> {
    try {
      // Hide existing layer but keep cached
      if (this.activeLayer) {
        this.activeLayer.setVisible(false);
      }

      this.clearButtonStates();

      const config = this.buildLayerConfig(kommune, categorySlug);
      const cacheKey = `${config.wpName}-${config.containerType}-${config.osmAdminLevel}`;

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
      this.activeLayer.setVisible(true);
      this.currentState = { kommune, categorySlug };

      console.log(
        `[WFS] Layer displayed: ${config.wpName} - ${config.containerType}`,
      );
    } catch (error) {
      console.error("[WFS] Failed to display layer:", error);
    }
  }

  hideLayer(): void {
    if (this.activeLayer) {
      this.activeLayer.setVisible(false);
      this.currentState = { kommune: null, categorySlug: null };
      this.clearButtonStates();
      console.log("[WFS] Layer hidden");
    }
  }

  // KORRIGIERT: buildLayerConfig
  private buildLayerConfig(
    kommune: KommuneData,
    categorySlug: string,
  ): WFSLayerConfig {
    const containerType = this.getContainerType(categorySlug);

    return {
      wpName: kommune.wp_name, // KORRIGIERT: wp_name statt wpname
      containerType,
      osmAdminLevel: this.getOsmAdminLevel(kommune, containerType),
    };
  }

  private getContainerType(categorySlug: string): string {
    const categoryMapping: Record<string, string> = {
      cemeteries: "cemetery",
      administrative: "administrative",
    };
    return categoryMapping[categorySlug] || "cemetery";
  }

  private getOsmAdminLevel(
    kommune: KommuneData,
    containerType: string,
  ): number {
    if (containerType === "cemetery") {
      return 8;
    }
    if (containerType === "administrative") {
      const levels = kommune.osmAdminLevels || [];
      return levels.length > 1 ? levels[1] : 8;
    }
    return 8;
  }

  private async createWFSLayer(
    config: WFSLayerConfig,
  ): Promise<VectorLayer<VectorSource>> {
    console.log("[WFS] WFS request with:", {
      wp_name: config.wpName,
      containertype: config.containerType,
      osmadminlevel: config.osmAdminLevel,
    });

    const cqlFilter = `wp_name='${config.wpName}' AND container_type='${config.containerType}' AND osm_admin_level=${config.osmAdminLevel}`;
    const wfsUrl = wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const layer = new VectorLayer({
      source: new VectorSource({
        url: wfsUrl,
        format: new GeoJSON(),
      }),
      style: new Style({
        stroke: new Stroke({ color: "#FF6900", width: 2 }),
        fill: new Fill({ color: "rgba(255, 105, 0, 0.1)" }),
      }),
      visible: true,
    });

    return layer;
  }

  // Helper methods
  private isSameSelection(kommune: KommuneData, categorySlug: string): boolean {
    return (
      this.currentState.kommune?.slug === kommune.slug &&
      this.currentState.categorySlug === categorySlug
    );
  }

  private clearButtonStates(): void {
    document
      .querySelectorAll(".wfs-active")
      .forEach((btn) => btn.classList.remove("wfs-active"));
  }

  private updateButtonStates(kommune: KommuneData, categorySlug: string): void {
    this.clearButtonStates();
    const button = document.querySelector(
      `[data-kommune-slug="${kommune.slug}"]`,
    );
    if (button) {
      button.classList.add("wfs-active");
    }
  }

  getActiveLayer(): VectorLayer<VectorSource> | null {
    return this.activeLayer;
  }

  hasActiveLayer(): boolean {
    return this.activeLayer !== null && this.activeLayer.getVisible();
  }
}

export const createWFSLayerManager = (map: OLMap) => new WFSLayerManager(map);

export default WFSLayerManager;
