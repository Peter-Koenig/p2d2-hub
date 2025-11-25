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

    constructor(container: HTMLElement) {
        this.container = container;
    }

    async init() {
        try {
            // 1. State initialisieren (liest data-Attribute)
            const state = new EditorState(this.container);

            // 2. Karte initialisieren
            const mapManager = new MapManager(this.container.id, state.projection);
            const map = mapManager.getMap();

            // 3. LayerManager (erstellt Basis-Layer)
            const layerManager = new EditorLayerManager(map);
            layerManager.initBaseLayers(state.projection);

            // 4. DataManager (lädt Features)
            const dataManager = new EditorDataManager(state, layerManager, wfsAuthClient);

            // 5. InteractionManager (Werkzeuge, Hover, Klick)
            const interactionManager = new EditorInteractionManager(map, state, layerManager);
            
            // 6. UIManager (verbindet UI-Buttons mit Logik)
            const uiManager = new EditorUIManager(
                mapManager.getViewHistory(),
                layerManager,
                interactionManager
            );
            uiManager.bindControls();

            // 7. Initiale Daten laden & auf Extent zoomen
            console.log("EditorApp: Lade initiale Features...");
            await dataManager.loadInitialFeatures();
            
            mapManager.fitToInitialExtent(state.initialExtentWGS84);
            console.log("EditorApp: Initialisierung abgeschlossen.");

        } catch (error) {
            console.error("Fehler in EditorApp.init():", error);
            // Optional: Zeige eine Fehlermeldung im UI an
            this.container.innerHTML = `<div style="padding: 2rem; color: red;">Fehler beim Laden des Editors: ${error.message}</div>`;
        }
    }
}
