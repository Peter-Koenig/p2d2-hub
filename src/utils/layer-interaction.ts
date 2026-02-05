/**
 * Layer Interaction Manager
 * Handles long-press opacity adjustment for WMS layers
 *
 * WICHTIG:
 * - KEINE globalen Variablen außerhalb der Klasse
 * - State-Isolierung durch Map<string, State>
 * - Robuste Cleanup-Mechanismen
 */

import type TileLayer from "ol/layer/Tile";

interface LayerInteractionState {
  isPressed: boolean;
  pressStartTime: number;
  animationFrameId: number | null;
  initialOpacity: number;
  currentOpacity: number;
  wasLongPress: boolean;
}

export class LayerInteractionManager {
  private states: Map<string, LayerInteractionState> = new Map();
  private readonly LONG_PRESS_THRESHOLD = 500; // ms
  private readonly OPACITY_CYCLE_DURATION = 12000; // ms
  private readonly MIN_OPACITY = 0.2;
  private readonly MAX_OPACITY = 1.0;

  /**
   * Register long-press handler for layer button
   * @param buttonId - DOM ID of button (e.g., "toggle-luftbild")
   * @param layer - OpenLayers TileLayer
   * @param layerId - Unique layer identifier for localStorage (e.g., "luftbild")
   */
  registerLongPress(
    buttonId: string,
    layer: TileLayer<any>,
    layerId: string,
  ): void {
    const button = document.getElementById(buttonId);
    if (!button) {
      console.warn(`[LayerInteraction] Button ${buttonId} not found`);
      return;
    }

    // Initialize state
    const state: LayerInteractionState = {
      isPressed: false,
      pressStartTime: 0,
      animationFrameId: null,
      initialOpacity: layer.getOpacity(),
      currentOpacity: layer.getOpacity(),
      wasLongPress: false,
    };
    this.states.set(buttonId, state);

    // Restore saved opacity from localStorage
    this.restoreOpacity(layer, layerId, state);

    // === MOUSE EVENTS ===
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault(); // Prevent default (text selection, drag)
      this.startPressTracking(state, layer, buttonId, layerId);
    };

    const handleMouseUp = () => {
      this.stopPressTracking(state, layer, layerId);
    };

    const handleMouseLeave = () => {
      this.stopPressTracking(state, layer, layerId);
    };

    button.addEventListener("mousedown", handleMouseDown);
    button.addEventListener("mouseup", handleMouseUp);
    button.addEventListener("mouseleave", handleMouseLeave);

    // === TOUCH EVENTS ===
    const handleTouchStart = (e: TouchEvent) => {
      // e.preventDefault() removed to allow click events on mobile
      this.startPressTracking(state, layer, buttonId, layerId);
    };

    const handleTouchEnd = () => {
      this.stopPressTracking(state, layer, layerId);
    };

    const handleTouchCancel = () => {
      this.stopPressTracking(state, layer, layerId);
    };

    button.addEventListener("touchstart", handleTouchStart, { passive: true });
    button.addEventListener("touchend", handleTouchEnd);
    button.addEventListener("touchcancel", handleTouchCancel);

    console.log(
      `[LayerInteraction] Registered for ${buttonId} (Layer: ${layerId})`,
    );
  }

  /**
   * Start press tracking and schedule animation
   */
  private startPressTracking(
    state: LayerInteractionState,
    layer: TileLayer<any>,
    buttonId: string,
    layerId: string,
  ): void {
    state.isPressed = true;
    state.pressStartTime = Date.now();
    state.initialOpacity = layer.getOpacity();

    // Schedule animation after LONG_PRESS_THRESHOLD
    setTimeout(() => {
      if (state.isPressed) {
        // Still pressed after threshold → start animation
        state.wasLongPress = true;
        this.startOpacityAnimation(buttonId, layer, state, layerId);
      }
    }, this.LONG_PRESS_THRESHOLD);
  }

  /**
   * Stop press tracking and cleanup
   */
  private stopPressTracking(
    state: LayerInteractionState,
    layer: TileLayer<any>,
    layerId: string,
  ): void {
    const pressDuration = Date.now() - state.pressStartTime;
    state.isPressed = false;

    if (state.animationFrameId !== null) {
      // Animation was running → save final opacity
      this.stopAnimation(state, layer, layerId);
    } else if (pressDuration < this.LONG_PRESS_THRESHOLD) {
      // Short press → do nothing (toggle handled by LayerControls)
      // This is intentional: Short press = toggle, Long press = opacity adjustment
    }
  }

  /**
   * Start sinusoidal opacity animation
   */
  private startOpacityAnimation(
    buttonId: string,
    layer: TileLayer<any>,
    state: LayerInteractionState,
    layerId: string,
  ): void {
    const startTime = Date.now();

    const animate = (timestamp: number) => {
      if (!state.isPressed) {
        // Animation should stop
        return;
      }

      // Calculate elapsed time and progress
      const elapsed = timestamp - startTime;
      const progress =
        (elapsed % this.OPACITY_CYCLE_DURATION) / this.OPACITY_CYCLE_DURATION;

      // Sinusoidal oscillation: 0.2 → 1.0 → 0.2
      // Formula: center + amplitude * sin(2π * progress)
      const center = (this.MIN_OPACITY + this.MAX_OPACITY) / 2; // 0.6
      const amplitude = (this.MAX_OPACITY - this.MIN_OPACITY) / 2; // 0.4
      const opacity = center + amplitude * Math.sin(progress * Math.PI * 2);

      state.currentOpacity = opacity;

      // Update layer opacity (OpenLayers handles rendering automatically)
      layer.setOpacity(opacity);

      // Visual feedback: Button opacity follows layer
      const button = document.getElementById(buttonId);
      if (button) {
        button.style.opacity = String(opacity);
      }

      // Schedule next frame
      state.animationFrameId = requestAnimationFrame(animate);
    };

    // Start animation loop
    state.animationFrameId = requestAnimationFrame(animate);
    console.log(`[LayerInteraction] Animation started for ${layerId}`);
  }

  /**
   * Stop animation and persist final opacity
   */
  private stopAnimation(
    state: LayerInteractionState,
    layer: TileLayer<any>,
    layerId: string,
  ): void {
    // Cancel animation frame
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }

    // Persist final opacity to localStorage
    const finalOpacity = state.currentOpacity;
    this.saveOpacity(layerId, finalOpacity);

    // Reset button opacity
    const buttonId = this.getButtonIdFromLayerId(layerId);
    const button = document.getElementById(buttonId);
    if (button) {
      button.style.opacity = "1";
    }

    // Reset flag after short delay to prevent click event
    setTimeout(() => {
      state.wasLongPress = false;
    }, 100);

    console.log(
      `[LayerInteraction] Saved opacity ${finalOpacity.toFixed(2)} for ${layerId}`,
    );
  }

  /**
   * Restore opacity from localStorage
   */
  private restoreOpacity(
    layer: TileLayer<any>,
    layerId: string,
    state: LayerInteractionState,
  ): void {
    try {
      const saved = localStorage.getItem(`layer-opacity-${layerId}`);
      if (saved) {
        const opacity = parseFloat(saved);
        if (opacity >= this.MIN_OPACITY && opacity <= this.MAX_OPACITY) {
          layer.setOpacity(opacity);
          state.initialOpacity = opacity;
          state.currentOpacity = opacity;
          console.log(
            `[LayerInteraction] Restored opacity ${opacity.toFixed(2)} for ${layerId}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `[LayerInteraction] Failed to restore opacity for ${layerId}`,
        error,
      );
    }
  }

  /**
   * Save opacity to localStorage
   */
  private saveOpacity(layerId: string, opacity: number): void {
    try {
      localStorage.setItem(`layer-opacity-${layerId}`, String(opacity));
    } catch (error) {
      console.warn(
        `[LayerInteraction] Failed to save opacity for ${layerId}`,
        error,
      );
    }
  }

  /**
   * Helper: Get button ID from layer ID
   */
  private getButtonIdFromLayerId(layerId: string): string {
    return `toggle-${layerId}`;
  }

  /**
   * Cleanup all animations (call on component unmount)
   */
  cleanup(): void {
    this.states.forEach((state, buttonId) => {
      if (state.animationFrameId !== null) {
        cancelAnimationFrame(state.animationFrameId);
      }
      const button = document.getElementById(buttonId);
      if (button) {
        button.style.opacity = "1";
      }
    });
    this.states.clear();
    console.log("[LayerInteraction] Cleanup completed");
  }
}
