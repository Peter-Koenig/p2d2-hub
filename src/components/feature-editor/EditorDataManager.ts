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
