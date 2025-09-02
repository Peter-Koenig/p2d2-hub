/**
 * Kommunen Click Handler
 * Centralized handling of kommunen card click events
 */

export interface KommunenDetail {
  center?: [number, number];
  extent?: [number, number, number, number];
  zoom?: number;
  projection?: string;
  extra?: any;
  slug?: string;
}

export class KommunenClickHandler {
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

  private extractDetailFromButton(button: HTMLElement): KommunenDetail | null {
    try {
      const detailStr = button.dataset?.detail;
      if (!detailStr) return null;

      const detail: KommunenDetail = JSON.parse(detailStr);
      const slug = button.getAttribute("data-slug") || "";

      // Validate data
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
    const button = target.closest("button.kommunen-card") as HTMLElement;

    if (!button) return;

    // Prevent double processing
    if (this.processingButtons.has(button)) {
      console.log("[kommunen-handler] Click already being processed, ignoring");
      return;
    }

    this.processingButtons.add(button);

    try {
      const detail = this.extractDetailFromButton(button);
      if (!detail) {
        return;
      }

      console.log(
        "[kommunen-handler] Processing click for:",
        detail.slug,
        detail,
      );

      // Dispatch event
      this.dispatchKommunenFocus(detail);

      // Persist selection
      this.persistSelection(detail);
    } catch (error) {
      console.error("[kommunen-handler] Click handler error:", error);
    } finally {
      // Release processing lock after delay
      setTimeout(() => {
        this.processingButtons.delete(button);
      }, 500);
    }
  }

  private dispatchKommunenFocus(detail: KommunenDetail): void {
    try {
      if (typeof (window as any).dispatchKommunenFocus === "function") {
        (window as any).dispatchKommunenFocus(detail);
      } else if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("kommunen:focus", { detail }));
      } else {
        console.error("[kommunen-handler] No event dispatch method available");
      }
    } catch (error) {
      console.warn("[kommunen-handler] Dispatch failed, retrying...", error);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("kommunen:focus", { detail }));
      }, 100);
    }
  }

  private persistSelection(detail: KommunenDetail): void {
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
        const detail: KommunenDetail = JSON.parse(lastDetailStr);
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

  public bind(): void {
    if (typeof window === "undefined") return;

    document.addEventListener("click", this.boundClickHandler, {
      passive: true,
      capture: false,
    });
  }

  public unbind(): void {
    if (typeof window === "undefined") return;

    document.removeEventListener("click", this.boundClickHandler);
    this.processingButtons.clear();
  }
}
