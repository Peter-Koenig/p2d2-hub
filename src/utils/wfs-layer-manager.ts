/**
 * WFS Layer Manager - Phase 1: Basic Display
 * State-of-the-Art WFS Layer Management für p2d2
 */

import type { Map } from "ol";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { wfsAuthClient } from "./wfs-auth";

// Type definitions
interface WFSLayerConfig {
  wpName: string; // 'de-Köln', 'de-Frankfurt am Main'
  containerType: string; // 'cemetery', 'administrative'
  osmAdminLevel: number; // 8, 9, etc.
}

interface KommuneData {
  slug: string; // 'koeln'
  wpname: string; // 'de-Köln'
  osmAdminLevels: number[]; // [6, 8]
}

export class WFSLayerManager {
  private map: Map;
  private activeLayer: VectorLayer<VectorSource> | null = null;
  // Phase 2: State-Tracking hinzufügen
  private currentState: {
    kommune: KommuneData | null;
    categorySlug: string | null;
  } = { kommune: null, categorySlug: null };

  constructor(map: Map) {
    this.map = map;
  }

  /**
   * Phase 2: Toggle WFS layer for kommune/kategorie combination
   * Smart toggle logic with state management
   */
  async toggleLayer(kommune: KommuneData, categorySlug: string): Promise<void> {
    try {
      const isSameSelection = this.isSameSelection(kommune, categorySlug);

      if (isSameSelection && this.activeLayer) {
        // Toggle OFF: Hide current layer
        this.hideLayer();
        this.clearButtonStates();
      } else {
        // Toggle ON: Show new layer (or switch to different)
        await this.displayLayer(kommune, categorySlug);
        this.updateButtonStates(kommune, categorySlug);
      }
    } catch (error) {
      console.error("[WFS] Toggle failed:", error);
    }
  }

  /**
   * Phase 2: Enhanced displayLayer with state management
   */
  async displayLayer(
    kommune: KommuneData,
    categorySlug: string,
  ): Promise<void> {
    try {
      // Clear existing layer visibility
      if (this.activeLayer) {
        this.activeLayer.setVisible(false); // Phase 2: Use visibility instead of remove
      }

      // Create layer config
      const config = this.buildLayerConfig(kommune, categorySlug);

      // Create new layer if needed, or reuse if same config
      if (!this.activeLayer || !this.isSameSelection(kommune, categorySlug)) {
        if (this.activeLayer) {
          this.map.removeLayer(this.activeLayer);
        }

        const layer = await this.createWFSLayer(config);
        this.map.addLayer(layer);
        this.activeLayer = layer;
      }

      // Show layer
      this.activeLayer.setVisible(true);

      // Update state
      this.currentState = { kommune, categorySlug };

      console.log(
        `[WFS] Layer displayed: ${config.wpName} - ${config.containerType}`,
      );
    } catch (error) {
      console.error("[WFS] Failed to display layer:", error);
    }
  }

  /**
   * Phase 2: Enhanced hideLayer with state management
   */
  hideLayer(): void {
    if (this.activeLayer) {
      this.activeLayer.setVisible(false); // Phase 2: Use visibility
      this.currentState = { kommune: null, categorySlug: null };
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
    // Map category to container type
    const containerType = this.getContainerType(categorySlug);

    // Determine admin level
    const osmAdminLevel = this.getOsmAdminLevel(kommune, containerType);

    return {
      wpName: kommune.wpname,
      containerType,
      osmAdminLevel,
    };
  }

  /**
   * Map category slug to container type
   */
  private getContainerType(categorySlug: string): string {
    const categoryMapping: Record<string, string> = {
      cemeteries: "cemetery",
      administrative: "administrative",
      // Erweiterbar für weitere Kategorien
    };

    return categoryMapping[categorySlug] || "cemetery";
  }

  /**
   * Determine OSM admin level based on kommune and container type
   */
  private getOsmAdminLevel(
    kommune: KommuneData,
    containerType: string,
  ): number {
    if (containerType === "cemetery") {
      return 8; // Immer Level 8 für Friedhöfe
    }

    if (containerType === "administrative") {
      // Zweithöchste Gliederungsebene
      const levels = kommune.osmAdminLevels || [];
      return levels.length > 1 ? levels[1] : 8; // Fallback zu Level 8
    }

    return 8; // Fallback
  }

  /**
   * Create OpenLayers WFS VectorLayer
   */
  private async createWFSLayer(
    config: WFSLayerConfig,
  ): Promise<VectorLayer<VectorSource>> {
    // Build WFS URL with proper encoding
    const wpNameEncoded = encodeURIComponent(config.wpName);
    const wfsUrl = wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: `wp_name='${wpNameEncoded}' AND container_type='${config.containerType}' AND osm_admin_level=${config.osmAdminLevel}`,
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
   * Check if selection is same as current
   */
  private isSameSelection(kommune: KommuneData, categorySlug: string): boolean {
    return (
      this.currentState.kommune?.slug === kommune.slug &&
      this.currentState.categorySlug === categorySlug
    );
  }

  /**
   * Update button states for active kommune/category
   */
  private updateButtonStates(kommune: KommuneData, categorySlug: string): void {
    // Clear all button states first
    this.clearButtonStates();

    // Set active states
    this.setKommuneButtonState(kommune.slug, true);
    this.setCategoryButtonState(categorySlug, true);
  }

  /**
   * Clear all button active states
   */
  private clearButtonStates(): void {
    // Clear all kommune buttons
    const kommuneButtons = document.querySelectorAll("[data-kommune-slug]");
    kommuneButtons.forEach((button) => {
      button.classList.remove("wfs-active");
    });

    // Clear all category buttons
    const categoryButtons = document.querySelectorAll("[data-category-slug]");
    categoryButtons.forEach((button) => {
      button.classList.remove("wfs-active");
    });
  }

  /**
   * Set kommune button state
   */
  private setKommuneButtonState(kommuneSlug: string, active: boolean): void {
    const button = document.querySelector(
      `[data-kommune-slug="${kommuneSlug}"]`,
    );
    if (button) {
      if (active) {
        button.classList.add("wfs-active");
      } else {
        button.classList.remove("wfs-active");
      }
    }
  }

  /**
   * Set category button state
   */
  private setCategoryButtonState(categorySlug: string, active: boolean): void {
    const button = document.querySelector(
      `[data-category-slug="${categorySlug}"]`,
    );
    if (button) {
      if (active) {
        button.classList.add("wfs-active");
      } else {
        button.classList.remove("wfs-active");
      }
    }
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
