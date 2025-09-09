/**
 * Category Handler
 * Manages category-related functionality and data loading
 */

import type { Map } from "ol";
import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Stroke, Fill } from "ol/style";
import { mapState } from "./map-state";
import { transformExtent } from "ol/proj";
import { wfsAuthClient } from "./wfs-auth";

export class CategoryHandler {
  private map: Map;
  private categorySource: VectorSource;
  private categoryLayer: VectorLayer<VectorSource>;
  private moveendDebounceTimer: number | null = null;
  private readonly MOVEEND_DEBOUNCE_MS = 400;

  constructor(map: Map) {
    this.map = map;
    this.setupCategoryLayer();
    this.setupEventListeners();
  }

  private setupCategoryLayer(): void {
    // Create category vector source
    this.categorySource = new VectorSource({
      format: new GeoJSON(),
      url: () => this.buildCategoryUrl(),
    });

    // Create category vector layer
    this.categoryLayer = new VectorLayer({
      source: this.categorySource,
      style: new Style({
        stroke: new Stroke({
          color: "#FF6900",
          width: 2,
        }),
        fill: new Fill({
          color: "rgba(255, 105, 0, 0.1)",
        }),
      }),
    });

    this.map.addLayer(this.categoryLayer);
  }

  private setupEventListeners(): void {
    // Listen for category selection events
    if (typeof window !== "undefined") {
      window.addEventListener(
        "ui:select-category",
        this.handleCategorySelect.bind(this),
        { passive: true },
      );

      // Setup debounced moveend handling
      this.map.un("moveend", this.handleMoveEndDebounced.bind(this));
      this.map.on("moveend", this.handleMoveEndDebounced.bind(this));
    }

    // Listen to map state changes
    mapState.subscribe((state) => {
      if (state.selectedCategory) {
        this.refreshCategoriesSource();
      }
    });
  }

  private handleCategorySelect(e: Event): void {
    const detail = (e as CustomEvent)?.detail || {};
    const categorySlug = detail?.categorySlug || null;

    mapState.setSelectedCategory(categorySlug);
    this.refreshCategoriesSource();
  }

  private handleMoveEndDebounced(): void {
    if (this.moveendDebounceTimer) {
      clearTimeout(this.moveendDebounceTimer);
    }

    this.moveendDebounceTimer = setTimeout(() => {
      const state = mapState.getState();
      if (state.selectedCategory) {
        this.refreshCategoriesSource();
      }
    }, this.MOVEEND_DEBOUNCE_MS);
  }

  private getCurrentViewBboxInActiveCRS(): string {
    const view = this.map.getView();
    const mapSize = this.map.getSize();

    // Guard: return empty string if map size is invalid
    if (!mapSize || mapSize[0] === 0 || mapSize[1] === 0) {
      return "";
    }

    const viewExtent = view.calculateExtent(mapSize);
    const state = mapState.getState();

    // If view is in different projection, transform extent to active CRS
    const viewProj = view.getProjection();
    if (viewProj && viewProj.getCode() !== state.activeCRS) {
      try {
        const transformedExtent = transformExtent(
          viewExtent,
          viewProj,
          state.activeCRS,
        );
        return transformedExtent.join(",");
      } catch (error) {
        console.warn("[category-handler] Could not transform extent:", error);
      }
    }

    return viewExtent.join(",");
  }

  private buildCategoryUrl(): string {
    const state = mapState.getState();
    if (!state.selectedCategory) return "";

    const bbox = this.getCurrentViewBboxInActiveCRS();

    // Build authorized WFS URL with category filter
    return wfsAuthClient.buildAuthorizedWFSURL("p2d2_containers", {
      // bbox: bbox,
      CQL_FILTER: `category='${state.selectedCategory}'`,
    });
  }

  public refreshCategoriesSource(): void {
    const state = mapState.getState();
    if (!state.selectedCategory) return;

    const url = this.buildCategoryUrl();

    // Only set URL and refresh if URL is not empty
    if (url) {
      try {
        this.categorySource.setUrl(() => url);
        this.categorySource.refresh();
      } catch (error) {
        console.error(
          "[category-handler] Error refreshing category source:",
          error,
        );
      }
    }
  }

  public getCategorySource(): VectorSource {
    return this.categorySource;
  }

  public getCategoryLayer(): VectorLayer<VectorSource> {
    return this.categoryLayer;
  }

  public destroy(): void {
    if (this.moveendDebounceTimer) {
      clearTimeout(this.moveendDebounceTimer);
      this.moveendDebounceTimer = null;
    }

    this.map.removeLayer(this.categoryLayer);

    if (typeof window !== "undefined") {
      window.removeEventListener(
        "ui:select-category",
        this.handleCategorySelect.bind(this),
      );
    }
  }
}
