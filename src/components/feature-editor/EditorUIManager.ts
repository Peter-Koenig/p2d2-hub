import type { ViewHistoryManager } from "@/utils/view-history-manager";
import type { EditorLayerManager } from "./EditorLayerManager";
import type { EditorInteractionManager } from "./EditorInteractionManager";

/**
 * Verbindet die Astro-UI-Komponenten (Buttons) mit der Editor-Logik.
 * Entfernt die Notwendigkeit für <script>-Blöcke in den UI-Komponenten.
 */
export class EditorUIManager {
    private viewHistory: ViewHistoryManager;
    private layerManager: EditorLayerManager;
    private interactionManager: EditorInteractionManager;

    constructor(
        viewHistory: ViewHistoryManager,
        layerManager: EditorLayerManager,
        interactionManager: EditorInteractionManager
    ) {
        this.viewHistory = viewHistory;
        this.layerManager = layerManager;
        this.interactionManager = interactionManager;
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

        // Initialen Button-Status setzen
        this.updateNavButtons();
        // Listener für Status-Updates
        this.viewHistory.subscribe(() => this.updateNavButtons());
    }

    private updateNavButtons() {
        const backBtn = document.getElementById("nav-back") as HTMLButtonElement;
        const fwdBtn = document.getElementById("nav-forward") as HTMLButtonElement;
        if (!backBtn || !fwdBtn) return;
        
        const state = this.viewHistory.getState();
        backBtn.disabled = !state.canGoBack;
        fwdBtn.disabled = !state.canGoForward;
    }

    private bindLayerControls() {
        // Die Logik aus LayerControls.astro [cite: 617-642] wird hier zentralisiert.
        const layerButtons = document.querySelectorAll("[data-layer-toggle]");
        
        layerButtons.forEach(button => {
            const layerName = (button as HTMLElement).dataset.layerToggle;
            if (!layerName) return;

            button.addEventListener("click", () => {
                // Nur Toggle-Logik, Long-Press wird von LayerControls.astro-Skript gehandhabt
                const wasLongPress = (button as any).__wasLongPress;
                if (wasLongPress) {
                    (button as any).__wasLongPress = false; // Reset flag
                    return;
                }
                
                this.toggleLayer(layerName);
            });
        });
    }

    private toggleLayer(layerName: string) {
        const layer = (window as any)[`${layerName}Layer`]; // Verlässt sich auf globales window-Objekt
        if (!layer) return;

        const newVisibility = !layer.getVisible();
        layer.setVisible(newVisibility);

        // Button-Highlighting
        const btn = document.querySelector(`[data-layer-toggle="${layerName}"]`);
        btn?.classList.toggle("highlighted", newVisibility);
        
        // Persistenz (Logik aus [cite: 625-630])
        try {
            localStorage.setItem(`${layerName}Visible`, String(newVisibility));
        } catch (error) {
            console.warn("Could not persist layer state", error);
        }
    }

    private bindToolbarControls() {
        const toolButtons = document.querySelectorAll("[data-tool]");
        
        toolButtons.forEach(button => {
            button.addEventListener("click", () => {
                const toolName = (button as HTMLElement).dataset.tool;
                
                // Alle Buttons de-highlighten
                toolButtons.forEach(btn => btn.classList.remove("highlighted"));
                // Aktuellen Button highlighten
                button.classList.add("highlighted");
                
                if (toolName === 'select' || toolName === 'move' || toolName === 'draw') {
                    this.interactionManager.setTool(toolName);
                } else if (toolName === 'save') {
                    // TODO: Save-Logik aufrufen
                    alert("Speichern...");
                    // this.dataManager.saveChanges(...)
                }
            });
        });

        // 'select' standardmäßig aktivieren
        document.querySelector("[data-tool='select']")?.classList.add("highlighted");
    }
}
