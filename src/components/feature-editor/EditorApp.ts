import { EditorState } from "./EditorState";
import { MapManager } from "./MapManager";
import { EditorLayerManager } from "./EditorLayerManager";
import { EditorDataManager } from "./EditorDataManager";
import { EditorInteractionManager } from "./EditorInteractionManager";
import { EditorUIManager } from "./EditorUIManager";
import { wfsAuthClient } from "@/utils/wfs-auth";

/**
 * Haupt-App-Klasse für den Feature Editor.
 * Orchestriert alle Sub-Module (State, Map, Layers, Data, UI).
 */
export class EditorApp {
  private container: HTMLElement;
  private state!: EditorState;
  private mapManager!: MapManager;
  private layerManager!: EditorLayerManager;
  private dataManager!: EditorDataManager;
  private interactionManager!: EditorInteractionManager;
  private uiManager!: EditorUIManager;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init() {
    try {
      // 1. State initialisieren (liest data-Attribute)
      this.state = new EditorState(this.container);

      // 2. Karte initialisieren
      this.mapManager = new MapManager(
        this.container.id,
        this.state.projection,
      );
      const map = this.mapManager.getMap();

      // 3. LayerManager (erstellt Basis-Layer)
      this.layerManager = new EditorLayerManager(map, this.state);
      this.layerManager.initBaseLayers(this.state.projection);

      // 4. DataManager (lädt Features)
      this.dataManager = new EditorDataManager(
        this.state,
        this.layerManager,
        wfsAuthClient,
      );

      // 5. InteractionManager (Werkzeuge, Hover, Klick)
      this.interactionManager = new EditorInteractionManager(
        map,
        this.state,
        this.layerManager,
        this.mapManager.getViewHistory(),
      );

      // 6. UIManager (verbindet UI-Buttons mit Logik)
      this.uiManager = new EditorUIManager(
        this.mapManager.getViewHistory(),
        this.layerManager,
        this.interactionManager,
        this.state,
        this.dataManager,
      );
      this.uiManager.bindControls();

      // 7. State-Orchestrierung
      this.setupStateOrchestration();

      // 8. Initiale Daten laden (L8, L10, L12)
      console.log("EditorApp: Lade initiale Features...");
      await this.dataManager.loadInitialFeatures();

      // 9. Auf Extent zoomen
      this.mapManager.fitToInitialExtent(this.state.initialExtentWGS84);
      console.log("EditorApp: Initialisierung abgeschlossen.");
    } catch (error) {
      console.error("Fehler in EditorApp.init():", error);
      // Optional: Zeige eine Fehlermeldung im UI an
      if (error instanceof Error) {
        this.container.innerHTML = `<div style="padding: 2rem; color: red;">Fehler beim Laden des Editors: ${error.message}</div>`;
      } else {
        this.container.innerHTML = `<div style="padding: 2rem; color: red;">Fehler beim Laden des Editors: Unbekannter Fehler</div>`;
      }
    }
  }

  /**
   * Orchestriert State-Änderungen zwischen verschiedenen Modulen
   */
  private setupStateOrchestration() {
    let lastMode = this.state.getEditorMode();

    // ANPASSUNG: Übergebe den 'oldState' (den die notifyListeners noch nicht haben),
    // indem wir den reaktiven State hier klonen.
    let oldReactiveState = this.state.getReactiveState();

    this.state.subscribe((newReactiveState) => {
      const newMode = newReactiveState.editorMode;

      // (Der Guard in setEditorMode  verhindert bereits die meisten Rekursionen,
      // aber wir verwenden `lastMode` weiterhin zur klaren Trennung der Logik)
      if (newMode === lastMode) {
        oldReactiveState = newReactiveState; // State aktualisieren
        return;
      }

      // FALL 1: Wechsel in den Edit-Modus
      if (newMode === "edit") {
        if (!newReactiveState.activeGrabflur) return;

        const grabflurName = newReactiveState.activeGrabflur.get("name");
        console.log("Orchestrator: Edit-Modus für Grabflur:", grabflurName);

        // 1. Editier-Werkzeuge initialisieren
        this.interactionManager.initializeModifyTools();
      }

      // FALL 2: Rückkehr in den Navigate-Modus
      if (newMode === "navigate") {
        console.log("Orchestrator: Wechsle in Navigate-Modus.");

        // 1. Interaktionen deaktivieren
        this.interactionManager.deactivateModifyTools();

        // KORREKTUR: Setze State nur, wenn es nötig ist, um Schleifen zu vermeiden.

        // 2. Aktive Grabflur zurücksetzen
        if (newReactiveState.activeGrabflur !== null) {
          this.state.setActiveGrabflur(null);
        }
        // 3. Auswahl zurücksetzen
        if (newReactiveState.selectedFeature !== null) {
          this.state.setSelectedFeature(null);
        }
      }

      // NEU: Gräber-Layer zum Neuzeichnen zwingen
      this.layerManager.getGraeberLayer()?.changed();

      lastMode = newMode;
      oldReactiveState = newReactiveState; // State für nächsten Durchlauf speichern
    });
  }
}
