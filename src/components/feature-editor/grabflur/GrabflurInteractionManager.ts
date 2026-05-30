// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurInteractionManager: Hover, Friedhof-Select, 1/2-Klick, Edit-Tools
//
// Kapselt die gesamte Karten-Interaktionslogik des Grabflur-Editors:
// - Hover-Popup über Friedhofs-/Grabflur-Features
// - Klick-Selektion auf Friedhöfe (Zoom + Grabflur-Ladung)
// - 1-Klick/2-Klick auf Grabfluren (Zoom + Session-Start)
// - Edit-Tools (Select, Translate, Modify) im Edit-Mode

import type { Map as OLMap, MapBrowserEvent } from "ol";
import { Style, Stroke, Fill } from "ol/style";
import { Select, Translate, Modify, type Interaction } from "ol/interaction";
import type { SelectEvent } from "ol/interaction/Select";
import { click, never } from "ol/events/condition";
import type { FeatureLike } from "ol/Feature";
import type Feature from "ol/Feature";
import type { Geometry } from "ol/geom";
import {
  dispatchCrossWindowEvent,
  getWindowId,
} from "@/utils/cross-window-events";
import { P2D2EventType } from "@/utils/events";
import type GrabflurLayerManager from "./GrabflurLayerManager";
import type GrabflurDataManager from "./GrabflurDataManager";
import type GrabflurSessionManager from "./GrabflurSessionManager";
import type { ViewHistoryManager } from "@/utils/view-history-manager";

// ---------------------------------------------------------------------------
// Hover-Style (wird auf das Feature unter dem Mauszeiger angewendet)
// ---------------------------------------------------------------------------

const HOVER_STYLE = new Style({
  stroke: new Stroke({ color: "#CC5500", width: 3 }),
  fill: new Fill({ color: "rgba(255, 105, 0, 0.35)" }),
});

// ---------------------------------------------------------------------------
// GrabflurInteractionManager
// ---------------------------------------------------------------------------

/**
 * Kapselt Hover, Friedhof-Selektion, 1-Klick/2-Klick und Edit-Tools.
 *
 * Alle map.on('...')-Listener werden im Constructor registriert.
 * Für den Edit-Mode wird ein persistenter grabflureSelect (OL Select)
 * beim ersten Aktivieren des Select-Tools lazy angelegt.
 */
export default class GrabflurInteractionManager {
  private map: OLMap;
  private layerManager: GrabflurLayerManager;
  private dataManager: GrabflurDataManager;
  private sessionManager: GrabflurSessionManager;
  private viewHistory: ViewHistoryManager;
  private projection: string;

  // -- Hover --
  private hoverFeature: FeatureLike | null = null;
  private hoverFeatureType: "friedhof" | "grabflure" | "" = "";
  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  // -- Friedhof-Select (OL Select-Interaction für Cemetery-Klicks) --
  private friedhofSelect: Select;

  // -- Race-Condition-Schutz beim Grabflur-Laden --
  private currentCemeteryId: string | null = null;

  // -- 1-Klick/2-Klick --
  private lastClickedGrabflureUuid: string | null = null;

  // -- Edit-Mode --
  private grabflureSelect: Select | null = null;
  private activeTool: string | null = null;
  private editInteractions: Interaction[] = [];

  // -- Konfiguration --
  private municipality: string;

  constructor(
    map: OLMap,
    layerManager: GrabflurLayerManager,
    dataManager: GrabflurDataManager,
    sessionManager: GrabflurSessionManager,
    viewHistory: ViewHistoryManager,
    projection: string,
    municipality: string,
  ) {
    this.map = map;
    this.viewHistory = viewHistory;
    this.layerManager = layerManager;
    this.dataManager = dataManager;
    this.sessionManager = sessionManager;
    this.projection = projection;
    this.municipality = municipality;

    // 1. Hover-Interaktion (pointermove)
    this.initHoverInteraction();

    // 2. Friedhof-Select-Interaction (Klick auf Cemetery)
    this.friedhofSelect = new Select({
      condition: click,
      style: new Style({
        stroke: new Stroke({ color: "#CC5500", width: 3 }),
        fill: new Fill({ color: "rgba(255, 105, 0, 0.25)" }),
      }),
    });
    this.map.addInteraction(this.friedhofSelect);
    this.friedhofSelect.on("select", (e: SelectEvent) =>
      this.onFriedhofSelect(e),
    );

    // 3. Grabflur-Klick-Handler (1-Klick/2-Klick)
    this.map.on("click", (evt) => this.onGrabflurClick(evt));
  }

  // -----------------------------------------------------------------------
  // Hover
  // -----------------------------------------------------------------------

  private initHoverInteraction(): void {
    this.map.on("pointermove", (evt) => {
      if (evt.dragging) return;

      let featureAtPixel: FeatureLike | null = null;
      let featureLayer: "friedhof" | "grabflure" | "" = "";

      this.map.forEachFeatureAtPixel(evt.pixel, (f: any, layer: any) => {
        if (layer === this.layerManager.getGrabflureLayer()) {
          featureAtPixel = f as Feature<Geometry>;
          featureLayer = "grabflure";
          return true;
        }
        if (layer === this.layerManager.getFriedhofLayer()) {
          featureAtPixel = f as Feature<Geometry>;
          featureLayer = "friedhof";
          return true;
        }
        return false;
      });

      if (featureAtPixel !== this.hoverFeature) {
        // Alten Hover-Zustand bereinigen
        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
        if (this.hoverFeature) {
          (this.hoverFeature as Feature<Geometry>).setStyle(undefined);
        }
        this.hoverFeature = featureAtPixel;
        this.hoverFeatureType = featureLayer;

        if (!featureAtPixel) {
          this.layerManager.hideHoverPopup();
          return;
        }

        // Neues Hover-Feature hervorheben
        (featureAtPixel as Feature<Geometry>).setStyle(HOVER_STYLE);

        this.hoverTimeout = setTimeout(() => {
          const name =
            (featureAtPixel as Feature<Geometry>).get("name") || "Unbenannt";
          const label =
            this.hoverFeatureType === "grabflure" ? "Grabflur" : "Friedhof";
          this.layerManager.showHoverPopup(evt.coordinate, label, name);
        }, 600);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Friedhof-Select (Zoom + Grabflur-Ladung)
  // -----------------------------------------------------------------------

  private async onFriedhofSelect(e: SelectEvent): Promise<void> {
    const selected = e.selected[0] as Feature<Geometry> | undefined;

    // ── Deselektiert → Grabflure ausblenden (außer Klick war auf Grabflur) ──
    if (!selected) {
      if (this.wasClickOnGrabflure(e)) return;

      this.layerManager.clearGrabflure();
      this.layerManager.setGrabflureVisible(false);
      this.currentCemeteryId = null;
      this.exitEditMode();
      return;
    }

    const name = selected.get("name") || "Unbenannt";
    const cemeteryId = selected.getId() || name;
    this.currentCemeteryId = cemeteryId;

    // Auf Friedhof zoomen
    const geom = selected.getGeometry();
    if (!geom) return;

    const extent = geom.getExtent();
    const mapSize = this.map.getSize();
    if (mapSize && extent && extent.every(Number.isFinite)) {
      this.viewHistory.pushState();
      this.map.getView().fit(extent, {
        size: mapSize,
        padding: [100, 100, 100, 100],
        maxZoom: 19,
        duration: 500,
      });
    }

    // Edit-Mode beenden (neuer Cemetery ausgewählt)
    this.exitEditMode();

    // ── Grabflure für diesen Friedhof laden ──
    try {
      const grabflureFeatures = await this.dataManager.loadGrabflureForFriedhof(
        extent,
        this.projection,
      );

      // Race-Condition-Schutz: Nur anwenden, wenn kein anderer Cemetery
      // zwischenzeitlich geklickt wurde
      if (this.currentCemeteryId !== cemeteryId) {
        return;
      }

      this.layerManager.clearGrabflure();
      if (grabflureFeatures.length > 0) {
        this.layerManager.getGrabflureSource().addFeatures(grabflureFeatures);
        this.layerManager.setGrabflureVisible(true);
      } else {
        this.layerManager.setGrabflureVisible(false);
      }
    } catch (err) {
      console.error("[Grabflur-Editor] Grabflur-Fehler:", err);
      this.layerManager.setGrabflureVisible(false);
    }
  }

  /**
   * Prüft, ob der Klick, der die Deselektion ausgelöst hat, auf einer
   * Grabflur lag. Wenn ja → nicht eingreifen (Grabflur-Klick-Handler
   * ist zuständig).
   */
  private wasClickOnGrabflure(e: SelectEvent): boolean {
    if (!this.layerManager.getGrabflureLayer().getVisible()) return false;
    const browserEvent = e.mapBrowserEvent;
    if (!browserEvent) return false;

    let hitGrabflure = false;
    this.map.forEachFeatureAtPixel(browserEvent.pixel, (f, layer) => {
      if (layer === this.layerManager.getGrabflureLayer()) {
        hitGrabflure = true;
        return true;
      }
      return false;
    });
    return hitGrabflure;
  }

  // -----------------------------------------------------------------------
  // Grabflur-Klick: 1× Zoomen, 2× Edit-Mode
  // -----------------------------------------------------------------------

  private async onGrabflurClick(evt: any): Promise<void> {
    if (!this.layerManager.getGrabflureLayer().getVisible()) return;
    if (this.sessionManager.isSessionActive()) return;

    let hitFeature: any = null;
    this.map.forEachFeatureAtPixel(evt.pixel, (f: any, layer: any) => {
      if (layer === this.layerManager.getGrabflureLayer()) {
        hitFeature = f;
        return true;
      }
      return false;
    });
    if (!hitFeature) return;

    const uuid = hitFeature.get("p2d2_uuid");
    if (!uuid) return; // kein UUID → kein Edit-Mode möglich

    if (uuid === this.lastClickedGrabflureUuid) {
      // 2. Klick auf dieselbe Grabflur → Session öffnen, dann Edit-Mode
      this.lastClickedGrabflureUuid = null;
      try {
        await this.sessionManager.openSession(hitFeature, this.municipality);
        this.enterEditMode(hitFeature);
      } catch {
        // SessionConflictError / SessionOpenError behandeln bereits
        // alert() in GrabflurSessionManager – hier nichts weiter tun
      }
      return;
    }

    // 1. Klick → UUID merken + auf Grabflur zoomen
    this.lastClickedGrabflureUuid = uuid;
    const extent = hitFeature!.getGeometry()?.getExtent();
    const mapSize = this.map.getSize();
    if (extent && mapSize && extent.every(Number.isFinite)) {
      this.viewHistory.pushState();
      this.map.getView().fit(extent, {
        size: mapSize,
        padding: [50, 50, 50, 50],
        maxZoom: 20,
        duration: 400,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Edit-Mode
  // -----------------------------------------------------------------------

  /**
   * Schaltet in den Edit-Mode: zeigt die Edit-Toolbar, aktiviert
   * das Select-Werkzeug und dispatcht ein EDITOR_MODE_CHANGE-Event.
   */
  enterEditMode(feature: Feature<Geometry>): void {
    const container = document.getElementById("edit-tools-container");
    container?.classList.remove("edit-tools-hidden");
    container?.classList.add("edit-tools-visible");

    this.setActiveTool("select");
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.classList.remove("highlighted"));
    document
      .querySelector('[data-tool="select"]')
      ?.classList.add("highlighted");

    console.log(
      `[Editor] 🖊️ Edit-Mode für Grabflur: ${feature.get("name") || feature.get("flur_nr") || "unbenannt"}`,
    );

    dispatchCrossWindowEvent(P2D2EventType.EDITOR_MODE_CHANGE, {
      mode: "edit",
      previousMode: "navigate",
      windowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  /**
   * Beendet den Edit-Mode: verbirgt die Toolbar, entfernt Interaktionen,
   * blendet Grabflure aus, dispatcht EDITOR_MODE_CHANGE.
   */
  exitEditMode(): void {
    this.setActiveTool(null);
    this.activeTool = null;
    this.layerManager.clearGrabflure();
    this.layerManager.setGrabflureVisible(false);
    document
      .getElementById("edit-tools-container")
      ?.classList.remove("edit-tools-visible");
    document
      .getElementById("edit-tools-container")
      ?.classList.add("edit-tools-hidden");
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.classList.remove("highlighted"));
    document
      .querySelector('[data-tool="select"]')
      ?.classList.add("highlighted");
    this.lastClickedGrabflureUuid = null;

    dispatchCrossWindowEvent(P2D2EventType.EDITOR_MODE_CHANGE, {
      mode: "navigate",
      previousMode: "edit",
      windowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  // -----------------------------------------------------------------------
  // Werkzeug-Steuerung
  // -----------------------------------------------------------------------

  /**
   * Gibt den persistenten grabflureSelect zurück (für Save-Button-Prüfung
   * in GrabflurUIManager).
   */
  getGrabflureSelect(): Select | null {
    return this.grabflureSelect;
  }

  /**
   * Wechselt das aktive Editor-Werkzeug.
   *
   * @param toolName "select" | "move" | "modify" | null (deaktivieren)
   */
  setActiveTool(toolName: string | null): void {
    // Alte Interaktionen entfernen
    this.editInteractions.forEach((i) => this.map.removeInteraction(i));
    this.editInteractions = [];

    if (!toolName) {
      // Beim Verlassen des Edit-Modes auch persistenten Select entfernen
      if (this.grabflureSelect) {
        this.map.removeInteraction(this.grabflureSelect);
        this.grabflureSelect = null;
      }
      this.activeTool = null;
      return;
    }

    switch (toolName) {
      case "select": {
        if (!this.grabflureSelect) {
          this.grabflureSelect = new Select({
            layers: [this.layerManager.getGrabflureLayer()],
            style: new Style({
              stroke: new Stroke({ color: "#3B82F6", width: 3 }),
              fill: new Fill({ color: "rgba(59, 130, 246, 0.2)" }),
            }),
          });
          this.grabflureSelect.on("select", (evt: SelectEvent) => {
            const hasSelection = evt.selected.length > 0;
            (
              document.getElementById("tool-save") as HTMLButtonElement
            ).disabled = !hasSelection;
          });
          this.map.addInteraction(this.grabflureSelect);
        } else {
          this.grabflureSelect.setActive(true);
        }
        break;
      }
      case "move": {
        const tr = new Translate({
          layers: [this.layerManager.getGrabflureLayer()],
          hitTolerance: 8,
        });
        tr.on("translatestart", () => {
          (document.getElementById("tool-save") as HTMLButtonElement).disabled =
            false;
        });
        this.map.addInteraction(tr);
        this.editInteractions.push(tr);
        break;
      }
      case "modify": {
        if (!this.grabflureSelect) break;
        this.grabflureSelect.setActive(false);
        const md = new Modify({
          features: this.grabflureSelect.getFeatures(),
          pixelTolerance: 6,
          insertVertexCondition: never,
        });
        md.on("modifystart", () => {
          (document.getElementById("tool-save") as HTMLButtonElement).disabled =
            false;
        });
        this.map.addInteraction(md);
        this.editInteractions.push(md);
        break;
      }
    }
    this.activeTool = toolName;
  }
}
