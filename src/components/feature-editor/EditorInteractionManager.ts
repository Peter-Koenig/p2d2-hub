import type { Map as OLMap } from "ol";
import { Feature } from "ol";
import type { Geometry } from "ol/geom";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill, Text } from "ol/style";
import Select from "ol/interaction/Select";
import Modify from "ol/interaction/Modify";
import Translate from "ol/interaction/Translate";
import Snap from "ol/interaction/Snap";
// @ts-ignore - ol-rotate-feature hat keine Type-Definitionen
import RotateFeatureInteraction from "ol-rotate-feature"; // <-- HINZUFÜGEN
import { click } from "ol/events/condition";
import { DragPan } from "ol/interaction";
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";
import type { ViewHistoryManager } from "@/utils/view-history-manager";
import { MAP_CONFIG } from "@/config/map-config";
import type { ModifyEvent } from "ol/interaction/Modify";
import type { TranslateEvent } from "ol/interaction/Translate";
import {
  dispatchCrossWindowEvent,
  getWindowId,
} from "../../utils/cross-window-events";
import { P2D2EventType } from "../../utils/events";

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
  private rotate: RotateFeatureInteraction | null = null; // <-- HINZUFÜGEN
  private snap: Snap | null = null;

  // NEU: Letzte angeklickte Grabflur für 1-Klick/2-Klick-Logik
  private lastClickedGrabflur: Feature | null = null;

  // NEU: Speicher für Original-Geometrien
  private originalGeometries: Map<string | number, Geometry> = new Map();

  // NEU: Style-Cache für *Auswahl*
  private selectionStyleCache: Record<string, Style> = {};

  // NEU: Entdopplungs-Felder für EDITOR_FEATURE_MODIFIED Events (pro Feature)
  private lastModifiedEventTimes: Map<string, number> = new Map();
  private lastModifiedEventSignatures: Map<string, string> = new Map();
  private readonly DEBOUNCE_MS: number = 30; // 30 ms Debounce-Zeit für robustere Entdoppelung

  // --- Styles ---
  private readonly HOVER_STYLE = new Style({
    stroke: new Stroke({ color: "#dc2626", width: 3 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.4)" }),
  });

  // NEU: Basis-Stil für *Auswahl* (z.B. Blau, um sich von Rot/Grau abzusetzen)
  private readonly SELECTED_STYLE_BASE = new Style({
    stroke: new Stroke({ color: "#2563eb", width: 3 }),
    fill: new Fill({ color: "rgba(59, 130, 246, 0.4)" }),
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

      // --- KORREKTUR START ---
      // Popup nur im Navigationsmodus anzeigen.
      if (this.state.getEditorMode() !== "navigate") {
        // Sicherstellen, dass ein eventuell offenes Popup geschlossen wird
        if (this.hoverFeature) {
          this.hoverFeature.setStyle(undefined);
          this.hoverFeature = null;
        }
        this.hoverPopup.setPosition(undefined);
        return; // Bearbeitung hier abbrechen
      }
      // --- KORREKTUR ENDE ---

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
      hitTolerance: 5, // ← HINZUFÜGEN: 5 Pixel Toleranz für Hit-Detection

      // KORREKTUR: Ersetze statisches HOVER_STYLE durch eine Style-Funktion (Bug 1)
      style: (feature) => {
        const number = String(feature.get("grabnummer") || "?");

        // Style Caching
        if (this.selectionStyleCache[number]) {
          return this.selectionStyleCache[number];
        }

        // Style neu erstellen
        const newStyle = this.SELECTED_STYLE_BASE.clone();
        newStyle.setText(
          new Text({
            text: number,
            font: "bold 13px Inter, sans-serif",
            fill: new Fill({
              color: this.SELECTED_STYLE_BASE.getStroke()!.getColor() as string,
            }),
            stroke: new Stroke({ color: "#ffffff", width: 3 }),
            overflow: true,
          }),
        );

        this.selectionStyleCache[number] = newStyle;
        return newStyle;
      },

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

        // DEBUG
        console.log("%c[DEBUG Select-Filter]", "color: orange;", {
          featureId: feature.getId(),
          activeGrabflurName,
          activeGrabflurNumber,
          featureGrabflurName,
          match: featureGrabflurName === activeGrabflurNumber,
        });

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
    // Rotate (Feature drehen)
    this.rotate = new RotateFeatureInteraction({
      features: this.select.getFeatures(),
      anchor: undefined, // Nutzt das Zentrum des Features
      angle: 0,
    });

    // Snap (wie bisher)
    this.snap = new Snap({
      source: graeberSource as any,
    });
  }

  /**
   * Wird von EditorApp aufgerufen, NACHDEM die Daten und Layer geladen sind.
   */
  public initializeModifyTools() {
    console.log(
      "%c[InteractionManager] 🛠️ Werkzeuge werden initialisiert...",
      "color: green;",
    );
    this.setMapDragPan(false);
    this.originalGeometries.clear();

    // DEBUG: Anzahl Gräber in aktueller Grabflur
    const graeberSource = this.layerManager.getGraeberSource();
    if (graeberSource) {
      console.log(
        "%c[DEBUG] Anzahl Gräber in aktueller Grabflur:",
        "color: purple; font-weight: bold;",
        graeberSource.getFeatures().length,
      );
    } else {
      console.warn("[DEBUG] Graeber-Source ist nicht verfügbar.");
    }

    // 1. Interaktionen nur initialisieren (NICHT zur Karte hinzufügen)
    this.initModifyInteractions();

    // 2. Event-Listener für Dirty-Tracking an die (noch inaktiven) Interaktionen binden
    if (this.modify) {
      this.modify.on("modifyend", (e: ModifyEvent) =>
        this.markFeaturesAsDirty(e.features, "modify"),
      );
      this.modify.on("modifystart", (e: ModifyEvent) =>
        this.storeOriginalGeometries(e.features),
      );
    }
    if (this.translate) {
      this.translate.on("translateend", (e: TranslateEvent) =>
        this.markFeaturesAsDirty(e.features, "translate"),
      );
      this.translate.on("translatestart", (e: TranslateEvent) =>
        this.storeOriginalGeometries(e.features),
      );
    }
    if (this.rotate) {
      this.rotate.on("rotatestart", (e: any) => {
        console.log("[InteractionManager] 🔄 Rotation gestartet");
        this.storeOriginalGeometries(e.features);
      });
      this.rotate.on("rotateend", (e: any) => {
        console.log("[InteractionManager] ✅ Rotation beendet");
        this.markFeaturesAsDirty(e.features, "rotate");
      });
    }

    // 3. Standard-Werkzeug 'move' aktivieren.
    // setTool() kümmert sich um das Hinzufügen der korrekten Interaktionen.
    this.setTool("move");
  }

  // NEU: Hilfsfunktion für "modifystart" / "translatestart"
  private storeOriginalGeometries(features: any /* Collection<Feature> */) {
    features.getArray().forEach((f: Feature) => {
      const id = f.getId();
      if (id !== undefined && !this.originalGeometries.has(id)) {
        // Speichere einen Klon der Geometrie, *bevor* sie geändert wird
        this.originalGeometries.set(id, f.getGeometry()!.clone());
      }
    });
  }

  // NEU: Hilfsfunktion für "modifyend" / "translateend"
  private markFeaturesAsDirty(
    features: any /* Collection<Feature> */,
    tool: "modify" | "rotate" | "translate" = "modify",
  ) {
    features.getArray().forEach((f: Feature) => {
      if (f.getId() !== undefined) {
        console.log(
          `%c[InteractionManager] ✏️ Feature ${f.getId()} als 'dirty' markiert (Tool: ${tool}).`,
          "color: orange;",
        );
        this.state.markAsDirty(f.getId()!);

        // NEU: Event dispatchen mit Entdoppelung
        this.dispatchFeatureModifiedEvent(f, tool);
      }
    });
  }

  // NEU: Entdoppelung für EDITOR_FEATURE_MODIFIED Events
  private dispatchFeatureModifiedEvent(
    feature: Feature,
    tool: "modify" | "rotate" | "translate",
  ) {
    const rawId = feature.getId();
    if (rawId === undefined || rawId === null) return;
    const featureId = String(rawId); // Sicherstellen, dass ID als String behandelt wird

    const geometry = (feature.getGeometry() as any)?.getCoordinates?.() ?? null;

    // Normalisiere Geometrie-Koordinaten (Runde auf 6 Dezimalstellen, um Gleitkomma-Ungenauigkeiten zu ignorieren)
    const normalizedGeometry = this.normalizeGeometryCoordinates(geometry);

    // Erstelle eine Signatur für dieses Event
    const signature = JSON.stringify({
      featureId,
      tool,
      geometry: normalizedGeometry,
    });

    const now = Date.now();
    const lastTime = this.lastModifiedEventTimes.get(featureId) || 0;
    const lastSignature = this.lastModifiedEventSignatures.get(featureId) || "";

    // Prüfe auf Duplikat innerhalb des Debounce-Zeitraums
    if (now - lastTime < this.DEBOUNCE_MS && signature === lastSignature) {
      console.log(
        `%c[InteractionManager] ⏭️ EDITOR_FEATURE_MODIFIED für Feature ${featureId} entdoppelt (${now - lastTime} ms < ${this.DEBOUNCE_MS} ms)`,
        "color: gray;",
      );
      return;
    }

    // Event dispatchen
    dispatchCrossWindowEvent(P2D2EventType.EDITOR_FEATURE_MODIFIED, {
      featureId,
      tool,
      windowId: getWindowId(),
      geometry,
      timestamp: now,
    });

    // Status aktualisieren
    this.lastModifiedEventTimes.set(featureId, now);
    this.lastModifiedEventSignatures.set(featureId, signature);

    console.log(
      `%c[InteractionManager] ✏️ EDITOR_FEATURE_MODIFIED für Feature ${featureId} gesendet (Tool: ${tool})`,
      "color: orange;",
    );
  }

  // NEU: Hilfsfunktion zur Normalisierung von Geometrie-Koordinaten
  private normalizeGeometryCoordinates(geometry: any): any {
    if (!geometry || !Array.isArray(geometry)) return geometry;

    // Rekursive Funktion zum Runden von Zahlen in Arrays
    const roundNumbers = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map((item) => roundNumbers(item));
      } else if (typeof obj === "number") {
        // Runde auf 6 Dezimalstellen (ca. 0.1 mm Genauigkeit)
        return Math.round(obj * 1e6) / 1e6;
      }
      return obj;
    };

    return roundNumbers(geometry);
  }

  // NEU: Öffentliche Revert-Funktion
  public revertChanges() {
    const dirtyIds = this.state.getDirtyFeatureIds();
    const graeberSource = this.layerManager.getGraeberSource();
    console.log(
      `%c[InteractionManager] ⏪ Reverting ${dirtyIds.size} features...`,
      "color: red; font-weight: bold;",
    );
    if (!graeberSource) return;

    console.log(`[InteractionManager] Reverting ${dirtyIds.size} features...`);

    dirtyIds.forEach((id) => {
      const originalGeom = this.originalGeometries.get(id);
      const feature = graeberSource.getFeatureById(id);

      if (feature && originalGeom) {
        // Setze Geometrie auf den gespeicherten Originalzustand zurück
        feature.setGeometry(originalGeom);
      }
    });

    // Aufräumen
    this.originalGeometries.clear();
    this.state.clearDirtyFlags();
  }

  /**
   * Deaktiviert alle Bearbeitungs-Interaktionen
   */
  public deactivateModifyTools() {
    console.log(
      "%c[InteractionManager] 🛑 Werkzeuge werden deaktiviert...",
      "color: green;",
    );
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

    // NEU: Caches leeren
    this.originalGeometries.clear();
    this.clearSelectionStyleCache();

    // KORREKTUR: Setzt den Klick-Status zurück.
    this.lastClickedGrabflur = null;

    // NEU: Tool-State zurücksetzen (für nächsten Edit-Zyklus)
    this.state.resetToolSilent("select");
  }

  // NEU: Hilfsfunktion für Bug 2
  private setMapDragPan(active: boolean) {
    const dragPan = this.map
      .getInteractions()
      .getArray()
      .find((i) => i instanceof DragPan);

    if (dragPan) {
      console.log(
        `[InteractionManager] 🖐️ Map DragPan ${active ? "AKTIVIERT" : "DEAKTIVIERT"}.`,
      );
      dragPan.setActive(active);
    } else {
      console.warn("[InteractionManager] DragPan-Interaktion nicht gefunden.");
    }
  }

  // NEU: Hilfsfunktion zum Leeren des Style-Cache
  private clearSelectionStyleCache() {
    this.selectionStyleCache = {};
  }

  // NEU: Hilfsfunktion zum Leeren der Feature-Selection
  public clearSelection() {
    if (this.select) {
      this.select.getFeatures().clear();
      console.log("[InteractionManager] 🧹 Feature-Selection geleert");
    }
  }

  private extractGrabflurNumber(name: string): string {
    if (!name) return "?";
    const match = name.match(/-(\d+\w?)$/);
    return match ? match[1] : name;
  }

  // SICHERSTELLEN, DASS setTool EXISTIERT
  public setTool(toolName: "select" | "move" | "modify" | "rotate") {
    if (this.state.getEditorMode() !== "edit") return;

    // --- HIER HINZUFÜGEN START ---
    // GUARD: Wenn Tool bereits aktiv, nichts tun
    if (this.state.getTool() === toolName) {
      console.log(
        `[InteractionManager] ℹ️ Tool "${toolName}" ist bereits aktiv.`,
      );
      return;
    }
    // --- HIER HINZUFÜGEN ENDE ---

    console.log(
      `[InteractionManager] 🔧 Wechsle Tool: ${this.state.getTool()} → ${toolName}`,
    );

    // --- NEU: Selection zwischenspeichern ---
    const selectedFeatures: Feature<Geometry>[] = [];
    if (this.select) {
      this.select.getFeatures().forEach((feature) => {
        selectedFeatures.push(feature);
      });
    }
    // --- ENDE NEU ---

    // State-Update
    this.state.setTool(toolName);

    // Selection löschen (entfernt visuelle Overlays wie Rotation-Anker)
    if (this.select) {
      this.select.getFeatures().clear();
    }

    // Alle Interaktionen entfernen
    if (this.select) this.map.removeInteraction(this.select);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.translate) this.map.removeInteraction(this.translate);
    if (this.rotate) this.map.removeInteraction(this.rotate); // <-- HINZUFÜGEN
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

      // --- HIER NEUEN CASE HINZUFÜGEN ---
      case "rotate":
        if (this.select) this.map.addInteraction(this.select);
        if (this.rotate) this.map.addInteraction(this.rotate);
        break;
      // --- ENDE ---

      case "modify":
        if (this.select) this.map.addInteraction(this.select);
        if (this.modify) this.map.addInteraction(this.modify);
        if (this.snap) this.map.addInteraction(this.snap);
        break;
    }

    // --- NEU: Selection wiederherstellen ---
    if (this.select && selectedFeatures.length > 0) {
      selectedFeatures.forEach((feature) => {
        this.select!.getFeatures().push(feature);
      });

      // Explizit das Feature im State setzen (falls nur 1 Feature)
      if (selectedFeatures.length === 1) {
        this.state.setSelectedFeature(selectedFeatures[0]);
      }

      console.log(
        `[InteractionManager] ✅ ${selectedFeatures.length} Features wiederhergestellt`,
      );
    }
    // --- ENDE NEU ---
  }
}
