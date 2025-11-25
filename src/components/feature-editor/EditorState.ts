import type { Feature } from "ol";
import type { Geometry } from "ol/geom";

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
    private selectedFeature: Feature<Geometry> | null = null;
    private currentTool: string = 'select'; // 'select', 'move', 'draw'

    constructor(container: HTMLElement) {
        // Lese Konfiguration aus data-Attributen [cite: 1028, 1038, 1042]
        this.wpName = container.dataset.wpName || "";
        this.containerType = container.dataset.containerType || "";
        this.name = container.dataset.name || "";
        this.initialExtentWGS84 = (container.dataset.extent || "0,0,0,0").split(",").map(Number);
        this.projection = container.dataset.projection || "EPSG:3857";

        if (!this.wpName || !this.containerType || !this.name || !this.projection) {
            throw new Error("Fehlende data-Attribute am Map-Container. Editor kann nicht starten.");
        }
    }

    // --- Getter / Setter für Laufzeit-State ---

    setFeatures(parent: Feature<Geometry>, children: Feature<Geometry>[]) {
        this.parentFeature = parent;
        this.childFeatures = children;
    }

    getParentFeature(): Feature<Geometry> | null {
        return this.parentFeature;
    }
    
    getChildFeatures(): Feature<Geometry>[] {
        return this.childFeatures;
    }

    setSelectedFeature(feature: Feature<Geometry> | null) {
        this.selectedFeature = feature;
        // Hier könnte ein Event-System (Pub/Sub) andere Module informieren
    }
    
    getSelectedFeature(): Feature<Geometry> | null {
        return this.selectedFeature;
    }

    setTool(tool: string) {
        this.currentTool = tool;
        // Event-System...
    }
    
    getTool(): string {
        return this.currentTool;
    }
}
