/**
 * Map Navigation Utilities for Feature Editor
 * Provides functions for zoom, reset, and navigation controls
 * Compatible with existing ViewHistoryManager implementation
 */

import type { Map as OLMap } from "ol";
import { ViewHistoryManager } from "./view-history-manager";
import { MAP_CONFIG } from "../config/map-config";

// Global variable to store ViewHistoryManager instances per map
const viewHistoryManagers = new WeakMap<OLMap, ViewHistoryManager>();

/**
 * Zoom in on the map
 */
export function zoomIn(map: OLMap): void {
  const view = map.getView();
  const currentZoom = view.getZoom();
  if (currentZoom !== undefined) {
    view.setZoom(currentZoom + 1);
  }
}

/**
 * Zoom out on the map
 */
export function zoomOut(map: OLMap): void {
  const view = map.getView();
  const currentZoom = view.getZoom();
  if (currentZoom !== undefined && currentZoom > 0) {
    view.setZoom(currentZoom - 1);
  }
}

/**
 * Reset view to initial configuration
 */
export function resetView(map: OLMap): void {
  const view = map.getView();
  view.setCenter(MAP_CONFIG.INITIAL_CENTER);
  view.setZoom(MAP_CONFIG.INITIAL_ZOOM);
}

/**
 * Navigate back in view history
 */
export function goBack(map: OLMap): void {
  const viewHistory = getViewHistoryManager(map);
  if (viewHistory?.back()) {
    updateNavButtons(map);
  }
}

/**
 * Navigate forward in view history
 */
export function goForward(map: OLMap): void {
  const viewHistory = getViewHistoryManager(map);
  if (viewHistory?.forward()) {
    updateNavButtons(map);
  }
}

/**
 * Get the ViewHistoryManager instance for a map
 */
export function getViewHistoryManager(map: OLMap): ViewHistoryManager | null {
  return viewHistoryManagers.get(map) || null;
}

/**
 * Update navigation button states based on history
 */
function updateNavButtons(map: OLMap): void {
  const backBtn = document.getElementById("nav-back") as HTMLButtonElement;
  const fwdBtn = document.getElementById("nav-forward") as HTMLButtonElement;

  if (!backBtn || !fwdBtn) return;

  const viewHistory = getViewHistoryManager(map);
  if (!viewHistory) return;

  const state = viewHistory.getState();
  backBtn.disabled = !state.canGoBack;
  fwdBtn.disabled = !state.canGoForward;
}

/**
 * Initialize navigation controls for a map
 * This should be called after the map is created
 */
export function initNavigationControls(map: OLMap): void {
  // Create and store ViewHistoryManager for this map
  const viewHistory = new ViewHistoryManager(map.getView());
  viewHistoryManagers.set(map, viewHistory);

  // Save initial view as first history state
  viewHistory.pushState();

  // Update button states initially
  updateNavButtons(map);

  // Listen for view changes to update history and buttons
  let changeTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleViewChange = () => {
    // Debounce view changes to avoid too many history entries
    if (changeTimeout) {
      clearTimeout(changeTimeout);
    }

    changeTimeout = setTimeout(() => {
      viewHistory.pushState();
      updateNavButtons(map);
    }, 100);
  };

  map.getView().on("change:center", handleViewChange);
  map.getView().on("change:resolution", handleViewChange);

  // Cleanup function for when map is destroyed
  (map as any).__navigationCleanup = () => {
    if (changeTimeout) {
      clearTimeout(changeTimeout);
    }
    map.getView().un("change:center", handleViewChange);
    map.getView().un("change:resolution", handleViewChange);
  };
}

/**
 * Clean up navigation controls when map is destroyed
 */
export function cleanupNavigationControls(map: OLMap): void {
  const cleanup = (map as any).__navigationCleanup;
  if (cleanup) {
    cleanup();
  }
  viewHistoryManagers.delete(map);
}
