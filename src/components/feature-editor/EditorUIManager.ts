import type { ViewHistoryManager } from "@/utils/view-history-manager";
import type { EditorLayerManager } from "./EditorLayerManager";
import type { EditorInteractionManager } from "./EditorInteractionManager";
import { LayerInteractionManager } from "@/utils/layer-interaction";
import type TileLayer from "ol/layer/Tile";
import type ImageLayer from "ol/layer/Image";
import type { EditorState } from "./EditorState";
import type { EditorDataManager } from "./EditorDataManager";
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";

/**
 * Verbindet die Astro-UI-Komponenten (Buttons) mit der Editor-Logik.
 * Entfernt die Notwendigkeit für <script>-Blöcke in den UI-Komponenten.
 */
export class EditorUIManager {
  private viewHistory: ViewHistoryManager;
  private layerManager: EditorLayerManager;
  private interactionManager: EditorInteractionManager;
  private layerInteractionManager: LayerInteractionManager;
  private state: EditorState;
  private dataManager: EditorDataManager;

  constructor(
    viewHistory: ViewHistoryManager,
    layerManager: EditorLayerManager,
    interactionManager: EditorInteractionManager,
    state: EditorState,
    dataManager: EditorDataManager,
  ) {
    this.viewHistory = viewHistory;
    this.layerManager = layerManager;
    this.interactionManager = interactionManager;
    this.layerInteractionManager = new LayerInteractionManager();
    this.state = state;
    this.dataManager = dataManager;
  }

  /**
   * Sucht alle UI-Elemente und fügt die korrekten Event-Listener hinzu.
   */
  public bindControls() {
    this.bindNavigationControls();
    this.bindLayerControls();
    this.bindToolbarControls();
  }

  private bindNavigationControls() {
    const backBtn = document.getElementById("nav-back");
    const fwdBtn = document.getElementById("nav-forward");

    backBtn?.addEventListener("click", () => this.viewHistory.back());
    fwdBtn?.addEventListener("click", () => this.viewHistory.forward());

    // Initialen Button-Status setzen (mit initialem getState)
    this.updateNavButtons(this.viewHistory.getState());

    // Listener für Status-Updates
    // Der Callback empfängt jetzt den 'state'
    this.viewHistory.subscribe((state) => this.updateNavButtons(state));
  }

  // KORRIGIERT: updateNavButtons akzeptiert jetzt den Status als Argument
  private updateNavButtons(state: {
    canGoBack: boolean;
    canGoForward: boolean;
  }) {
    const backBtn = document.getElementById("nav-back") as HTMLButtonElement;
    const fwdBtn = document.getElementById("nav-forward") as HTMLButtonElement;
    if (!backBtn || !fwdBtn) return;

    backBtn.disabled = !state.canGoBack;
    fwdBtn.disabled = !state.canGoForward;
  }

  private bindLayerControls() {
    const layerButtons = document.querySelectorAll("[data-layer-toggle]");

    layerButtons.forEach((button) => {
      const layerName = (button as HTMLElement).dataset.layerToggle;
      const buttonId = button.id;
      if (!layerName || !buttonId) return;

      // 1. Hole den Layer vom Manager
      const layer = this.layerManager.getLayer(layerName) as
        | TileLayer<any>
        | ImageLayer<any>;
      if (!layer) {
        console.warn(
          `[UIManager] Layer "${layerName}" nicht im Manager gefunden.`,
        );
        return;
      }

      // 2. Registriere Long-Press (Opacity)
      this.layerInteractionManager.registerLongPress(
        buttonId,
        layer as TileLayer<any>,
        layerName,
      );

      // 3. Registriere Klick (Toggle)
      button.addEventListener("click", () => {
        // Prüfe, ob es ein Long-Press war
        const state = (this.layerInteractionManager as any).states?.get(
          buttonId,
        );
        if (state?.wasLongPress) {
          state.wasLongPress = false; // Flag zurücksetzen
          return; // Kein Toggle nach Long-Press
        }
        this.toggleLayer(layerName, layer);
      });

      // 4. Initialen Status wiederherstellen
      try {
        const savedVisible =
          localStorage.getItem(`${layerName}Visible`) === "true";
        layer.setVisible(savedVisible);
        button.classList.toggle("highlighted", savedVisible);
      } catch (e) {
        /* ignore */
      }
    });
  }

  private toggleLayer(
    layerName: string,
    layer: TileLayer<any> | ImageLayer<any>,
  ) {
    const newVisibility = !layer.getVisible();

    // 1. Setze Sichtbarkeit im LayerManager
    this.layerManager.setLayerVisible(layerName, newVisibility);

    // 2. Button-Highlighting
    const btn = document.querySelector(`[data-layer-toggle="${layerName}"]`);
    btn?.classList.toggle("highlighted", newVisibility);

    // 3. Persistenz
    try {
      localStorage.setItem(`${layerName}Visible`, String(newVisibility));
    } catch (error) {
      console.warn("Could not persist layer state", error);
    }
  }

  /**
   * Bindet die Save/Cancel Toolbar-Logik mit Event Delegation am stabilen Parent
   */
  private bindToolbarControls() {
    // KORREKTUR: Wir binden den Listener an den STABILEN 'map-container',
    // der die Toolbar und die Map enthält und nicht von Astro HMR zerstört wird.
    const mapContainer =
      document.getElementById("feature-editor-map")?.parentElement;

    if (!mapContainer) {
      console.error(
        "Stabiler 'map-container' für Event Delegation nicht gefunden.",
      );
      return;
    }

    // 1. Hänge EINEN Listener an den STABILEN Container
    mapContainer.addEventListener("click", (event) => {
      // --- DEBUGGING ---
      console.log(
        "%c[UIManager] Global Click on mapContainer",
        "color: purple; font-weight: bold;",
        event.target,
      );

      // KORREKTUR: Verwende HTMLElement statt HTMLButtonElement für IconButton-Komponenten
      const button = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-tool]",
      );

      console.log("%c[UIManager] closest button:", "color: purple;", button);
      // --- ENDE DEBUGGING ---

      // Wenn der Klick nicht auf einem Button war, ignoriere ihn.
      if (!button) return;

      // Finde den (potenziell neu gerenderten) Container für Highlighting
      const editToolsContainer = document.getElementById(
        "edit-tools-container",
      );

      // KORREKTUR: Verwende HTMLElement statt HTMLButtonElement
      const allButtons =
        editToolsContainer?.querySelectorAll<HTMLElement>("[data-tool]");

      const toolName = button.dataset.tool;
      console.log(
        `%c[UIManager] 🔘 Button Klick: ${toolName}`,
        "color: #b91c1c;",
      );

      // --- Logik von vorher (bleibt identisch) ---
      if (
        toolName === "select" ||
        toolName === "move" ||
        toolName === "modify" ||
        toolName === "rotate" // <-- HINZUFÜGEN
      ) {
        if (!allButtons) return;
        // Logik für Werkzeug-Auswahl
        allButtons.forEach((btn) => {
          if (btn.dataset.tool !== "save" && btn.dataset.tool !== "cancel") {
            btn.classList.remove("highlighted");
          }
        });
        button.classList.add("highlighted");
        this.interactionManager.setTool(
          toolName as "select" | "move" | "modify" | "rotate", // <-- ERWEITERN
        );
      } else if (toolName === "save") {
        console.log("[UIManager] 💾 'Speichern' Aktion gestartet...");
        // ... (Logik zum Sammeln der Features bleibt gleich)
        const featuresToUpdate: Feature<Geometry>[] = [];
        const dirtyIds = this.state.getDirtyFeatureIds();
        const graeberSource = this.layerManager.getGraeberSource();
        if (graeberSource && dirtyIds.size > 0) {
          dirtyIds.forEach((id) => {
            const feature = graeberSource.getFeatureById(id);
            if (feature) {
              featuresToUpdate.push(feature as Feature<Geometry>);
            }
          });
        }

        this.dataManager.saveChanges(featuresToUpdate);
        console.log("[UIManager] 💾 -> setEditorMode('navigate')");
        this.state.setEditorMode("navigate");
        console.log("[UIManager] 💾 -> clearDirtyFlags()");
        this.state.clearDirtyFlags();
      } else if (toolName === "cancel") {
        console.log("[UIManager] ❌ 'Abbrechen' Aktion gestartet...");
        let confirmed = true;
        if (this.state.hasDirtyFeatures) {
          console.log("[UIManager] ❌ Änderungen gefunden, zeige Bestätigung.");
          confirmed = confirm(
            "Möchten Sie die Bearbeitung wirklich abbrechen? Nicht gespeicherte Änderungen gehen verloren.",
          );
        }

        if (confirmed) {
          console.log("[UIManager] ❌ Bestätigt. Rufe revertChanges() auf...");
          this.interactionManager.revertChanges();
          console.log("[UIManager] ❌ -> setEditorMode('navigate')");
          this.state.setEditorMode("navigate");
        } else {
          console.log("[UIManager] ❌ Abgebrochen durch User.");
        }
      }
    });

    // 2. State-Subscription (Diese Logik ist jetzt sicher)
    this.state.subscribe((newState) => {
      // Finde den Container JEDES MAL neu (falls er neu gerendert wurde)
      const editToolsContainer = document.getElementById(
        "edit-tools-container",
      );
      if (!editToolsContainer) return;

      if (newState.editorMode === "edit") {
        editToolsContainer.classList.remove("edit-tools-hidden");
        editToolsContainer.classList.add("edit-tools-visible");
        // --- ERSETZEN START ---
        // Standardmäßig 'move' highlighten
        const moveBtn =
          document.querySelector<HTMLElement>('[data-tool="move"]');
        if (moveBtn) {
          // Alle anderen de-highlighten
          document
            .querySelectorAll<HTMLElement>("[data-tool]")
            .forEach((btn) => {
              if (
                btn.dataset.tool !== "save" &&
                btn.dataset.tool !== "cancel"
              ) {
                btn.classList.remove("highlighted");
              }
            });
          moveBtn.classList.add("highlighted");
        }
        // --- ERSETZEN ENDE ---
      } else {
        editToolsContainer.classList.add("edit-tools-hidden");
        editToolsContainer.classList.remove("edit-tools-visible");
      }

      // Save-Button-Logik
      // KORREKTUR: Verwende HTMLElement statt HTMLButtonElement
      const saveBtn = document.querySelector<HTMLElement>("[data-tool='save']");
      if (saveBtn) {
        if (saveBtn.hasAttribute("disabled") === newState.hasDirtyFeatures) {
          console.log(
            `[UIManager] 💾 Save-Button Status: ${newState.hasDirtyFeatures ? "aktiviert" : "deaktiviert"}`,
          );
        }
        saveBtn.toggleAttribute("disabled", !newState.hasDirtyFeatures);
      }
    });
  }
}
