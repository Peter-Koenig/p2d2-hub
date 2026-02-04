// Kommunen Click Handler - Centralized handling of kommunen card click events

import {
  P2D2EventType,
  dispatchP2D2Event,
  type KommunenFocusDetail,
} from "./events";

interface KommuneData {
  slug: string;
  wpName: string; // KORRIGIERT: wpName statt wp_name
  osmAdminLevels: number[];
}

export default class KommunenClickHandler {
  private processingButtons: Set<HTMLElement> = new Set();
  private boundClickHandler: (event: Event) => void;

  constructor() {
    this.boundClickHandler = this.handleClick.bind(this);
  }

  private isValidCoordinate(coord: any): coord is [number, number] {
    return (
      Array.isArray(coord) &&
      coord.length === 2 &&
      coord.every(Number.isFinite) &&
      coord[0] >= -180 &&
      coord[0] <= 180 &&
      coord[1] >= -90 &&
      coord[1] <= 90
    );
  }

  private isValidExtent(
    extent: any,
  ): extent is [number, number, number, number] {
    return (
      Array.isArray(extent) &&
      extent.length === 4 &&
      extent.every(Number.isFinite) &&
      extent[0] >= -180 &&
      extent[2] <= 180 &&
      extent[1] >= -90 &&
      extent[3] <= 90
    );
  }

  private extractDetailFromButton(
    button: HTMLElement,
  ): KommunenFocusDetail | null {
    try {
      const detailStr = button.dataset?.detail;
      if (!detailStr) return null;

      const detail: KommunenFocusDetail = JSON.parse(detailStr);
      const slug = button.getAttribute("data-slug") || "";

      if (
        !this.isValidCoordinate(detail.center) &&
        !this.isValidExtent(detail.extent)
      ) {
        console.warn("[kommunen-handler] Invalid center and extent data", {
          slug,
          detail,
        });
        return null;
      }

      detail.slug = slug;
      return detail;
    } catch (error) {
      console.error("[kommunen-handler] Failed to parse button detail", error);
      return null;
    }
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;

    // KRITISCH: Native Links nicht blockieren!
    if (target.closest("a[href]")) return; // Native navigation erlauben

    const button = target.closest("button.kommunen-card") as HTMLElement;
    if (!button) return;

    if (this.processingButtons.has(button)) {
      console.log("[kommunen-handler] Click already being processed, ignoring");
      return;
    }

    this.processingButtons.add(button);

    try {
      const slug = button.getAttribute("data-slug");
      if (!slug) {
        console.warn("[kommunen-handler] No slug found for button");
        return;
      }

      console.log("[kommunen-handler] Loading kommune data for:", slug);

      // Get full kommune data from content collection
      const kommuneData = this.getKommuneData(slug);
      if (!kommuneData) {
        console.error(
          "[kommunen-handler] Kommune data not found for slug:",
          slug,
        );
        return;
      }

      console.log("[kommunen-handler] Found kommune:", {
        wpName: kommuneData.wpName, // KORRIGIERT: wpName statt wp_name!
        adminLevels: kommuneData.osmAdminLevels,
      });

      // Extract map detail from button
      const mapDetail = this.extractDetailFromButton(button);
      if (!mapDetail) return;

      // Combine map detail with kommune data
      const detail: KommunenFocusDetail = { ...mapDetail, ...kommuneData };

      // Toggle-Logik: Wenn gleiche Kommune nochmal geklickt → deaktivieren
      const currentKommune = (window as any).mapState?.getSelectedKommune?.();
      const currentCategory = (window as any).mapState?.getSelectedCategory?.();
      console.log("[UI] Kommune click received:", {
        slug,
        currentKommune: currentKommune?.slug,
        currentCategory,
      });

      if (currentKommune?.slug === slug) {
        // Alle Buttons deselektieren
        document.querySelectorAll("[data-kommune-slug]").forEach((btn) => {
          btn.classList.remove("highlighted");
        });

        // Aus mapState entfernen
        (window as any).mapState?.setSelectedKommune?.(null);
        console.log("[UI] Kommune deselected:", {
          slug,
          timestamp: Date.now(),
        });

        // WFS-Layer wird jetzt reaktiv über WFSLayerManager + mapState gemanaged
        return;
      }

      // Alle Buttons deselektieren (für neue Auswahl)
      document.querySelectorAll("[data-kommune-slug]").forEach((btn) => {
        btn.classList.remove("highlighted");
      });

      // Neuen Button highlighten
      button.classList.add("highlighted");

      console.log(
        "[kommunen-handler] Processing click for:",
        detail.slug,
        detail,
      );

      // 1. NAVIGATION
      this.dispatchKommunenFocus(detail);

      // WFS-Layer wird jetzt reaktiv über WFSLayerManager + mapState gemanaged

      // In mapState speichern
      (window as any).mapState?.setSelectedKommune?.(detail);
      console.log("[UI] Kommune selected:", {
        slug,
        wpName: detail.wpName,
        currentCategory: (window as any).mapState?.getSelectedCategory?.(),
        timestamp: Date.now(),
      });

      // Persist selection
      this.persistSelection(detail);
    } catch (error) {
      console.error("[kommunen-handler] Click handler error:", error);
    } finally {
      setTimeout(() => {
        this.processingButtons.delete(button);
      }, 500);
    }
  }

  // WFS-Layer-Management erfolgt jetzt reaktiv über WFSLayerManager + mapState
  // Diese Methode wurde entfernt, da WFS-Loads automatisch über State-Änderungen getriggert werden

  private dispatchKommunenFocus(detail: KommunenFocusDetail): void {
    try {
      // Use type-safe event dispatching
      dispatchP2D2Event(P2D2EventType.KOMMUNEN_FOCUS, detail, {
        throttleMs: 0,
      });
    } catch (error) {
      console.warn("[kommunen-handler] Dispatch failed, retrying...", error);
      // Fallback to direct dispatch if the typed dispatcher fails
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(P2D2EventType.KOMMUNEN_FOCUS, { detail }),
        );
      }, 100);
    }
  }

  private persistSelection(detail: KommunenFocusDetail): void {
    try {
      localStorage.setItem("p2d2_selected_kommune_slug", detail.slug || "");
      localStorage.setItem(
        "p2d2_selected_kommune_detail",
        JSON.stringify(detail),
      );
    } catch (error) {
      console.warn("[kommunen-handler] Could not persist selection:", error);
    }
  }

  public restoreLastSelection(): void {
    try {
      const lastSlug = localStorage.getItem("p2d2_selected_kommune_slug");
      const lastDetailStr = localStorage.getItem(
        "p2d2_selected_kommune_detail",
      );

      if (lastSlug && lastDetailStr) {
        const detail: KommunenFocusDetail = JSON.parse(lastDetailStr);
        console.log("[kommunen-handler] Restoring last selection:", lastSlug);

        setTimeout(() => {
          this.dispatchKommunenFocus(detail);
        }, 300);
      }
    } catch (error) {
      console.warn(
        "[kommunen-handler] Could not restore last selection:",
        error,
      );
    }
  }

  // Get full kommune data from embedded content collection data
  private getKommuneData(slug: string): KommuneData | null {
    try {
      const gridContainer = document.querySelector(".grid.grid-cols-1");
      if (!gridContainer) {
        console.error("[kommunen-handler] Grid container not found");
        return null;
      }

      const kommuneMapStr = gridContainer.getAttribute("data-kommune-map");
      if (!kommuneMapStr) {
        console.error("[kommunen-handler] Kommune data map not found in HTML");
        return null;
      }

      const kommuneMap: Record<string, KommuneData> = JSON.parse(kommuneMapStr);
      const kommuneData = kommuneMap[slug];

      if (!kommuneData) {
        console.error(
          "[kommunen-handler] Kommune data not found for slug:",
          slug,
        );
        return null;
      }

      return kommuneData;
    } catch (error) {
      console.error("[kommunen-handler] Failed to get kommune data:", error);
      return null;
    }
  }

  public bind(): void {
    if (typeof window === "undefined") return;

    const gridContainer = document.querySelector(".grid.grid-cols-1");
    if (gridContainer) {
      gridContainer.addEventListener("click", this.boundClickHandler, {
        passive: true,
        capture: false,
      });
    } else {
      console.warn(
        "[kommunen-handler] Grid container not found for event binding",
      );
    }
  }

  public unbind(): void {
    if (typeof window === "undefined") return;

    const gridContainer = document.querySelector(".grid.grid-cols-1");
    if (gridContainer) {
      gridContainer.removeEventListener("click", this.boundClickHandler);
    }
    this.processingButtons.clear();
  }
}
