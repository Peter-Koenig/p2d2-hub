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

  // -- Modified-Tracking (Container-Versionen) --
  private modifiedUuids: Set<string> = new Set();

  // -- Pending (Popup-gesteuerter) Cemetery-Load --
  private pendingCemeteryId: string | null = null;
  private pendingExtent: number[] | null = null;
  private pendingCemeteryName: string = "";
  private pendingCemeteryFhNr: string = "";

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
      layers: [this.layerManager.getFriedhofLayer()],
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
      // Session-Kontext während aktiver Edit-Session nicht verlieren
      if (this.sessionManager.isSessionActive()) return;

      this.layerManager.clearGrabflure();
      this.layerManager.setGrabflureVisible(false);
      this.currentCemeteryId = null;
      this.exitEditMode();
      return;
    }

    const name = selected.get("name") || "Unbenannt";
    const cemeteryId = selected.getId() || name;
    const fhNr = selected.get("fh_nr") ?? "";
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
    // Während aktiver Edit-Session keinen Kontextwechsel erzwingen –
    // der Nutzer muss zuerst speichern oder abbrechen.
    if (this.sessionManager.isSessionActive()) return;
    this.exitEditMode();

    // ── Version-Popup anzeigen (statt sofortigem Laden) ──
    this.pendingCemeteryId = cemeteryId;
    this.pendingExtent = extent;
    this.pendingCemeteryName = name;
    this.pendingCemeteryFhNr = fhNr;

    // Grabflure zurücksetzen (vorherige ausblenden)
    this.layerManager.clearGrabflure();
    this.layerManager.setGrabflureVisible(false);

    this.showVersionPopup(name);
  }

  // -----------------------------------------------------------------------
  // Version-Popup
  // -----------------------------------------------------------------------

  /**
   * Zeigt das Version-Auswahl-Popup für einen Friedhof.
   * Aktuell rein visuell – die Versionen sind Platzhalter.
   */
  private showVersionPopup(fhName: string): void {
    const el = document.getElementById("version-popup");
    const subtitle = document.getElementById("version-popup-cemetery");
    if (subtitle) subtitle.textContent = `Friedhof: ${fhName}`;
    if (el) el.classList.remove("version-popup-hidden");
  }

  /** Versteckt das Version-Popup. */
  hideVersionPopup(): void {
    const el = document.getElementById("version-popup");
    if (el) el.classList.add("version-popup-hidden");
  }

  /** Setzt die Friedhofs-Auswahl zurück (nach Popup-Abbruch). */
  resetPendingCemeterySelection(): void {
    this.currentCemeteryId = null;
    this.pendingCemeteryId = null;
    this.pendingExtent = null;
  }

  /**
   * Wird aufgerufen, wenn der Nutzer im Version-Popup auf "Starten" klickt.
   * Lädt die Grabflur-Features des zuvor ausgewählten Friedhofs.
   */
  async proceedWithCemeteryLoad(): Promise<void> {
    this.hideVersionPopup();

    const cemeteryId = this.pendingCemeteryId;
    const extent = this.pendingExtent;

    if (!cemeteryId || !extent) {
      console.warn(
        "[GrabflurInteractionManager] Kein ausstehender Cemetery-Load",
      );
      return;
    }

    // Race-Condition-Schutz
    if (this.currentCemeteryId !== cemeteryId) return;

    try {
      const grabflureFeatures = await this.dataManager.loadGrabflureForFriedhof(
        extent,
        this.projection,
      );

      if (this.currentCemeteryId !== cemeteryId) return;

      this.layerManager.clearGrabflure();
      if (grabflureFeatures.length > 0) {
        this.layerManager.getGrabflureSource().addFeatures(grabflureFeatures);
        this.layerManager.setGrabflureVisible(true);
      } else {
        this.layerManager.setGrabflureVisible(false);
      }
    } catch (err) {
      console.error("[GrabflurInteractionManager] Grabflur-Ladefehler:", err);
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
      // 2. Klick auf dieselbe Grabflur → Session für Friedhof öffnen, dann Edit-Mode
      this.lastClickedGrabflureUuid = null;
      try {
        const fhNr = hitFeature.get("fh_nr");
        const fhName = hitFeature.get("fh_name");
        const wpName = hitFeature.get("wp_name");
        await this.sessionManager.openSession(
          fhNr,
          fhName,
          wpName,
          this.municipality,
          uuid,
        );
        this.enterEditMode();
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
   *
   * (Ruft clearModifiedTracking() auf, um das Modified-Tracking
   * für die neue Edit-Session zurückzusetzen.)
   */
  enterEditMode(): void {
    this.clearModifiedTracking();
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

    console.log("[Editor] 🖊️ Edit-Mode aktiviert");

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
    this.clearModifiedTracking();

    dispatchCrossWindowEvent(P2D2EventType.EDITOR_MODE_CHANGE, {
      mode: "navigate",
      previousMode: "edit",
      windowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  /**
   * Beendet den Edit-Mode, aber BEHÄLT die Grabflur-Features sichtbar.
   *
   * Wie exitEditMode, jedoch OHNE:
   *   - layerManager.clearGrabflure()
   *   - layerManager.setGrabflureVisible(false)
   *
   * Der Nutzer sieht nach dem Speichern weiterhin die Grabflur-Features
   * im Read-Only-Modus, bevor er zur nächsten Grabflur wechselt.
   * Das Event wird mit mode: 'view' (statt 'navigate') dispatchet,
   * damit die UI weiss, dass Features sichtbar bleiben sollen.
   */
  exitEditModeKeepFeatures(): void {
    this.setActiveTool(null);
    this.activeTool = null;
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
    this.clearModifiedTracking();

    dispatchCrossWindowEvent(P2D2EventType.EDITOR_MODE_CHANGE, {
      mode: "view",
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

  // -----------------------------------------------------------------------
  // Modified-Tracking (Container-Versionen)
  // -----------------------------------------------------------------------

  /**
   * Gibt alle modifizierten Features als Array zurück (für commitAndClose).
   *
   * Iteriert über den grabflureSource und filtert die Features,
   * deren p2d2_uuid in modifiedUuids enthalten ist.
   */
  getModifiedFeatures(): Array<{ uuid: string; geometry: any }> {
    const result: Array<{ uuid: string; geometry: any }> = [];
    this.layerManager
      .getGrabflureSource()
      .getFeatures()
      .forEach((f: any) => {
        const uuid = f.get("p2d2_uuid");
        if (uuid && this.modifiedUuids.has(uuid)) {
          result.push({ uuid, geometry: f.getGeometry() });
        }
      });
    return result;
  }

  /** Setzt das Modified-Tracking zurück (nach Commit oder Abbruch). */
  clearModifiedTracking(): void {
    this.modifiedUuids.clear();
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
        tr.on("translateend", (evt) => {
          evt.features.forEach((f: any) => {
            const uuid = f.get("p2d2_uuid");
            if (uuid) this.modifiedUuids.add(uuid);
          });
          (document.getElementById("tool-save") as HTMLButtonElement).disabled =
            false;
        });
        this.map.addInteraction(tr);
        this.editInteractions.push(tr);
        break;
      }
      case "modify": {
        if (!this.grabflureSelect) break;
        // grabflureSelect bleibt aktiv, damit ein Feature-Wechsel per Klick möglich ist
        const md = new Modify({
          features: this.grabflureSelect.getFeatures(),
          pixelTolerance: 6,
          insertVertexCondition: never,
        });
        md.on("modifyend", (evt) => {
          evt.features.forEach((f: any) => {
            const uuid = f.get("p2d2_uuid");
            if (uuid) this.modifiedUuids.add(uuid);
          });
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
