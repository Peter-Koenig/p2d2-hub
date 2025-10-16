import type { View } from 'ol';

interface ViewState {
  center: number[];
  zoom: number;
  timestamp: number;
}

/**
 * Manages view history for back/forward navigation in Feature Editor
 * Use Case: Overview → Zoom to Grabflur → Back → Zoom to Grab → Back to Grabflur
 */
export class ViewHistoryManager {
  private history: ViewState[] = [];
  private currentIndex: number = -1;
  private view: View;
  private maxHistorySize: number = 20;

  constructor(view: View, maxHistorySize: number = 20) {
    this.view = view;
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Save current view state to history
   * Called after significant zoom/pan actions
   */
  pushState(): void {
    const center = this.view.getCenter();
    const zoom = this.view.getZoom();

    if (!center || zoom === undefined) {
      return;
    }

    // Remove any future states if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new state
    this.history.push({
      center: [...center],
      zoom,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    console.log('ViewHistory: Pushed state', {
      index: this.currentIndex,
      total: this.history.length,
      zoom
    });
  }

  /**
   * Navigate back in history
   */
  back(): boolean {
    if (!this.canGoBack()) {
      return false;
    }

    this.currentIndex--;
    const state = this.history[this.currentIndex];

    this.view.animate({
      center: state.center,
      zoom: state.zoom,
      duration: 300
    });

    console.log('ViewHistory: Navigated back to index', this.currentIndex);
    return true;
  }

  /**
   * Navigate forward in history
   */
  forward(): boolean {
    if (!this.canGoForward()) {
      return false;
    }

    this.currentIndex++;
    const state = this.history[this.currentIndex];

    this.view.animate({
      center: state.center,
      zoom: state.zoom,
      duration: 300
    });

    console.log('ViewHistory: Navigated forward to index', this.currentIndex);
    return true;
  }

  /**
   * Check if back navigation is possible
   */
  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if forward navigation is possible
   */
  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get current history state
   */
  getState() {
    return {
      currentIndex: this.currentIndex,
      historyLength: this.history.length,
      canGoBack: this.canGoBack(),
      canGoForward: this.canGoForward()
    };
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}
