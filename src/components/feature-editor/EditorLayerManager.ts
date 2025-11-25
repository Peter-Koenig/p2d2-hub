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
