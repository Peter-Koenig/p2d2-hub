/**
 * Map State Management
 * Centralized state management for map-related data
 */

export interface MapState {
  activeCRS: string;
  localCRS: string | undefined;
  selectedCategory: string | null;
  isInitialized: boolean;
}

export interface MapConfig {
  defaultCRS: string;
  wmsUrl: string;
  wmsLayer: string;
}

class MapStateManager {
  private state: MapState;
  private config: MapConfig;
  private listeners: Set<(state: MapState) => void> = new Set();

  constructor(config: MapConfig) {
    this.config = config;
    this.state = {
      activeCRS: config.defaultCRS,
      localCRS: undefined,
      selectedCategory: null,
      isInitialized: false,
    };
  }

  getState(): Readonly<MapState> {
    return { ...this.state };
  }

  getConfig(): Readonly<MapConfig> {
    return { ...this.config };
  }

  updateState(updates: Partial<MapState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Notify listeners of state changes
    this.listeners.forEach((listener) => {
      try {
        listener(this.getState());
      } catch (error) {
        console.warn("[map-state] Listener error:", error);
      }
    });
  }

  subscribe(listener: (state: MapState) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  setActiveCRS(crs: string): void {
    this.updateState({ activeCRS: crs });

    // Persist to localStorage
    try {
      localStorage.setItem("selectedCRS", crs);
    } catch (error) {
      console.warn("[map-state] Could not persist CRS:", error);
    }
  }

  setLocalCRS(crs: string | undefined): void {
    this.updateState({ localCRS: crs });
  }

  setSelectedCategory(category: string | null): void {
    this.updateState({ selectedCategory: category });
  }

  setInitialized(initialized: boolean): void {
    this.updateState({ isInitialized: initialized });
  }

  // Restore state from localStorage
  restoreFromStorage(): void {
    try {
      const savedCRS = localStorage.getItem("selectedCRS");
      const savedCategory = localStorage.getItem("selectedCategory");

      if (savedCRS) {
        this.updateState({ activeCRS: savedCRS });
      }

      if (savedCategory) {
        this.updateState({ selectedCategory: savedCategory });
      }
    } catch (error) {
      console.warn("[map-state] Could not restore from storage:", error);
    }
  }
}

// Export singleton instance
export const mapState = new MapStateManager({
  defaultCRS: "EPSG:3857",
  wmsUrl: "https://ows.data-dna.eu/",
  wmsLayer: "p2d2_cemeteries_cologne",
});
