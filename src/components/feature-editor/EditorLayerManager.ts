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
import type { StyleLike } from "ol/style/Style";
import { MAP_CONFIG } from "@/config/map-config";
import type { EditorState } from "./EditorState";

/**
 * Verwaltet alle Layer (Basis-Layer und Feature-Layer) im Editor.
 * Ersetzt src/utils/editor-layer-manager.ts.
 */
export class EditorLayerManager {
  private map: OLMap;
  private state: EditorState;
  private layers: Map<
    string,
    TileLayer<any> | VectorLayer<any> | ImageLayer<any>
  >;

  // NEU: Style-Cache für Performance
  private styleCache: {
    nav: Record<string, Style>;
    active: Record<string, Style>;
    inactive: Record<string, Style>;
  } = { nav: {}, active: {}, inactive: {} };

  // --- Styles ---
  private readonly CEMETERY_BG_STYLE = new Style({
    stroke: new Stroke({ color: "rgba(194, 65, 12, 0.1)", width: 1 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.15)" }),
  });

  private readonly GRABFLUR_STYLE = new Style({
    stroke: new Stroke({ color: "#dc2626", width: 2 }),
    fill: new Fill({ color: "rgba(234, 88, 12, 0.2)" }),
  });

  // NEU: Styling für die 3 Zustände
  private readonly GRAEBER_STYLE_NAV = new Style({
    stroke: new Stroke({ color: "#1f2937", width: 1 }),
    fill: new Fill({ color: "rgba(31, 41, 55, 0.2)" }),
  });

  private readonly GRAEBER_STYLE_EDIT_ACTIVE = new Style({
    stroke: new Stroke({ color: "#dc2626", width: 2 }),
    fill: new Fill({ color: "rgba(220, 38, 38, 0.3)" }),
  });

  private readonly GRAEBER_STYLE_EDIT_INACTIVE = new Style({
    stroke: new Stroke({ color: "#9ca3af", width: 1 }),
    fill: new Fill({ color: "rgba(156, 163, 175, 0.2)" }),
  });

  constructor(map: OLMap, state: EditorState) {
    this.map = map;
    this.state = state;
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
      zIndex: MAP_CONFIG.Z_INDEX.GRAVES || 10,
      opacity: 0.7,
      visible: true,
    });

    this.addLayer("friedhofsplan", friedhofsplanLayer);
  }

  /**
   * Erstellt die Feature-Layer (Hintergrund, Grabflure, Labels, Gräber)
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

    // 4. Gräber-Layer (ANPASSEN: Wird leer initialisiert)
    const graeberSource = new VectorSource({ features: [] }); // <-- LEER!
    const graeberLayer = new VectorLayer({
      source: graeberSource,
      // VERWENDE REAKTIVE STYLE-FUNKTION statt statischem Stil
      style: this.graeberStyleFunction.bind(this) as any,
      zIndex: MAP_CONFIG.Z_INDEX.GRAVES || 25,
    });
    this.addLayer("graeber", graeberLayer);
  }

  /**
   * Die reaktive Style-Funktion für Gräber
   */
  private graeberStyleFunction(feature: Feature<Geometry>): Style {
    const mode = this.state.getEditorMode();

    // KORREKTUR: Label aus 'grabnummer' holen
    const number = String(feature.get("grabnummer") || "?"); // z.B. "39/40/40a"

    let baseStyle: Style;
    let cache: Record<string, Style>;

    if (mode === "navigate") {
      baseStyle = this.GRAEBER_STYLE_NAV;
      cache = this.styleCache.nav;
    } else {
      // Modus ist 'edit'
      const activeGrabflur = this.state.getActiveGrabflur();

      // KORREKTUR: Vergleiche 'grabflur'-Attribut (L12) mit der *extrahierten Nummer* (L10)
      const featureGrabflurName = feature.get("grabflur"); // z.B. "010"

      let isActiveGrabflur = false;
      if (activeGrabflur) {
        const activeGrabflurName = activeGrabflur.get("name"); // z.B. "Rheinkassel-Friedhof-010"
        const activeGrabflurNumber = this.extractGrabflurNumber(
          activeGrabflurName || "",
        ); // z.B. "010"

        isActiveGrabflur =
          featureGrabflurName &&
          activeGrabflurNumber &&
          featureGrabflurName === activeGrabflurNumber;
      }

      if (isActiveGrabflur) {
        baseStyle = this.GRAEBER_STYLE_EDIT_ACTIVE; // Rot
        cache = this.styleCache.active;
      } else {
        baseStyle = this.GRAEBER_STYLE_EDIT_INACTIVE; // Grau
        cache = this.styleCache.inactive;
      }
    }

    // Style Caching (sehr wichtig für Labels)
    if (cache[number]) {
      return cache[number];
    }

    // Style neu erstellen
    const newStyle = baseStyle.clone();
    newStyle.setText(
      new Text({
        text: number, // KORREKTUR: 'grabnummer' verwenden
        font: "bold 12px Inter, sans-serif",
        fill: new Fill({
          color: (baseStyle.getStroke()?.getColor() as string) || "#000000",
        }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
        overflow: true, // Label darf über Polygongrenze ragen
      }),
    );

    cache[number] = newStyle; // Im Cache speichern
    return newStyle;
  }

  private createLabelFeatures(
    grabflurFeatures: Feature<Geometry>[],
  ): Feature[] {
    return grabflurFeatures
      .map((feature) => {
        const name = feature.get("name") || "Unbenannt";
        const number = this.extractGrabflurNumber(name || "");
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

  public getGrabflurSource(): VectorSource<any> | undefined {
    const layer = this.getLayer("grabflur") as VectorLayer<any>;
    return layer?.getSource();
  }

  public getGraeberSource(): VectorSource<any> | undefined {
    const layer = this.getLayer("graeber") as VectorLayer<any>;
    return layer?.getSource();
  }

  public getGraeberLayer(): VectorLayer<any> | undefined {
    return this.getLayer("graeber") as VectorLayer<any>;
  }

  public setLayerVisible(name: string, visible: boolean) {
    const layer = this.layers.get(name);
    if (layer) {
      layer.setVisible(visible);
    }
  }
}
