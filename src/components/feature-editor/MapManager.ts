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
