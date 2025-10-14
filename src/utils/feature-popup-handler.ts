/**
 * Feature Popup Handler for p2d2 OpenLayers Map
 * Handles cemetery feature clicks, popup display, and WFS data integration
 */

import { Map as OLMap } from "ol";
import { Feature } from "ol";
import { Geometry } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Overlay from "ol/Overlay";
import { wfsAuthClient } from "./wfs-auth";

// Type definitions for feature properties
interface CemeteryFeatureProperties {
  name: string;
  container_type: string;
  wp_name: string;
  osm_admin_level: number;
  [key: string]: any;
}

interface GrabflurFeatureProperties {
  name: string;
  container_type: string;
  wp_name: string;
  osm_admin_level: number;
  [key: string]: any;
}

interface PopupContent {
  cemetery: CemeteryFeatureProperties;
  grabflurFeatures: GrabflurFeatureProperties[];
  error?: string;
}

export class FeaturePopupHandler {
  private map: OLMap;
  private popupOverlay: Overlay | null = null;
  private isInitialized: boolean = false;

  constructor(map: OLMap) {
    this.map = map;
    this.initializePopupOverlay();
  }

  /**
   * Initialize the popup overlay system
   */
  private initializePopupOverlay(): void {
    // Create popup container
    const popupElement = document.createElement("div");
    popupElement.className = "feature-popup";
    popupElement.style.display = "none";

    // Create overlay
    this.popupOverlay = new Overlay({
      element: popupElement,
      autoPan: true,
    });

    this.map.addOverlay(this.popupOverlay);
    this.isInitialized = true;
  }

  /**
   * Initialize click event handler for cemetery features
   */
  public initializeClickHandler(): void {
    if (!this.isInitialized) {
      console.warn("[FeaturePopup] Handler not initialized");
      return;
    }

    this.map.on("click", async (event) => {
      try {
        const feature = this.findCemeteryFeatureAtPixel(event.pixel);

        if (feature) {
          await this.handleCemeteryClick(feature, event.coordinate);
        } else {
          this.closePopup();
        }
      } catch (error) {
        console.error("[FeaturePopup] Click handler error:", error);
        this.closePopup();
      }
    });

    console.log("[FeaturePopup] Click handler initialized");
  }

  /**
   * Find cemetery feature at pixel position
   */
  private findCemeteryFeatureAtPixel(
    pixel: number[],
  ): Feature<Geometry> | null {
    let foundFeature: Feature<Geometry> | null = null;

    this.map.forEachFeatureAtPixel(pixel, (feature) => {
      if (this.isCemeteryFeature(feature)) {
        foundFeature = feature as Feature<Geometry>;
        return feature; // Stop iteration
      }
      return undefined; // Continue iteration
    });

    return foundFeature;
  }

  /**
   * Check if feature is a cemetery
   */
  private isCemeteryFeature(feature: any): boolean {
    if (!feature || typeof feature.getProperties !== "function") {
      return false;
    }

    const properties = feature.getProperties();
    return properties?.container_type === "cemetery";
  }

  /**
   * Handle cemetery feature click
   */
  private async handleCemeteryClick(
    feature: Feature<Geometry>,
    coordinate: number[],
  ): Promise<void> {
    const properties = feature.getProperties() as CemeteryFeatureProperties;
    const geometry = feature.getGeometry();

    if (!geometry) {
      console.warn("[FeaturePopup] Cemetery feature has no geometry");
      return;
    }

    try {
      // Load grabflur data
      const grabflurFeatures = await this.loadGrabflurData(properties);

      // Show popup with data
      this.showPopup(coordinate, {
        cemetery: properties,
        grabflurFeatures,
      });

      // Zoom to feature
      this.zoomToFeature(geometry);
    } catch (error) {
      console.error("[FeaturePopup] Failed to handle cemetery click:", error);
      this.showPopup(coordinate, {
        cemetery: properties,
        grabflurFeatures: [],
        error: "Fehler beim Laden der Grabflur-Daten",
      });
    }
  }

  /**
   * Load grabflur data for cemetery
   */
  private async loadGrabflurData(
    cemeteryProps: CemeteryFeatureProperties,
  ): Promise<GrabflurFeatureProperties[]> {
    // Build CQL filter for grabflur features
    // Note: Double URL encoding for name pattern due to WFS proxy setup
    const namePattern = `${cemeteryProps.name}-%`;
    const encodedNamePattern = encodeURIComponent(
      encodeURIComponent(namePattern),
    );

    const cqlFilter = `osm_admin_level=10 AND wp_name='${cemeteryProps.wp_name}' AND container_type='cemetery' AND name like '${encodedNamePattern}'`;

    console.log("[FeaturePopup] Loading grabflur data with filter:", cqlFilter);

    try {
      const url = wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
        CQL_FILTER: cqlFilter,
      });

      const response = await wfsAuthClient.fetchWithAuth(url);

      if (!response.ok) {
        throw new Error(`WFS request failed: ${response.status}`);
      }

      const geoJson = await response.json();

      if (!geoJson.features || !Array.isArray(geoJson.features)) {
        console.warn("[FeaturePopup] No features in response");
        return [];
      }

      // Extract properties from features
      const grabflurFeatures: GrabflurFeatureProperties[] =
        geoJson.features.map((feature: any) => {
          return {
            name: feature.properties?.name || "Unbenannt",
            container_type: feature.properties?.container_type || "cemetery",
            wp_name: feature.properties?.wp_name || cemeteryProps.wp_name,
            osm_admin_level: feature.properties?.osm_admin_level || 10,
            ...feature.properties,
          };
        });

      console.log(
        `[FeaturePopup] Loaded ${grabflurFeatures.length} grabflur features`,
      );
      return grabflurFeatures;
    } catch (error) {
      console.error("[FeaturePopup] Failed to load grabflur data:", error);
      throw error;
    }
  }

  /**
   * Show popup with cemetery and grabflur data
   */
  private showPopup(coordinate: number[], content: PopupContent): void {
    if (!this.popupOverlay) {
      console.error("[FeaturePopup] Popup overlay not initialized");
      return;
    }

    const popupElement = this.popupOverlay.getElement();
    if (!popupElement) {
      console.error("[FeaturePopup] Popup element not found");
      return;
    }

    // Generate popup HTML
    popupElement.innerHTML = this.generatePopupHTML(content);
    popupElement.style.display = "block";

    // Position popup
    this.popupOverlay.setPosition(coordinate);

    // Add event listener for close button
    const closeButton = popupElement.querySelector(".popup-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => this.closePopup());
    }

    console.log("[FeaturePopup] Popup shown");
  }

  /**
   * Generate HTML content for popup
   */
  private generatePopupHTML(content: PopupContent): string {
    const { cemetery, grabflurFeatures, error } = content;

    const grabflurList =
      grabflurFeatures.length > 0
        ? grabflurFeatures.map((feature) => `<li>${feature.name}</li>`).join("")
        : '<li class="no-data">Keine Grabflur-Daten verfügbar</li>';

    return `
      <div class="popup-container">
        <div class="popup-header">
          <h3 class="popup-title">${cemetery.name}</h3>
          <button class="popup-close" aria-label="Popup schließen">×</button>
        </div>
        <div class="popup-body">
          <div class="popup-info">
            <p><strong>Typ:</strong> ${cemetery.container_type}</p>
            <p><strong>Wikipedia:</strong> ${cemetery.wp_name}</p>
            <p><strong>Admin Level:</strong> ${cemetery.osm_admin_level}</p>
          </div>
          ${
            error
              ? `
            <div class="popup-error">
              <p>${error}</p>
            </div>
          `
              : `
            <div class="popup-grabflur">
              <h4>Grabflure (${grabflurFeatures.length}):</h4>
              <ul class="grabflur-list">${grabflurList}</ul>
            </div>
          `
          }
        </div>
      </div>
    `;
  }

  /**
   * Zoom to feature geometry
   */
  private zoomToFeature(geometry: Geometry): void {
    try {
      const extent = geometry.getExtent();
      const view = this.map.getView();

      view.fit(extent, {
        duration: 300,
        maxZoom: 16,
        padding: [50, 50, 50, 50],
      });

      console.log("[FeaturePopup] Zoomed to feature");
    } catch (error) {
      console.error("[FeaturePopup] Failed to zoom to feature:", error);
    }
  }

  /**
   * Close the popup
   */
  public closePopup(): void {
    if (!this.popupOverlay) return;

    const popupElement = this.popupOverlay.getElement();
    if (popupElement) {
      popupElement.style.display = "none";
    }

    this.popupOverlay.setPosition(undefined);
    console.log("[FeaturePopup] Popup closed");
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.closePopup();

    if (this.popupOverlay) {
      this.map.removeOverlay(this.popupOverlay);
      this.popupOverlay = null;
    }

    // Note: Event listeners are automatically cleaned up by OpenLayers
    // when the map is destroyed

    this.isInitialized = false;
    console.log("[FeaturePopup] Handler destroyed");
  }

  /**
   * Check if handler is initialized
   */
  public isHandlerInitialized(): boolean {
    return this.isInitialized;
  }
}

export default FeaturePopupHandler;
