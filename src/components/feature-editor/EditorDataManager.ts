import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { WFSAuthClient } from "@/utils/wfs-auth";
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";

/**
 * Verwaltet das Laden von Features (WFS) und das Speichern (uMap/OSM-Export).
 */
export class EditorDataManager {
  private state: EditorState;
  private layerManager: EditorLayerManager;
  private wfsClient: WFSAuthClient;
  private geojsonFormat: GeoJSON;

  constructor(
    state: EditorState,
    layerManager: EditorLayerManager,
    wfsClient: WFSAuthClient,
  ) {
    this.state = state;
    this.layerManager = layerManager;
    this.wfsClient = wfsClient;
    this.geojsonFormat = new GeoJSON();
  }

  /**
   * Lädt das Parent-Feature (Friedhof) und die Child-Features (Grabflure).
   */
  async loadInitialFeatures() {
    // 1. Lade Parent-Feature (Friedhof)
    const parentFeature = await this.fetchParentFeature();
    if (!parentFeature) {
      throw new Error(`Haupt-Feature '${this.state.name}' nicht gefunden.`);
    }

    // 2. Lade Child-Features (Grabflure)
    const childFeatures = await this.fetchChildFeatures();

    // 3. Features im State speichern
    this.state.setFeatures(parentFeature, childFeatures);

    // 4. LayerManager anweisen, die Layer zu erstellen
    this.layerManager.createFeatureLayers(parentFeature, childFeatures);
  }

  private async fetchParentFeature(): Promise<Feature<Geometry> | null> {
    const cqlFilter = `osm_admin_level=8 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name='${this.state.name}'`;
    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const response = await this.wfsClient.fetchWithAuth(wfsUrl);
    if (!response.ok)
      throw new Error(
        `WFS-Anfrage für Parent-Feature fehlgeschlagen: ${response.statusText}`,
      );

    const geoJson = await response.json();
    const features = this.geojsonFormat.readFeatures(geoJson, {
      dataProjection: "EPSG:4326",
      featureProjection: this.state.projection,
    });

    return features.length > 0 ? features[0] : null;
  }

  private async fetchChildFeatures(): Promise<Feature<Geometry>[]> {
    const namePattern = `${this.state.name}-%`;
    const cqlFilter = `osm_admin_level=10 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name LIKE '${namePattern}'`;

    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const response = await this.wfsClient.fetchWithAuth(wfsUrl);
    if (!response.ok)
      throw new Error(
        `WFS-Anfrage für Child-Features fehlgeschlagen: ${response.statusText}`,
      );

    const geoJson = await response.json();

    // Wichtig: Original-Properties (name) für Hover/Label setzen
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
   * TODO: Implementiere Speicher-Logik (z.B. uMap/OSM-Export)
   * Baut GeoJSON aus den modifizierten Features und übergibt sie.
   */
  async saveChanges(
    featuresToUpdate: Feature<Geometry>[],
    featuresToCreate: Feature<Geometry>[],
    featuresToDelete: Feature<Geometry>[],
  ) {
    console.log("Speichern von Änderungen...");

    // 1. Transformiere Geometrien zurück nach EPSG:4326
    const format = new GeoJSON();
    const allFeatures = [...featuresToUpdate, ...featuresToCreate];

    if (allFeatures.length > 0) {
      const updatedGeoJSON = format.writeFeatures(allFeatures, {
        dataProjection: "EPSG:4326",
        featureProjection: this.state.projection,
      });

      // 2. TODO: Logik für uMap-API oder OSM-Export implementieren
      // (WFS-T wird hier NICHT verwendet)

      console.log("Features zum Aktualisieren:", updatedGeoJSON);
      console.log("Features zum Löschen:", featuresToDelete.length);

      // 3. Demo: GeoJSON in Datei speichern oder an API senden
      // const blob = new Blob([updatedGeoJSON], { type: 'application/json' });
      // const url = URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = 'modified-features.geojson';
      // a.click();
    }

    alert("Speichern-Funktion ist noch nicht implementiert (Ziel: uMap/OSM).");
  }
}
