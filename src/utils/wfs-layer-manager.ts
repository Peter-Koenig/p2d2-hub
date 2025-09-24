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

  constructor(map: Map) {
    this.map = map;
  }

  /**
   * Display WFS layer for kommune/kategorie combination
   */
  async displayLayer(
    kommune: KommuneData,
    categorySlug: string,
  ): Promise<void> {
    try {
      // Clear existing layer
      if (this.activeLayer) {
        this.map.removeLayer(this.activeLayer);
        this.activeLayer = null;
      }

      // Create layer config
      const config = this.buildLayerConfig(kommune, categorySlug);

      // Create and add layer
      const layer = await this.createWFSLayer(config);
      this.map.addLayer(layer);
      this.activeLayer = layer;

      console.log(
        `[WFS] Layer displayed: ${config.wpName} - ${config.containerType}`,
      );
    } catch (error) {
      console.error("[WFS] Failed to display layer:", error);
    }
  }

  /**
   * Hide current active layer
   */
  hideLayer(): void {
    if (this.activeLayer) {
      this.map.removeLayer(this.activeLayer);
      this.activeLayer = null;
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
}

export default WFSLayerManager;
