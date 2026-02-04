import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import {
  dispatchCrossWindowEvent,
  getWindowId,
} from "../../utils/cross-window-events";
import { P2D2EventType } from "../../utils/events";

// NEU: Typen für den reaktiven State definieren
export interface ReactiveEditorState {
  parentFeature: Feature<Geometry> | null;
  childFeatures: Feature<Geometry>[];
  activeGrabflur: Feature<Geometry> | null;
  selectedFeature: Feature<Geometry> | null;
  currentTool: string;
  editorMode: "navigate" | "edit";
  hasDirtyFeatures: boolean; // <-- NEU
  // NEU: Multi-Selection Felder
  selectedFeatures: ReadonlySet<Feature<Geometry>>;
  selectionMode: "single" | "multi";
}

type EditorStateCallback = (state: ReactiveEditorState) => void;

/**
 * Verwaltet den gesamten Zustand des Editors.
 * Liest die Startkonfiguration aus den data-Attributen des Map-Containers.
 */
export class EditorState {
  // --- Konfigurations-State (aus URL/data-Attributen) ---
  public readonly wpName: string;
  public readonly containerType: string;
  public readonly name: string;
  public readonly initialExtentWGS84: number[];
  public readonly projection: string;

  // --- Laufzeit-State ---
  private parentFeature: Feature<Geometry> | null = null;
  private childFeatures: Feature<Geometry>[] = [];
  private activeGrabflur: Feature<Geometry> | null = null;
  private selectedFeature: Feature<Geometry> | null = null;
  private currentTool: string = "select";
  private editorMode: "navigate" | "edit" = "navigate";

  // NEU: Dirty-Tracking
  private dirtyFeatures: Set<string | number> = new Set();

  // NEU: Multi-Selection State
  private selectedFeatures: Set<Feature<Geometry>> = new Set();
  private selectionMode: "single" | "multi" = "single";

  // NEU: Listener-Set
  private listeners: Set<EditorStateCallback> = new Set();

  constructor(container: HTMLElement) {
    // Lese Konfiguration aus data-Attributen
    this.wpName = container.dataset.wpName || "";
    this.containerType = container.dataset.containerType || "";
    this.name = container.dataset.name || "";
    this.initialExtentWGS84 = (container.dataset.extent || "0,0,0,0")
      .split(",")
      .map(Number);
    this.projection = container.dataset.projection || "EPSG:3857";

    if (!this.wpName || !this.containerType || !this.name || !this.projection) {
      throw new Error(
        "Fehlende data-Attribute am Map-Container. Editor kann nicht starten.",
      );
    }
  }

  // NEU: Private Methode zum Benachrichtigen
  private notifyListeners(): void {
    const state = this.getReactiveState();
    this.listeners.forEach((callback) => callback(state));
  }

  // NEU: subscribe-Methode
  public subscribe(callback: EditorStateCallback): () => void {
    this.listeners.add(callback);
    // Unsubscribe-Funktion zurückgeben
    return () => {
      this.listeners.delete(callback);
    };
  }

  // --- Getter / Setter für Laufzeit-State ---

  // ANPASSEN: setFeatures
  setFeatures(parent: Feature<Geometry>, children: Feature<Geometry>[]) {
    // (Für komplexe Objekte lassen wir den Guard hier weg, da flacher Vergleich teuer ist)
    this.parentFeature = parent;
    this.childFeatures = children;
    this.notifyListeners();
  }

  getParentFeature(): Feature<Geometry> | null {
    return this.parentFeature;
  }

  getChildFeatures(): Feature<Geometry>[] {
    return this.childFeatures;
  }

  setActiveGrabflur(feature: Feature<Geometry> | null) {
    if (this.activeGrabflur === feature) return; // <-- GUARD HINZUGEFÜGT
    this.activeGrabflur = feature;
    this.notifyListeners();
  }

  getActiveGrabflur(): Feature<Geometry> | null {
    return this.activeGrabflur;
  }

  setSelectedFeature(feature: Feature<Geometry> | null) {
    if (this.selectedFeature === feature) return; // <-- GUARD HINZUGEFÜGT

    this.selectedFeature = feature;
    this.notifyListeners();

    // NEU: Event dispatchen
    if (feature) {
      console.log("[EditorState] Feature selected:", feature.getId());

      // KORREKTUR: Nur serialisierbare Daten senden
      dispatchCrossWindowEvent(P2D2EventType.EDITOR_FEATURE_SELECTED, {
        featureId: feature.getId() as string,
        geometry: (feature.getGeometry() as any)?.getCoordinates?.() ?? null,
        properties: {
          grabflur: feature.get("grabflur"),
          grabnummer: feature.get("grabnummer"),
        },
        windowId: getWindowId(),
        timestamp: Date.now(),
      });
    } else {
      console.log("[EditorState] Feature deselected");

      dispatchCrossWindowEvent(P2D2EventType.EDITOR_FEATURE_DESELECTED, {
        windowId: getWindowId(),
        timestamp: Date.now(),
      });
    }
  }

  getSelectedFeature(): Feature<Geometry> | null {
    return this.selectedFeature;
  }

  setTool(tool: string) {
    if (this.currentTool === tool) return; // <-- GUARD HINZUGEFÜGT

    const previousTool = this.currentTool;
    this.currentTool = tool;
    this.notifyListeners();

    // NEU: Event dispatchen
    console.log("[EditorState] Tool switched:", previousTool, "->", tool);
    dispatchCrossWindowEvent(P2D2EventType.EDITOR_TOOL_SWITCH, {
      tool,
      previousTool,
      windowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  getTool(): string {
    return this.currentTool;
  }

  // NEU: Stiller Tool-Reset (ohne notifyListeners)
  // Wird für interne Cleanup-Operationen verwendet
  public resetToolSilent(tool: string): void {
    this.currentTool = tool;
    // Bewusst KEIN notifyListeners() - für interne Resets
  }

  setEditorMode(mode: "navigate" | "edit") {
    if (this.editorMode === mode) return; // <-- GUARD HINZUGEFÜGT

    const previousMode = this.editorMode;
    this.editorMode = mode;
    this.notifyListeners();

    // NEU: Event dispatchen
    console.log("[EditorState] Mode changed:", previousMode, "->", mode);
    dispatchCrossWindowEvent(P2D2EventType.EDITOR_MODE_CHANGE, {
      mode,
      previousMode,
      windowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  getEditorMode(): "navigate" | "edit" {
    return this.editorMode;
  }

  // --- NEUE Dirty-Tracking Methoden ---

  public markAsDirty(featureId: string | number) {
    if (this.dirtyFeatures.has(featureId)) return;
    this.dirtyFeatures.add(featureId);
    // Notify, damit UI (z.B. Save-Button) reagieren kann
    this.notifyListeners();
  }

  public clearDirtyFlags() {
    if (this.dirtyFeatures.size === 0) return;
    this.dirtyFeatures.clear();
    this.notifyListeners();
  }

  // KORREKTUR: In einen Getter umgewandelt (Fix 1)
  public get hasDirtyFeatures(): boolean {
    return this.dirtyFeatures.size > 0;
  }

  public getDirtyFeatureIds(): Set<string | number> {
    return this.dirtyFeatures;
  }

  // --- NEUE Multi-Selection Methoden ---

  /**
   * Togglet zwischen 'single' und 'multi' Auswahlmodus.
   * Beim Wechsel zu 'single' wird selectedFeatures geleert.
   */
  public toggleSelectionMode(): void {
    const newMode = this.selectionMode === "single" ? "multi" : "single";
    if (this.selectionMode === newMode) return; // Guard gegen redundante Updates

    this.selectionMode = newMode;

    if (newMode === "single") {
      // Beim Wechsel zu Single-Modus die Multi-Selektion leeren
      this.selectedFeatures.clear();
    }

    this.notifyListeners();
  }

  /**
   * Fügt ein Feature zur Multi-Selektion hinzu.
   * Nur wirksam im 'multi' Modus.
   */
  public addToSelection(feature: Feature<Geometry>): void {
    // Nur im Multi-Modus erlauben
    if (this.selectionMode !== "multi") return;

    // Guard: Wenn Feature bereits in Set, return (redundantes Add vermeiden)
    if (this.selectedFeatures.has(feature)) return;

    this.selectedFeatures.add(feature);
    this.notifyListeners();
  }

  /**
   * Entfernt ein Feature aus der Multi-Selektion.
   */
  public removeFromSelection(feature: Feature<Geometry>): void {
    // Guard: Wenn Feature nicht in Set, return
    if (!this.selectedFeatures.has(feature)) return;

    this.selectedFeatures.delete(feature);
    this.notifyListeners();
  }

  /**
   * Leert die gesamte Multi-Selektion.
   */
  public clearSelection(): void {
    // Guard: Wenn bereits leer, return
    if (this.selectedFeatures.size === 0) return;

    this.selectedFeatures.clear();
    this.notifyListeners();
  }

  /**
   * Gibt die aktuell selektierten Features zurück (read-only).
   */
  public getSelectedFeatures(): ReadonlySet<Feature<Geometry>> {
    return this.selectedFeatures;
  }

  /**
   * Gibt den aktuellen Selektionsmodus zurück.
   */
  public getSelectionMode(): "single" | "multi" {
    return this.selectionMode;
  }

  // ANPASSEN: getReactiveState
  getReactiveState(): ReactiveEditorState {
    return {
      parentFeature: this.parentFeature,
      childFeatures: this.childFeatures,
      activeGrabflur: this.activeGrabflur,
      selectedFeature: this.selectedFeature,
      currentTool: this.currentTool,
      editorMode: this.editorMode,
      // KORREKTUR: Fehlendes Property hinzugefügt (Fix 2)
      // Verwendet jetzt den neuen Getter (ohne Klammern)
      hasDirtyFeatures: this.hasDirtyFeatures,
      // NEU: Multi-Selection Felder
      selectedFeatures: this.selectedFeatures,
      selectionMode: this.selectionMode,
    };
  }
}
