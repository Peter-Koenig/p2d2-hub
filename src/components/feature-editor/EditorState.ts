import type { Feature } from "ol";
import type { Geometry } from "ol/geom";

// NEU: Typen für den reaktiven State definieren
export interface ReactiveEditorState {
  parentFeature: Feature<Geometry> | null;
  childFeatures: Feature<Geometry>[];
  allGraeberFeatures: Feature<Geometry>[];
  activeGrabflur: Feature<Geometry> | null;
  selectedFeature: Feature<Geometry> | null;
  currentTool: string;
  editorMode: "navigate" | "edit";
  altName: string | null;
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
  private allGraeberFeatures: Feature<Geometry>[] = [];
  private activeGrabflur: Feature<Geometry> | null = null;
  private selectedFeature: Feature<Geometry> | null = null;
  private currentTool: string = "select";
  private editorMode: "navigate" | "edit" = "navigate";
  private altName: string | null = null;

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

  setFeatures(
    parent: Feature<Geometry>,
    children: Feature<Geometry>[],
    graeber: Feature<Geometry>[],
    altName: string,
  ) {
    this.parentFeature = parent;
    this.childFeatures = children;
    this.allGraeberFeatures = graeber;
    this.altName = altName;
    this.notifyListeners();
  }

  getParentFeature(): Feature<Geometry> | null {
    return this.parentFeature;
  }

  getChildFeatures(): Feature<Geometry>[] {
    return this.childFeatures;
  }

  getAllGraeberFeatures(): Feature<Geometry>[] {
    return this.allGraeberFeatures;
  }

  getAltName(): string | null {
    return this.altName;
  }

  setActiveGrabflur(feature: Feature<Geometry> | null) {
    this.activeGrabflur = feature;
    this.notifyListeners();
  }

  getActiveGrabflur(): Feature<Geometry> | null {
    return this.activeGrabflur;
  }

  setSelectedFeature(feature: Feature<Geometry> | null) {
    this.selectedFeature = feature;
    this.notifyListeners();
  }

  getSelectedFeature(): Feature<Geometry> | null {
    return this.selectedFeature;
  }

  setTool(tool: string) {
    this.currentTool = tool;
    this.notifyListeners();
  }

  getTool(): string {
    return this.currentTool;
  }

  setEditorMode(mode: "navigate" | "edit") {
    this.editorMode = mode;
    this.notifyListeners();
  }

  getEditorMode(): "navigate" | "edit" {
    return this.editorMode;
  }

  // NEU: Helper-Methode für den reaktiven State
  getReactiveState(): ReactiveEditorState {
    return {
      parentFeature: this.parentFeature,
      childFeatures: this.childFeatures,
      allGraeberFeatures: this.allGraeberFeatures,
      activeGrabflur: this.activeGrabflur,
      selectedFeature: this.selectedFeature,
      currentTool: this.currentTool,
      editorMode: this.editorMode,
      altName: this.altName,
    };
  }
}
