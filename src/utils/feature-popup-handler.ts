/**
 * Feature Popup Handler for p2d2 OpenLayers Map
 * Handles cemetery feature clicks, popup display, and WFS data integration
 */

import { Map as OLMap } from "ol";
import { Feature } from "ol";
import { Geometry } from "ol/geom";
import { transformExtent } from "ol/proj";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Overlay from "ol/Overlay";
import { wfsAuthClient } from "./wfs-auth";
import { mapState } from "./map-state";

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
      box-sizing: border-box;
      border: none;
      border-radius: 0.75rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      min-width: 280px;
      max-width: min(90vw, 360px);
      width: auto;
      max-height: 80vh;
      overflow-y: auto;
      overflow-x: hidden;
      text-align: left;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      word-wrap: break-word;
      word-break: break-word;
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
    const activeContainerType = this.getActiveContainerType();

    return properties?.container_type === activeContainerType;
  }

  /**
   * Get container type for currently selected category
   * Returns 'cemetery' as fallback if no category selected
   */
  private getActiveContainerType(): string {
    const categorySlug = mapState.getSelectedCategory();

    if (!categorySlug) {
      console.warn(
        '[FeaturePopup] No category selected, using fallback "cemetery"',
      );
      return "cemetery";
    }

    // Try to get from embedded category data
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
      console.warn(
        "[FeaturePopup] Could not load category data, using fallback",
      );
    }

    // Hardcoded fallback mapping
    const fallbackMapping: Record<string, string> = {
      cemeteries: "cemetery",
      administrative: "administrative",
    };

    return fallbackMapping[categorySlug] || "cemetery";
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
      // Check if sub-features exist before opening editor
      const grabflurFeatures = await this.loadGrabflurData(properties);

      if (grabflurFeatures.length > 0) {
        // Open feature editor in new window
        this.openFeatureEditor(properties, geometry);
      } else {
        // Show simple info popup
        this.showInfoPopup(coordinate, properties);
      }

      // Zoom to feature
      this.zoomToFeature(geometry);
    } catch (error) {
      console.error("[FeaturePopup] Failed to handle cemetery click:", error);
      this.showInfoPopup(coordinate, properties);
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

    // Get container type dynamically from selected category
    const containerType = this.getActiveContainerType();

    // Use correct CQL filter syntax with DYNAMIC container_type
    const cqlFilter = `osm_admin_level=10 AND wp_name='${cemeteryProps.wp_name}' AND container_type='${containerType}' AND (name LIKE '${namePattern}')`;

    console.log(
      `[FeaturePopup] Loading grabflur data with container_type="${containerType}"`,
    );
    console.log("[FeaturePopup] CQL Filter:", cqlFilter);

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
    const modalHTML = `${this.generatePopupHTML(content)}`;

    // Set modal content
    this.modalElement.innerHTML = modalHTML;

    // Show modal dialog
    this.modalElement.showModal();

    // Remove old backdrop listener if exists
    if (this.backdropClickHandler) {
      this.modalElement.removeEventListener("click", this.backdropClickHandler);
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

      // DEBUGGING: Log map size and extent
      console.log("=== ZOOM DEBUG (Haupt-Map) ===");
      const mapSize = this.map.getSize();
      if (!mapSize) {
        console.warn("[FeaturePopup] Map size is undefined, cannot zoom");
        return;
      }
      console.log("Map container size:", mapSize);
      console.log("Extent to fit:", extent);

      // Calculate extent dimensions
      const extentWidth = extent[2] - extent[0];
      const extentHeight = extent[3] - extent[1];
      console.log("Extent size:", extentWidth, "x", extentHeight, "m");

      // Calculate target resolution for optimal fit
      const padding = 30;
      const resolutionX = extentWidth / (mapSize[0] - 2 * padding);
      const resolutionY = extentHeight / (mapSize[1] - 2 * padding);
      const targetResolution = Math.max(resolutionX, resolutionY);

      console.log("Target resolution:", targetResolution, "m/px");

      // Get maxResolution from View
      const maxResolution = view.getMaxResolution();
      console.log("View maxResolution:", maxResolution, "m/px");

      // Calculate zoom level
      const calculatedZoom = Math.log2(maxResolution / targetResolution);
      const targetZoom = Math.min(18, Math.max(10, calculatedZoom));

      console.log("Calculated zoom:", calculatedZoom);
      console.log("Target zoom (clamped):", targetZoom);

      // Force map size update
      this.map.updateSize();

      // Zoom with calculated level
      const centerX = (extent[0] + extent[2]) / 2;
      const centerY = (extent[1] + extent[3]) / 2;

      view.animate({
        center: [centerX, centerY],
        zoom: targetZoom,
        duration: 300,
      });

      setTimeout(() => {
        console.log("Final zoom level:", view.getZoom());
      }, 350);

      console.log("[FeaturePopup] Zoomed to feature");
    } catch (error) {
      console.error("[FeaturePopup] Failed to zoom to feature:", error);
    }
  }

  /**
   * Show info popup for features without sub-features
   */
  private showInfoPopup(
    coordinate: number[],
    props: CemeteryFeatureProperties,
  ): void {
    const content: PopupContent = {
      cemetery: props,
      grabflurFeatures: [],
      error: "Keine Details verfügbar.",
    };
    this.showPopup(coordinate, content);
  }

  /**
   * Open feature editor in new browser window
   */
  private openFeatureEditor(
    props: CemeteryFeatureProperties,
    geometry: Geometry,
  ): void {
    const extent = geometry.getExtent();
    const editorUrl = this.buildEditorUrl(props, extent);

    console.log("[FeaturePopup] Opening feature editor:", editorUrl);

    // Open new browser window
    const editorWindow = window.open(
      editorUrl,
      `feature-editor-${encodeURIComponent(props.name)}`,
      "width=1200,height=800,resizable=yes,scrollbars=yes,location=yes",
    );

    if (!editorWindow) {
      alert(
        "Popup-Blocker verhindert das Öffnen des Feature-Editors. Bitte erlauben Sie Popups für diese Seite.",
      );
    }
  }

  /**
   * Build URL for feature editor page with WGS84 extent and local projection
   */
  private buildEditorUrl(
    props: CemeteryFeatureProperties,
    extent: number[],
  ): string {
    // Get current map projection (could be UTM or Web Mercator)
    const currentProjection = this.map.getView().getProjection().getCode();

    // Transform extent to WGS84 for URL transport
    const wgs84Extent = transformExtent(extent, currentProjection, "EPSG:4326");

    // Get local CRS from map state (e.g. EPSG:25832 for Köln)
    const localCRS = mapState.getState().localCRS || "EPSG:3857";

    const params = new URLSearchParams({
      wp_name: props.wp_name,
      container_type: this.getActiveContainerType(),
      name: props.name,
      extent: wgs84Extent.join(","), // Send as WGS84
      osm_admin_level: String(props.osm_admin_level),
      projection: localCRS, // Send local projection (UTM)
    });

    return `/feature-editor/${encodeURIComponent(props.name)}?${params}`;
  }

  /**
   * Close the popup
   */
  public closePopup(): void {
    if (!this.modalElement) return;

    // Closing-Animation triggern
    this.modalElement.setAttribute("closing", "");

    // Warte auf Animation Ende
    setTimeout(() => {
      if (this.modalElement) {
        this.modalElement.close();
        this.modalElement.removeAttribute("closing");
      }
    }, 150); // 150ms = fadeOut-Dauer

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
