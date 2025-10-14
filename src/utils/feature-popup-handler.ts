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
  private modalElement: HTMLDialogElement | null = null;
  private isInitialized: boolean = false;
  private backdropClickHandler: ((event: MouseEvent) => void) | null = null;

  constructor(map: OLMap) {
    this.map = map;
    this.initializeModal();
  }

  /**
   * Initialize the modal dialog system
   */
  private initializeModal(): void {
    // Create modal dialog element
    this.modalElement = document.createElement("dialog");
    this.modalElement.className = "feature-popup-modal";
    this.modalElement.style.cssText = `
      padding: 0;
      border: none;
      border-radius: 1rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      min-width: 320px;
      max-width: 90vw;
      width: 400px;
      text-align: left;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
    `;

    // Add modal to document body
    document.body.appendChild(this.modalElement);
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
    // Das % für SQL LIKE wird im URL-Encoding automatisch korrekt behandelt
    const namePattern = `${cemeteryProps.name}-%`;

    // Use correct CQL filter syntax with parentheses and LIKE operator
    const cqlFilter = `osm_admin_level=10 AND wp_name='${cemeteryProps.wp_name}' AND container_type='cemetery' AND (name LIKE '${namePattern}')`;

    console.log("[FeaturePopup] Loading grabflur data with filter:", cqlFilter);

    try {
      // Use the corrected buildAuthorizedWFSURL method that now handles encoding correctly
      const url = wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
        CQL_FILTER: cqlFilter,
      });

      console.log("[FeaturePopup] Using corrected WFS URL:", url);

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
   * Show popup with cemetery and grabflur data as modal dialog
   */
  private showPopup(coordinate: number[], content: PopupContent): void {
    if (!this.modalElement) {
      console.error("[FeaturePopup] Modal element not initialized");
      return;
    }

    // Generate popup HTML with modal structure
    const modalHTML = `
      <form method="dialog" style="margin:0;padding:.5rem 1rem 0 0;text-align:right;">
        <button class="text-2xl" aria-label="Schließen" style="background:none;border:none;cursor:pointer;">×</button>
      </form>
      <div style="padding: 1rem 1.5rem 1.5rem 1.5rem;">
        ${this.generatePopupHTML(content)}
      </div>
    `;

    // Set modal content
    this.modalElement.innerHTML = modalHTML;

    // Show modal dialog
    this.modalElement.showModal();

    // Remove old backdrop listener if exists
    if (this.backdropClickHandler) {
      this.modalElement.removeEventListener("click", this.backdropClickHandler);
    }

    // Add event listener for close button
    const closeButton = this.modalElement.querySelector("button");
    if (closeButton) {
      closeButton.addEventListener("click", () => this.closePopup(), {
        once: true,
      });
    }

    // Close modal when clicking on backdrop
    this.backdropClickHandler = (event: MouseEvent) => {
      const rect = this.modalElement!.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        this.closePopup();
      }
    };

    this.modalElement.addEventListener("click", this.backdropClickHandler);

    console.log("[FeaturePopup] Modal popup shown");
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
    if (!this.modalElement) return;

    this.modalElement.close();
    console.log("[FeaturePopup] Modal popup closed");
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.closePopup();

    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }

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
