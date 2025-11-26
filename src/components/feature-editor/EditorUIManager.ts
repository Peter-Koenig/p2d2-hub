import type { ViewHistoryManager } from "@/utils/view-history-manager";
import type { EditorLayerManager } from "./EditorLayerManager";
import type { EditorInteractionManager } from "./EditorInteractionManager";
import { LayerInteractionManager } from "@/utils/layer-interaction";
import type TileLayer from "ol/layer/Tile";
import type ImageLayer from "ol/layer/Image";
import type { EditorState } from "./EditorState";
import type { EditorDataManager } from "./EditorDataManager";

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
   * Bindet die Save/Cancel Toolbar-Logik
   */
  private bindToolbarControls() {
    const editToolsContainer = document.getElementById(
      "edit-tools-container",
    ) as HTMLDivElement | null;
    const saveBtn = document.getElementById(
      "tool-save",
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById(
      "tool-cancel",
    ) as HTMLButtonElement | null;

    if (!editToolsContainer || !saveBtn || !cancelBtn) {
      console.error("Edit-Toolbar UI-Elemente nicht gefunden.");
      return;
    }

    // 1. Listener für Speichern
    saveBtn.addEventListener("click", () => {
      // TODO: Logik zum Sammeln der geänderten Features
      // (z.B. aus einer 'dirty' Liste, die 'Modify' pflegt)
      const featuresToUpdate: any[] = [];

      this.dataManager.saveChanges(featuresToUpdate);
      this.state.setEditorMode("navigate");
    });

    // 2. Listener für Abbrechen
    cancelBtn.addEventListener("click", () => {
      if (
        confirm(
          "Möchten Sie die Bearbeitung wirklich abbrechen? Nicht gespeicherte Änderungen gehen verloren.",
        )
      ) {
        // TODO: Logik zum Zurücksetzen von Änderungen (z.B. Source neu laden)
        alert("Änderungen verworfen.");
        this.state.setEditorMode("navigate");
      }
    });

    // 3. State-Subscription: Toolbar ein/ausblenden
    this.state.subscribe((newState) => {
      if (newState.editorMode === "edit") {
        editToolsContainer.classList.remove("edit-tools-hidden");
        editToolsContainer.classList.add("edit-tools-visible");
      } else {
        editToolsContainer.classList.add("edit-tools-hidden");
        editToolsContainer.classList.remove("edit-tools-visible");
      }
    });
  }
}
