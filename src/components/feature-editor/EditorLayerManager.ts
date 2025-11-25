import type { Map as OLMap } from "ol";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import TileWMS from "ol/source/TileWMS";
import ImageWMS from "ol/source/ImageWMS";
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
  private layers: Map<
    string,
    TileLayer<any> | VectorLayer<any> | ImageLayer<any>
  >;

  // --- Styles ---
  private readonly CEMETERY_BG_STYLE = new Style({
    stroke: new Stroke({ color: "rgba(194, 65, 12, 0.1)", width: 1 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.15)" }),
  });

  private readonly GRABFLUR_STYLE = new Style({
    stroke: new Stroke({ color: "#dc2626", width: 2 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.2)" }),
  });

  constructor(map: OLMap) {
    this.map = map;
    this.layers = new Map();
  }

  /**
   * Initialisiert die Basis-Layer (Luftbild, basemap.de, Friedhofsplan)
   */
  initBaseLayers(projection: string) {
    // Luftbild Köln WMS Layer
    const luftbildLayer = new TileLayer({
      source: new TileWMS({
        url: "https://geoportal.stadt-koeln.de/wss/service/luftbilder_2024_wms/guest",
        params: {
          LAYERS: "luftbilder_2024_23",
          FORMAT: "image/png",
          TILED: true,
        },
        projection: projection,
        crossOrigin: "anonymous",
        attributions:
          '<a href="https://www.offenedaten-koeln.de/dataset/luftbilder-koeln-2024" target="_blank">Luftbilder Köln 2024 © Stadt Köln</a>',
      }),
      visible: false,
      opacity: 1.0,
      zIndex: MAP_CONFIG.Z_INDEX.LUFTBILD,
    });
    this.addLayer("luftbild", luftbildLayer);

    // basemap.de WMS Layer
    const basemapLayer = new TileLayer({
      source: new TileWMS({
        url: "https://sgx.geodatenzentrum.de/wms_basemapde",
        params: {
          LAYERS: "de_basemapde_web_raster_farbe",
          FORMAT: "image/png",
          TRANSPARENT: "true",
          TILED: true,
        },
        projection: "EPSG:3857",
        crossOrigin: "anonymous",
        attributions:
          '© GeoBasis-DE / <a href="https://basemap.de" target="_blank">BKG</a>',
      }),
      visible: false,
      opacity: 1.0,
      zIndex: MAP_CONFIG.Z_INDEX.BASEMAP,
    });
    this.addLayer("basemap", basemapLayer);

    // Friedhofsplan Layer
    const friedhofsplanSource = new ImageWMS({
      url: "https://ows.data-dna.eu/service",
      params: {
        LAYERS: "friedhofsplan_rheinkassel",
        FORMAT: "image/png",
        TRANSPARENT: true,
        VERSION: "1.1.1",
      },
      projection: "EPSG:25832",
      serverType: "geoserver",
      ratio: 1.0,
    });

    const friedhofsplanLayer = new ImageLayer({
      source: friedhofsplanSource,
      extent: [355079.917, 5656115.018, 355310.314, 5656324.347],
      zIndex: MAP_CONFIG.Z_INDEX.FRIEDHOFS_PLAN || 10,
      opacity: 0.7,
      visible: true,
    });

    this.addLayer("friedhofsplan", friedhofsplanLayer);
  }

  /**
   * Erstellt die Feature-Layer (Hintergrund, Grabflure, Labels)
   */
  createFeatureLayers(
    parentFeature: Feature<Geometry>,
    childFeatures: Feature<Geometry>[],
  ) {
    // 1. Friedhof-Hintergrund-Layer
    const cemeteryBgLayer = new VectorLayer({
      source: new VectorSource({ features: [parentFeature] }),
      style: this.CEMETERY_BG_STYLE,
      zIndex: MAP_CONFIG.Z_INDEX.CEMETERY_BG,
    });
    this.addLayer("cemetery-bg", cemeteryBgLayer);

    // 2. Grabflur-Layer
    const grabflurSource = new VectorSource({ features: childFeatures });
    const grabflurLayer = new VectorLayer({
      source: grabflurSource,
      style: this.GRABFLUR_STYLE,
      zIndex: MAP_CONFIG.Z_INDEX.GRABFLUR,
    });
    this.addLayer("grabflur", grabflurLayer);

    // 3. Label-Layer
    const labelFeatures = this.createLabelFeatures(childFeatures);
    const labelLayer = new VectorLayer({
      source: new VectorSource({ features: labelFeatures }),
      zIndex: MAP_CONFIG.Z_INDEX.LABELS,
    });
    this.addLayer("labels", labelLayer);
  }

  private createLabelFeatures(
    grabflurFeatures: Feature<Geometry>[],
  ): Feature[] {
    return grabflurFeatures
      .map((feature) => {
        const name = feature.get("name") || "Unbenannt";
        const number = this.extractGrabflurNumber(name);
        const geometry = feature.getGeometry() as any; // ol/geom/Polygon | MultiPolygon

        if (geometry && typeof geometry.getInteriorPoint === "function") {
          const labelFeature = new Feature({
            geometry: geometry.getInteriorPoint(),
            label: number,
          });
          labelFeature.setStyle(
            new Style({
              text: new Text({
                text: number,
                font: "bold 16px Inter, sans-serif",
                fill: new Fill({ color: "#dc2626" }),
                stroke: new Stroke({ color: "#ffffff", width: 3 }),
              }),
            }),
          );
          return labelFeature;
        }
        return null;
      })
      .filter((f): f is Feature => f !== null);
  }

  private extractGrabflurNumber(name: string): string {
    if (!name) return "?";
    const match = name.match(/-(\d+)$/);
    return match ? match[1] : name;
  }

  // --- Öffentliche Methoden ---

  public addLayer(
    name: string,
    layer: VectorLayer<any> | TileLayer<any> | ImageLayer<any>,
  ) {
    this.layers.set(name, layer);
    this.map.addLayer(layer);
  }

  public getLayer(
    name: string,
  ): VectorLayer<any> | TileLayer<any> | ImageLayer<any> | undefined {
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
