import type { Map as OLMap } from "ol";
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";
import Select from "ol/interaction/Select";
import Modify from "ol/interaction/Modify";
import Translate from "ol/interaction/Translate";
import Snap from "ol/interaction/Snap";
import { click } from "ol/events/condition";
import { DragPan } from "ol/interaction"; // <-- NEU IMPORTIEREN
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";
import type { ViewHistoryManager } from "@/utils/view-history-manager";
import { MAP_CONFIG } from "@/config/map-config";

/**
 * Verwaltet alle Karten-Interaktionen (Hover, Klick, Bearbeitungswerkzeuge).
 */
export class EditorInteractionManager {
  private map: OLMap;
  private state: EditorState;
  private layerManager: EditorLayerManager;
  private viewHistory: ViewHistoryManager;

  private hoverPopup!: Overlay;
  private hoverFeature: Feature | null = null;
  private hoverTimeout: number | null = null;

  // Interaktionen
  private select: Select | null = null;
  private modify: Modify | null = null;
  private translate: Translate | null = null;
  private snap: Snap | null = null;

  // NEU: Letzte angeklickte Grabflur für 1-Klick/2-Klick-Logik
  private lastClickedGrabflur: Feature | null = null;

  // --- Styles ---
  private readonly HOVER_STYLE = new Style({
    stroke: new Stroke({ color: "#dc2626", width: 3 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.4)" }),
  });

  constructor(
    map: OLMap,
    state: EditorState,
    layerManager: EditorLayerManager,
    viewHistory: ViewHistoryManager,
  ) {
    this.map = map;
    this.state = state;
    this.layerManager = layerManager;
    this.viewHistory = viewHistory;

    this.initHoverPopup();
    this.initPlotSelection();

    // Bearbeitungs-Werkzeuge werden später initialisiert, nachdem Layer geladen sind
  }

  /**
   * Initialisiert das Hover-Popup für Grabflure.
   */
  private initHoverPopup() {
    const popupElement = document.createElement("div");
    popupElement.className = "grabflur-hover-popup";
    document.body.appendChild(popupElement);

    this.hoverPopup = new Overlay({
      element: popupElement,
      positioning: "bottom-center",
      offset: [0, -10],
      stopEvent: false,
    });
    this.map.addOverlay(this.hoverPopup);

    this.map.on("pointermove", (evt) => {
      if (evt.dragging) return;

      const grabflurLayer = this.layerManager.getLayer("grabflur");
      let featureAtPixel: Feature | null = null;

      this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
        if (layer === grabflurLayer) {
          featureAtPixel = f as Feature;
          return true;
        }
      });

      if (featureAtPixel !== this.hoverFeature) {
        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);

        if (this.hoverFeature) {
          // Reset style only if not selected
          if (this.hoverFeature !== this.state.getSelectedFeature()) {
            this.hoverFeature.setStyle(undefined); // Verwendet Layer-Stil
          }
        }

        if (!featureAtPixel) {
          this.hoverPopup.setPosition(undefined);
        }

        this.hoverFeature = featureAtPixel;

        if (featureAtPixel) {
          (featureAtPixel as Feature<Geometry>).setStyle(this.HOVER_STYLE);

          this.hoverTimeout = window.setTimeout(() => {
            const name = featureAtPixel!.get("name") || "Unbenannt";
            const number = this.extractGrabflurNumber(name);
            popupElement.innerHTML = `
                            <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px;">Grabflur ${number}</div>
                            <div style="font-size: 12px; color: #6b7280;">${name}</div>
                        `;
            this.hoverPopup.setPosition(evt.coordinate);
          }, 600);
        }
      }
    });
  }

  /**
   * Initialisiert das Klick-Verhalten zum Auswählen von Grabfluren.
   * Jetzt mit 1-Klick/2-Klick-Logik:
   * - 1. Klick: Setzt aktive Grabflur (löst On-Demand-Laden aus)
   * - 2. Klick (gleiche Grabflur): Wechselt in Edit-Modus
   */
  private initPlotSelection() {
    this.map.on("click", (evt) => {
      // Nur im Navigate-Modus auf Grabfluren lauschen
      if (this.state.getEditorMode() !== "navigate") return;

      const grabflurLayer = this.layerManager.getLayer("grabflur");
      let clickedFeature: Feature | null = null;

      this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
        if (layer === grabflurLayer) {
          clickedFeature = f as Feature;
          return true;
        }
      });

      if (clickedFeature) {
        // Logik für 1. Klick / 2. Klick
        if (clickedFeature === this.lastClickedGrabflur) {
          // --- 2. KLICK ---
          // (Gleiche Grabflur erneut geklickt)
          console.log("[InteractionManager] 2. Klick: Wechsle in Edit-Modus.");
          this.state.setEditorMode("edit");
          // this.zoomToFeature(clickedFeature); // <-- ENTFERNT (passiert bei Klick 1)
        } else {
          // --- 1. KLICK ---
          // (Neue Grabflur angeklickt)
          console.log(
            "[InteractionManager] 1. Klick: Setze aktive Grabflur UND zoome.",
          );

          // 1. State setzen (löst Datenladen im Orchestrator aus)
          this.state.setActiveGrabflur(clickedFeature);

          // 2. Sofort Zoom auf die angeklickte Grabflur
          this.zoomToFeature(clickedFeature);
        }

        // Klick merken
        this.lastClickedGrabflur = clickedFeature;
      } else {
        // Klick ins Leere (Grabflur-Auswahl aufheben)
        this.state.setActiveGrabflur(null);
        this.lastClickedGrabflur = null;
      }
    });
  }

  private zoomToFeature(feature: Feature) {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    const extent = geometry.getExtent();
    const view = this.map.getView();
    const mapSize = this.map.getSize();
    if (!mapSize) return;

    (this.map as any).isProgrammaticZoom = true;

    view.fit(extent, {
      size: mapSize,
      duration: 300,
      padding: [40, 40, 40, 40],
      maxZoom: 21,
      callback: () => {
        (this.map as any).isProgrammaticZoom = false;
        // Ansicht nach Animation speichern
        this.viewHistory.pushState();
      },
    });
  }

  /**
   * Initialisiert die Bearbeitungs-Interaktionen (Select, Modify, Translate, Snap).
   */
  private initModifyInteractions() {
    const graeberSource = this.layerManager.getGraeberSource();
    if (!graeberSource) {
      console.error(
        "Gräber-Source nicht gefunden. Bearbeitungs-Interaktionen können nicht initialisiert werden.",
      );
      return;
    }

    // Select (wird auch für Modify/Translate benötigt)
    this.select = new Select({
      layers: [this.layerManager.getGraeberLayer()!],
      style: this.HOVER_STYLE,

      // KORREKTUR: Filtert die Auswahl auf die aktive Grabflur
      filter: (feature, layer) => {
        const activeGrabflur = this.state.getActiveGrabflur();
        if (!activeGrabflur) return false;

        // KORREKTUR: Vergleiche 'grabflur' (L12)  mit *extrahierter Nummer* (L10)
        const activeGrabflurName = activeGrabflur.get("name");
        const activeGrabflurNumber = this.extractGrabflurNumber(
          activeGrabflurName || "",
        );
        const featureGrabflurName = feature.get("grabflur");

        return (
          featureGrabflurName &&
          activeGrabflurNumber &&
          featureGrabflurName === activeGrabflurNumber
        );
      },
    });

    this.select.on("select", (e) => {
      const selected = e.selected.length > 0 ? e.selected[0] : null;
      this.state.setSelectedFeature(selected as Feature<Geometry>);
    });

    // Modify (Geometrie-Punkte ändern)
    this.modify = new Modify({
      features: this.select.getFeatures(),
    });

    // Translate (Feature verschieben)
    this.translate = new Translate({
      features: this.select.getFeatures(),
    });

    // Snap (An anderen Features einrasten)
    this.snap = new Snap({
      source: graeberSource as any,
    });
  }

  /**
   * Wird von EditorApp aufgerufen, NACHDEM die Daten und Layer geladen sind.
   */
  public initializeModifyTools() {
    // Deaktiviere Map-Drag (Bug 2)
    this.setMapDragPan(false);

    this.initModifyInteractions();

    if (this.select) {
      this.map.addInteraction(this.select);
      this.map.addInteraction(this.modify!);
      this.map.addInteraction(this.translate!);
      this.map.addInteraction(this.snap!);

      // NEU: Dirty-Tracking Listener
      this.modify!.on("modifyend", (e) => {
        e.features.getArray().forEach((f) => {
          if (f.getId() !== undefined) {
            this.state.markAsDirty(f.getId()!);
          }
        });
      });

      this.translate!.on("translateend", (e) => {
        e.features.getArray().forEach((f) => {
          if (f.getId() !== undefined) {
            this.state.markAsDirty(f.getId()!);
          }
        });
      });
    }
  }

  /**
   * Deaktiviert alle Bearbeitungs-Interaktionen
   */
  public deactivateModifyTools() {
    // Aktiviere Map-Drag (Bug 2)
    this.setMapDragPan(true);

    if (this.select) this.map.removeInteraction(this.select);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.translate) this.map.removeInteraction(this.translate);
    if (this.snap) this.map.removeInteraction(this.snap);

    this.select = null;
    this.modify = null;
    this.translate = null;
    this.snap = null;
  }

  // NEU: Hilfsfunktion für Bug 2
  private setMapDragPan(active: boolean) {
    const dragPan = this.map
      .getInteractions()
      .getArray()
      .find((i) => i instanceof DragPan);

    if (dragPan) {
      dragPan.setActive(active);
    } else {
      console.warn("[InteractionManager] DragPan-Interaktion nicht gefunden.");
    }
  }

  private extractGrabflurNumber(name: string): string {
    if (!name) return "?";
    const match = name.match(/-(\d+)$/);
    return match ? match[1] : name;
  }

  // SICHERSTELLEN, DASS setTool EXISTIERT
  public setTool(toolName: "select" | "move" | "modify") {
    if (this.state.getEditorMode() !== "edit") return;
    this.state.setTool(toolName);

    // Interaktionen entfernen
    if (this.select) this.map.removeInteraction(this.select);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.translate) this.map.removeInteraction(this.translate);
    if (this.snap) this.map.removeInteraction(this.snap);

    // Gewünschte Interaktionen hinzufügen
    switch (toolName) {
      case "select":
        if (this.select) this.map.addInteraction(this.select);
        break;
      case "move":
        if (this.select) this.map.addInteraction(this.select);
        if (this.translate) this.map.addInteraction(this.translate);
        break;
      case "modify":
        if (this.select) this.map.addInteraction(this.select);
        if (this.modify) this.map.addInteraction(this.modify);
        if (this.snap) this.map.addInteraction(this.snap);
        break;
    }
  }
}
