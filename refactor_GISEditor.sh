#!/bin/bash
#
# p2d2-Refactoring-Skript (Self-Extracting)
#
# Dieses Skript erstellt die neue modulare Struktur für den Feature-Editor
# unter src/components/feature-editor/ und aktualisiert die Seite
# src/pages/feature-editor/[featureId].astro.
#
# Ausführung: Führe dieses Skript aus dem Projekt-Root-Verzeichnis aus:
# > bash refactor_editor.sh
#

set -e # Bricht bei Fehlern sofort ab

main() {
    echo "▶️ Starte Refaktorierung des Feature-Editors..."

    # 1. Neue Verzeichnisse erstellen
    echo "  📁 Erstelle Verzeichnis: src/components/feature-editor"
    mkdir -p "src/components/feature-editor"

    # 2. Veraltete Utility-Datei entfernen
    if [ -f "src/utils/editor-layer-manager.ts" ]; then
        echo "  🗑️  Entferne veraltete Utility: src/utils/editor-layer-manager.ts"
        rm "src/utils/editor-layer-manager.ts"
    fi

    # 3. Neue/aktualisierte Dateien schreiben

    # ==========================================================================
    # src/pages/feature-editor/[featureId].astro (Der Bootstrapper)
    # ==========================================================================
    echo "  🔄 Aktualisiere Seite (Bootstrapper): src/pages/feature-editor/[featureId].astro"
    cat << 'EOF' > "src/pages/feature-editor/[featureId].astro"
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import { getCollection } from "astro:content";
import "../../styles/feature-popup.css";
import "../../styles/feature-editor.css";
import FeatureEditorHeader from "../../components/feature-editor/FeatureEditorHeader.astro";
import NavigationControls from "../../components/feature-editor/NavigationControls.astro";
import LayerControls from "../../components/feature-editor/LayerControls.astro";
import Toolbar from "../../components/feature-editor/Toolbar.astro"; // NEU

const { featureId } = Astro.params;
const wp_name = Astro.url.searchParams.get("wp_name");
const container_type = Astro.url.searchParams.get("container_type");
const name = Astro.url.searchParams.get("name");
const extent = Astro.url.searchParams.get("extent"); // WGS84 Extent
const projection = Astro.url.searchParams.get("projection"); // Lokale Projektion (z.B. EPSG:25832)

// Validate required parameters
if (!wp_name || !container_type || !name || !extent || !projection) {
    throw new Error("Missing required URL parameters (wp_name, container_type, name, extent, projection)");
}

// Decode feature name for display
const decodedName = decodeURIComponent(name);

// Die Logik zur Ermittlung der Projektion aus der Collection [cite: 1030-1031]
// ist gut, aber der `projection` Parameter aus der URL ist zuverlässiger,
// da er direkt vom Client (map-state [cite: 100]) gesetzt wird. Wir vertrauen dem Parameter.
---

<BaseLayout title={`Feature Editor: ${decodedName}`}>
    <div class="feature-editor-container">
        <FeatureEditorHeader
            title={decodedName}
            commune=""
            wpName={wp_name}
            containerType={container_type}
        />

        <div class="editor-content">
            <div class="map-container">
                <div
                    id="feature-editor-map"
                    class="w-full h-full"
                    
                    data-wp-name={wp_name}
                    data-container-type={container_type}
                    data-name={name}
                    data-extent={extent}
                    data-projection={projection}
                >
                </div>

                <NavigationControls />
                <LayerControls />
                <Toolbar /> </div>
        </div>
    </div>

    <script>
        import { EditorApp } from "../../components/feature-editor/EditorApp";

        document.addEventListener("DOMContentLoaded", () => {
            const mapContainer = document.getElementById("feature-editor-map");

            if (mapContainer) {
                const editorApp = new EditorApp(mapContainer);
                editorApp.init().catch(error => {
                    console.error("Fehler beim Initialisieren des Editors:", error);
                    // Hier könnte man dem Nutzer eine Fehlermeldung anzeigen
                });
            } else {
                console.error("Editor-Map-Container nicht gefunden. App kann nicht starten.");
            }
        });
    </script>
</BaseLayout>
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorApp.ts (Der Orchestrator)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorApp.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorApp.ts"
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
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorState.ts (Single Source of Truth)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorState.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorState.ts"
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
EOF

    # ==========================================================================
    # src/components/feature-editor/MapManager.ts (Karten-Fabrik)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/MapManager.ts"
    cat << 'EOF' > "src/components/feature-editor/MapManager.ts"
import { Map as OLMap, View } from "ol";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { defaults } from "ol/control/defaults";
import FullScreen from "ol/control/FullScreen";
import { transformExtent } from "ol/proj";
import { registerUtm } from "@/utils/crs";
import { calculateUtmResolutions } from "@/utils/utm-resolutions";
import { ViewHistoryManager } from "@/utils/view-history-manager";
import { MAP_CONFIG } from "@/config/map-config";

/**
 * Verwaltet die Erstellung und Konfiguration der OpenLayers-Karte.
 */
export class MapManager {
    private map: OLMap;
    private view: View;
    private viewHistory: ViewHistoryManager;

    constructor(targetId: string, projection: string) {
        // 1. Projektion registrieren [cite: 1036, 1043]
        try {
            registerUtm(projection);
        } catch (error) {
            console.warn(`[MapManager] Registrierung der Projektion ${projection} fehlgeschlagen`, error);
        }

        // 2. Auflösungen berechnen [cite: 1048]
        const resolutions = calculateUtmResolutions();

        // 3. View erstellen [cite: 1048-1051]
        this.view = new View({
            projection: projection,
            center: MAP_CONFIG.INITIAL_CENTER, // Wird sofort überschrieben
            zoom: MAP_CONFIG.INITIAL_ZOOM,
            resolutions: resolutions,
            maxZoom: resolutions.length - 1,
            minZoom: 0,
        });

        // 4. Karte erstellen [cite: 1049-1051]
        this.map = new OLMap({
            target: targetId,
            view: this.view,
            layers: [
                new TileLayer({
                    source: new OSM(),
                    zIndex: MAP_CONFIG.Z_INDEX.BASE,
                }),
            ],
            controls: defaults({
                zoom: MAP_CONFIG.CONTROLS.ZOOM,
                rotate: MAP_CONFIG.CONTROLS.ROTATE,
                attribution: MAP_CONFIG.CONTROLS.ATTRIBUTION,
            }).extend([
                new FullScreen(MAP_CONFIG.FULLSCREEN)
            ]),
        });

        // 5. View History Manager initialisieren [cite: 1037]
        this.viewHistory = new ViewHistoryManager(this.view);

        // Globale Referenz für LayerControls (könnte man per Event-Bus lösen)
        (window as any).featureEditorMap = this.map;
    }

    public getMap(): OLMap {
        return this.map;
    }

    public getViewHistory(): ViewHistoryManager {
        return this.viewHistory;
    }

    /**
     * Zoomt die Karte auf den initialen Extent.
     */
    public fitToInitialExtent(extentWGS84: number[]) {
        const transformedExtent = transformExtent(
            extentWGS84,
            "EPSG:4326",
            this.view.getProjection().getCode()
        ); [cite: 1046]

        // Warten auf Map-Render, um korrekte Größe zu haben
        this.map.once("postrender", () => {
            this.map.updateSize(); [cite: 1066]
            const mapSize = this.map.getSize();
            if (mapSize && mapSize[0] > 0 && mapSize[1] > 0) {
                this.view.fit(transformedExtent, {
                    size: mapSize,
                    ...MAP_CONFIG.FIT_VIEW,
                }); [cite: 1068-1069]
                
                // Initiale Ansicht zur History hinzufügen
                this.viewHistory.pushState();
            } else {
                console.warn("[MapManager] Map-Größe ist 0, Fit-View verzögert.");
                setTimeout(() => this.fitToInitialExtent(extentWGS84), 200);
            }
        });
    }
}
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorLayerManager.ts (Layer-Verwaltung)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorLayerManager.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorLayerManager.ts"
import type { Map as OLMap } from 'ol';
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text } from "ol/style";
import { Feature } from "ol";
import type { Geometry } from "ol/geom";
import { MAP_CONFIG } from "@/config/map-config";

/**
 * Verwaltet alle Layer (Basis-Layer und Feature-Layer) im Editor.
 * Ersetzt src/utils/editor-layer-manager.ts.
 */
export class EditorLayerManager {
    private map: OLMap;
    private layers: Map<string, TileLayer<any> | VectorLayer<any>>;

    // --- Styles ---
    private readonly CEMETERY_BG_STYLE = new Style({
        stroke: new Stroke({ color: "rgba(194, 65, 12, 0.1)", width: 1 }),
        fill: new Fill({ color: "rgba(234, 88, 12, 0.15)" }),
    }); [cite: 1089-1091]
    
    private readonly GRABFLUR_STYLE = new Style({
        stroke: new Stroke({ color: "#dc2626", width: 2 }),
        fill: new Fill({ color: "rgba(234, 88, 12, 0.2)" }),
    }); [cite: 1111-1113]

    constructor(map: OLMap) {
        this.map = map;
        this.layers = new Map();
    }

    /**
     * Initialisiert die Basis-Layer (Luftbild, basemap.de)
     */
    initBaseLayers(projection: string) {
        // Luftbild Köln WMS Layer [cite: 1052-1057]
        const luftbildLayer = new TileLayer({
            source: new TileWMS({
                url: "https://geoportal.stadt-koeln.de/wss/service/luftbilder_2024_wms/guest",
                params: { LAYERS: "luftbilder_2024_23", FORMAT: "image/png", TILED: true },
                projection: projection,
                crossOrigin: "anonymous",
                attributions: '<a href="https://www.offenedaten-koeln.de/dataset/luftbilder-koeln-2024" target="_blank">Luftbilder Köln 2024 © Stadt Köln</a>',
            }),
            visible: false,
            opacity: 1.0,
            zIndex: MAP_CONFIG.Z_INDEX.LUFTBILD,
        });
        this.addLayer("luftbild", luftbildLayer);
        (window as any).luftbildLayer = luftbildLayer; // Für LayerControls Komponente

        // basemap.de WMS Layer [cite: 1058-1063]
        const basemapLayer = new TileLayer({
            source: new TileWMS({
                url: "https://sgx.geodatenzentrum.de/wms_basemapde",
                params: { LAYERS: "de_basemapde_web_raster_farbe", FORMAT: "image/png", TRANSPARENT: "true", TILED: true },
                projection: "EPSG:3857",
                crossOrigin: "anonymous",
                attributions: '© GeoBasis-DE / <a href="https://basemap.de" target="_blank">BKG</a>',
            }),
            visible: false,
            opacity: 1.0,
            zIndex: MAP_CONFIG.Z_INDEX.BASEMAP,
        });
        this.addLayer("basemap", basemapLayer);
        (window as any).basemapLayer = basemapLayer; // Für LayerControls Komponente
    }

    /**
     * Erstellt die Feature-Layer (Hintergrund, Grabflure, Labels)
     */
    createFeatureLayers(parentFeature: Feature<Geometry>, childFeatures: Feature<Geometry>[]) {
        // 1. Friedhof-Hintergrund-Layer [cite: 1092-1094]
        const cemeteryBgLayer = new VectorLayer({
            source: new VectorSource({ features: [parentFeature] }),
            style: this.CEMETERY_BG_STYLE,
            zIndex: MAP_CONFIG.Z_INDEX.CEMETERY_BG,
        });
        this.addLayer("cemetery-bg", cemeteryBgLayer);

        // 2. Grabflur-Layer [cite: 1134-1136]
        const grabflurSource = new VectorSource({ features: childFeatures });
        const grabflurLayer = new VectorLayer({
            source: grabflurSource,
            style: this.GRABFLUR_STYLE,
            zIndex: MAP_CONFIG.Z_INDEX.GRABFLUR,
        });
        this.addLayer("grabflur", grabflurLayer);

        // 3. Label-Layer [cite: 1117-1133]
        const labelFeatures = this.createLabelFeatures(childFeatures);
        const labelLayer = new VectorLayer({
            source: new VectorSource({ features: labelFeatures }),
            zIndex: MAP_CONFIG.Z_INDEX.LABELS,
        });
        this.addLayer("labels", labelLayer);
    }

    private createLabelFeatures(grabflurFeatures: Feature<Geometry>[]): Feature[] {
        return grabflurFeatures.map(feature => {
            const name = feature.get("name") || "Unbenannt";
            const number = this.extractGrabflurNumber(name); [cite: 1118]
            const geometry = feature.getGeometry() as any; // ol/geom/Polygon | MultiPolygon

            if (geometry && typeof geometry.getInteriorPoint === "function") {
                const labelFeature = new Feature({
                    geometry: geometry.getInteriorPoint(), [cite: 1121]
                    label: number,
                });
                labelFeature.setStyle(new Style({
                    text: new Text({
                        text: number, [cite: 1123]
                        font: "bold 16px Inter, sans-serif", [cite: 1124]
                        fill: new Fill({ color: "#dc2626" }), [cite: 1125]
                        stroke: new Stroke({ color: "#ffffff", width: 3 }), [cite: 1126-1127]
                    }),
                }));
                return labelFeature;
            }
            return null;
        }).filter((f): f is Feature => f !== null);
    }

    private extractGrabflurNumber(name: string): string { [cite: 1220]
        if (!name) return "?";
        const match = name.match(/-(\d+)$/);
        return match ? match[1] : name; [cite: 1221]
    }

    // --- Öffentliche Methoden ---

    public addLayer(name: string, layer: VectorLayer<any> | TileLayer<any>) {
        this.layers.set(name, layer);
        this.map.addLayer(layer);
    }

    public getLayer(name: string): VectorLayer<any> | TileLayer<any> | undefined {
        return this.layers.get(name);
    }

    public getGrabflurSource(): VectorSource<Geometry> | undefined {
        const layer = this.getLayer("grabflur") as VectorLayer<any>;
        return layer?.getSource();
    }
    
    public setLayerVisible(name: string, visible: boolean) {
        const layer = this.layers.get(name);
        if (layer) {
            layer.setVisible(visible);
        }
    }
}
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorDataManager.ts (Daten-Verwaltung WFS/WFS-T)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorDataManager.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorDataManager.ts"
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { WFSAuthClient } from "@/utils/wfs-auth";
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";

/**
 * Verwaltet das Laden von Features (WFS) und das Speichern (WFS-T).
 */
export class EditorDataManager {
    private state: EditorState;
    private layerManager: EditorLayerManager;
    private wfsClient: WFSAuthClient;
    private geojsonFormat: GeoJSON;

    constructor(state: EditorState, layerManager: EditorLayerManager, wfsClient: WFSAuthClient) {
        this.state = state;
        this.layerManager = layerManager;
        this.wfsClient = wfsClient;
        this.geojsonFormat = new GeoJSON();
    }

    /**
     * Lädt das Parent-Feature (Friedhof) und die Child-Features (Grabflure).
     */
    async loadInitialFeatures() {
        // 1. Lade Parent-Feature (Friedhof) [cite: 1079-1088]
        const parentFeature = await this.fetchParentFeature();
        if (!parentFeature) {
            throw new Error(`Haupt-Feature '${this.state.name}' nicht gefunden.`);
        }
        
        // 2. Lade Child-Features (Grabflure) [cite: 1100-1110]
        const childFeatures = await this.fetchChildFeatures();
        
        // 3. Features im State speichern
        this.state.setFeatures(parentFeature, childFeatures);
        
        // 4. LayerManager anweisen, die Layer zu erstellen
        this.layerManager.createFeatureLayers(parentFeature, childFeatures);
    }

    private async fetchParentFeature(): Promise<Feature<Geometry> | null> {
        const cqlFilter = `osm_admin_level=8 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name='${this.state.name}'`; [cite: 1079]
        const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
            CQL_FILTER: cqlFilter,
        }); [cite: 1081]
        
        const response = await this.wfsClient.fetchWithAuth(wfsUrl); [cite: 1082]
        if (!response.ok) throw new Error(`WFS-Anfrage für Parent-Feature fehlgeschlagen: ${response.statusText}`);

        const geoJson = await response.json(); [cite: 1084]
        const features = this.geojsonFormat.readFeatures(geoJson, {
            dataProjection: "EPSG:4326",
            featureProjection: this.state.projection,
        }); [cite: 1086-1088]

        return features.length > 0 ? features[0] : null;
    }
    
    private async fetchChildFeatures(): Promise<Feature<Geometry>[]> {
        const namePattern = `${this.state.name}-%`; [cite: 1101]
        const cqlFilter = `osm_admin_level=10 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name LIKE '${namePattern}'`; [cite: 1102]

        const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
            CQL_FILTER: cqlFilter,
        }); [cite: 1104]
        
        const response = await this.wfsClient.fetchWithAuth(wfsUrl); [cite: 1105]
        if (!response.ok) throw new Error(`WFS-Anfrage für Child-Features fehlgeschlagen: ${response.statusText}`);

        const geoJson = await response.json(); [cite: 1106]
        
        // Wichtig: Original-Properties (name) für Hover/Label setzen [cite: 1211-1213]
        const features = this.geojsonFormat.readFeatures(geoJson, {
            dataProjection: "EPSG:4326",
            featureProjection: this.state.projection,
        });
        
        (geoJson.features || []).forEach((rawFeature, index) => {
            if (features[index]) {
                features[index].set("name", rawFeature.properties?.name || "Unbenannt");
            }
        });

        return features;
    }

    /**
     * TODO: Implement WFS-T Save Logic
     * Baut eine Transaktion und sendet sie.
     */
    async saveChanges(
        featuresToUpdate: Feature<Geometry>[], 
        featuresToCreate: Feature<Geometry>[], 
        featuresToDelete: Feature<Geometry>[]
    ) {
        console.log("Speichern von Änderungen (WFS-T)...");
        // 1. Baue XML für <wfs:Update>, <wfs:Insert>, <wfs:Delete>
        //    (Adaptiere Logik aus src/utils/polygon-wfst-sync.ts [cite: 173-180])
        
        // 2. Transformiere Geometrien zurück nach EPSG:4326

        // 3. const transactionXml = buildTransactionXml(...)
        
        // 4. const wfstClient = WFSAuthClient.createWFSTClient();
        //    await wfstClient.executeWFSTransaction(transactionXml);
        
        alert("Speichern-Funktion ist noch nicht implementiert.");
    }
}
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorInteractionManager.ts (Werkzeuge)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorInteractionManager.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorInteractionManager.ts"
import type { Map as OLMap } from 'ol';
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";
import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import Translate from 'ol/interaction/Translate';
import Draw from 'ol/interaction/Draw';
import Snap from 'ol/interaction/Snap';
import { click } from 'ol/events/condition';
import type { EditorState } from './EditorState';
import type { EditorLayerManager } from './EditorLayerManager';
import { MAP_CONFIG } from '@/config/map-config';

/**
 * Verwaltet alle Karten-Interaktionen (Hover, Klick, WFS-T-Werkzeuge).
 */
export class EditorInteractionManager {
    private map: OLMap;
    private state: EditorState;
    private layerManager: EditorLayerManager;
    
    private hoverPopup: Overlay;
    private hoverFeature: Feature | null = null;
    private hoverTimeout: number | null = null;
    
    // Interaktionen
    private select: Select;
    private modify: Modify;
    private translate: Translate;
    private draw: Draw;
    private snap: Snap;

    // --- Styles ---
    private readonly HOVER_STYLE = new Style({
        stroke: new Stroke({ color: "#dc2626", width: 3 }),
        fill: new Fill({ color: "rgba(234, 88, 12, 0.4)" }),
    }); [cite: 1114-1116]

    constructor(map: OLMap, state: EditorState, layerManager: EditorLayerManager) {
        this.map = map;
        this.state = state;
        this.layerManager = layerManager;

        this.initHoverPopup(); [cite: 1137-1139]
        this.initClickZoom(); [cite: 1162]
        this.initWfsTInteractions();
        
        // Standard-Werkzeug aktivieren
        this.setTool("select");
    }

    /**
     * Initialisiert das Hover-Popup für Grabflure.
     */
    private initHoverPopup() {
        const popupElement = document.createElement("div");
        popupElement.className = "grabflur-hover-popup"; [cite: 794]
        document.body.appendChild(popupElement);

        this.hoverPopup = new Overlay({
            element: popupElement,
            positioning: "bottom-center",
            offset: [0, -10],
            stopEvent: false,
        }); [cite: 1138]
        this.map.addOverlay(this.hoverPopup);

        this.map.on("pointermove", (evt) => { [cite: 1142]
            if (evt.dragging) return;

            const grabflurLayer = this.layerManager.getLayer("grabflur");
            let featureAtPixel: Feature | null = null;
            
            this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === grabflurLayer) {
                    featureAtPixel = f as Feature;
                    return true;
                }
            }); [cite: 1144-1145]

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
                    featureAtPixel.setStyle(this.HOVER_STYLE); [cite: 1152]

                    this.hoverTimeout = window.setTimeout(() => { [cite: 1153]
                        const name = featureAtPixel.get("name") || "Unbenannt";
                        const number = this.extractGrabflurNumber(name);
                        popupElement.innerHTML = `
                            <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px;">Grabflur ${number}</div>
                            <div style="font-size: 12px; color: #6b7280;">${name}</div>
                        `; [cite: 1155-1158]
                        this.hoverPopup.setPosition(evt.coordinate);
                    }, 600);
                }
            }
        });
    }

    /**
     * Initialisiert das Klick-Verhalten zum Zoomen auf Grabflure.
     */
    private initClickZoom() {
        this.map.on("click", (evt) => { [cite: 1162]
            // Nur ausführen, wenn 'select'-Werkzeug aktiv ist
            if (this.state.getTool() !== 'select') return;

            const grabflurLayer = this.layerManager.getLayer("grabflur");
            let clickedFeature: Feature | null = null;
            
            this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === grabflurLayer) {
                    clickedFeature = f as Feature;
                    return true;
                }
            }); [cite: 1164]

            if (clickedFeature) {
                this.state.setSelectedFeature(clickedFeature);
                this.zoomToFeature(clickedFeature); [cite: 1167]
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

        (this.map as any).isProgrammaticZoom = true; [cite: 1195]

        view.fit(extent, {
            size: mapSize,
            duration: 300,
            padding: [40, 40, 40, 40], [cite: 1178]
            maxZoom: 21, [cite: 1189]
            callback: () => { [cite: 1198]
                (this.map as any).isProgrammaticZoom = false; [cite: 1199]
                // Ansicht nach Animation speichern
                const viewHistory = (window as any).navigationControls?.viewHistory;
                if (viewHistory) {
                    viewHistory.pushState(); [cite: 1208]
                }
            }
        });
    }
    
    /**
     * Initialisiert die WFS-T Interaktionen (Select, Modify, Translate, Draw).
     */
    private initWfsTInteractions() {
        const grabflurSource = this.layerManager.getGrabflurSource();
        if (!grabflurSource) {
            console.error("Grabflur-Source nicht gefunden. WFS-T-Interaktionen können nicht initialisiert werden.");
            return;
        }

        // Select (wird auch für Modify/Translate benötigt)
        this.select = new Select({
            condition: click,
            layers: [this.layerManager.getLayer("grabflur")],
            style: this.HOVER_STYLE, // Nutze Hover-Stil für Selektion
        });

        this.select.on('select', (e) => {
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

        // Draw (Neue Features zeichnen)
        this.draw = new Draw({
            source: grabflurSource,
            type: 'Polygon',
        });

        // Snap (An anderen Features einrasten)
        this.snap = new Snap({
            source: grabflurSource,
        });
    }
    
    /**
     * Aktiviert das ausgewählte Werkzeug und deaktiviert die anderen.
     */
    public setTool(toolName: 'select' | 'move' | 'draw') {
        this.state.setTool(toolName);
        
        // Alle Interaktionen entfernen
        this.map.removeInteraction(this.select);
        this.map.removeInteraction(this.modify);
        this.map.removeInteraction(this.translate);
        this.map.removeInteraction(this.draw);
        this.map.removeInteraction(this.snap);

        // Gewünschte Interaktionen hinzufügen
        switch (toolName) {
            case 'select':
                this.map.addInteraction(this.select);
                break;
            
            case 'move':
                this.map.addInteraction(this.select);
                this.map.addInteraction(this.translate);
                break;
                
            case 'draw':
                this.map.addInteraction(this.draw);
                this.map.addInteraction(this.snap);
                break;
            
            // TODO: 'modify' (Punkte bearbeiten)
        }
    }

    private extractGrabflurNumber(name: string): string {
        if (!name) return "?";
        const match = name.match(/-(\d+)$/);
        return match ? match[1] : name;
    }
}
EOF

    # ==========================================================================
    # src/components/feature-editor/EditorUIManager.ts (UI-Binder)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/EditorUIManager.ts"
    cat << 'EOF' > "src/components/feature-editor/EditorUIManager.ts"
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
EOF

    # ==========================================================================
    # src/components/feature-editor/Toolbar.astro (Neue Werkzeugleiste)
    # ==========================================================================
    echo "  ✨ Erstelle neu: src/components/feature-editor/Toolbar.astro"
    cat << 'EOF' > "src/components/feature-editor/Toolbar.astro"
---
import IconButton from "./IconButton.astro";
---

<div class="toolbar-controls">
    <IconButton
        id="tool-select"
        icon="👆"
        title="Auswählen"
        tooltip="Objekte auswählen (Klick) oder zoomen (Klick auf Grabflur)"
        class="tool-btn"
        data-tool="select"
    />
    <IconButton
        id="tool-move"
        icon="↔️"
        title="Verschieben"
        tooltip="Ausgewählte Objekte verschieben"
        class="tool-btn"
        data-tool="move"
    />
    <IconButton
        id="tool-draw"
        icon="✏️"
        title="Zeichnen"
        tooltip="Neues Polygon zeichnen"
        class="tool-btn"
        data-tool="draw"
    />
    <IconButton
        id="tool-delete"
        icon="🗑️"
        title="Löschen"
        tooltip="Ausgewähltes Objekt löschen"
        class="tool-btn"
        data-tool="delete"
        disabled={true}
    />
    
    <div class="toolbar-divider"></div>

    <IconButton
        id="tool-save"
        icon="💾"
        title="Speichern"
        tooltip="Änderungen speichern (WFS-T)"
        class="tool-btn save-btn"
        data-tool="save"
    />
</div>

<style>
    .toolbar-controls {
        position: absolute;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 0.5rem;
        z-index: 1000;
        background: rgba(255, 255, 255, 0.9);
        padding: 0.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(4px);
    }

    .tool-btn.highlighted {
        background: #3b82f6;
        border-color: #2563eb;
        color: white;
    }

    .toolbar-divider {
        width: 1px;
        background: #e5e7eb;
        margin: 0 0.25rem;
    }

    .save-btn {
        background: #16a34a;
        color: white;
        border-color: #15803d;
    }
    .save-btn:hover:not(:disabled) {
        background: #15803d;
    }
</style>
EOF

    echo "✅ Refaktorierung abgeschlossen."
    echo "Bitte überprüfe die neuen Dateien unter src/components/feature-editor/ und die aktualisierte Seite."
    echo "Möglicherweise musst du 'npm install' ausführen, falls Abhängigkeiten (z.B. OpenLayers-Typen) fehlen."
}

# Skript ausführen
main "$@"
