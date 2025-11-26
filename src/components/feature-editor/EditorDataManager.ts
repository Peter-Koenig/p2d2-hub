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
   * Lädt das Parent-Feature (Friedhof), Child-Features (Grabflure) und alle Gräber.
   */
  async loadInitialFeatures() {
    // 1. Lade Parent-Feature (Friedhof)
    const parentData = await this.fetchParentFeature();
    if (!parentData) {
      throw new Error(`Haupt-Feature '${this.state.name}' nicht gefunden.`);
    }

    const { feature: parentFeature, altName } = parentData;

    // 2. Lade Child-Features (Grabflure)
    const childFeatures = await this.fetchChildFeatures();

    // 3. NEU: Lade Gräber (ALLE)
    const graeberFeatures = await this.fetchGraeberFeatures(altName);

    // 4. Features im State speichern (mit altName)
    this.state.setFeatures(
      parentFeature,
      childFeatures,
      graeberFeatures,
      altName,
    );

    // 5. LayerManager anweisen
    this.layerManager.createFeatureLayers(
      parentFeature,
      childFeatures,
      graeberFeatures,
    );
  }

  /**
   * Lädt das Parent-Feature (Friedhof) und extrahiert den alt_name
   */
  private async fetchParentFeature(): Promise<{
    feature: Feature<Geometry>;
    altName: string;
  } | null> {
    const cqlFilter = `osm_admin_level=8 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name='${this.state.name}'`;

    // NEU: Fordere das 'alt_name' Feld explizit an
    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
      propertyName:
        "geometry,name,container_type,wp_name,osm_admin_level,alt_name",
    });

    const response = await this.wfsClient.fetchWithAuth(wfsUrl);
    if (!response.ok) {
      throw new Error(
        `WFS-Anfrage für Parent-Feature fehlgeschlagen: ${response.statusText}`,
      );
    }

    const geoJson = await response.json();

    // Lese Features mit ol/format/GeoJSON
    const features = this.geojsonFormat.readFeatures(geoJson, {
      dataProjection: "EPSG:4326",
      featureProjection: this.state.projection,
    });

    if (features.length === 0) return null;

    // Extrahiere 'alt_name' aus den rohen Properties
    const rawProps = geoJson.features[0]?.properties;
    const altName = rawProps?.alt_name;

    if (!altName) {
      console.error("Parent feature properties:", rawProps);
      throw new Error(
        `Haupt-Feature '${this.state.name}' hat kein 'alt_name' Attribut. Filterung der Gräber nicht möglich.`,
      );
    }

    return { feature: features[0], altName };
  }

  /**
   * Lädt die Child-Features (Grabflure)
   */
  private async fetchChildFeatures(): Promise<Feature<Geometry>[]> {
    const namePattern = `${this.state.name}-%`;
    const cqlFilter = `osm_admin_level=10 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name LIKE '${namePattern}'`;

    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const response = await this.wfsClient.fetchWithAuth(wfsUrl);
    if (!response.ok) {
      throw new Error(
        `WFS-Anfrage für Child-Features fehlgeschlagen: ${response.statusText}`,
      );
    }

    const geoJson = await response.json();

    // Wichtig: Original-Properties (name) für Hover/Label setzen
    const features = this.geojsonFormat.readFeatures(geoJson, {
      dataProjection: "EPSG:4326",
      featureProjection: this.state.projection,
    });

    (geoJson.features || []).forEach((rawFeature: any, index: number) => {
      if (features[index]) {
        features[index].set("name", rawFeature.properties?.name || "Unbenannt");
      }
    });

    return features;
  }

  /**
   * Lädt alle Gräber für den Friedhof basierend auf alt_name
   */
  private async fetchGraeberFeatures(
    friedhofAltName: string,
  ): Promise<Feature<Geometry>[]> {
    // Verwende den 'alt_name' (z.B. "30 - Friedhof Rheinkassel") für die Query
    const cqlFilter = `fried_name = '${friedhofAltName}'`;

    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_graeber", {
      CQL_FILTER: cqlFilter,
    });

    console.log(`[DataManager] Fetching graves with CQL: ${cqlFilter}`);

    const response = await this.wfsClient.fetchWithAuth(wfsUrl);
    if (!response.ok) {
      console.error(
        `WFS-Anfrage für Gräber fehlgeschlagen: ${response.statusText}`,
      );
      return [];
    }

    const geoJson = await response.json();
    const features = this.geojsonFormat.readFeatures(geoJson, {
      dataProjection: "EPSG:4326",
      featureProjection: this.state.projection,
    });

    // WICHTIG: Setze die Attribute, die wir zum Filtern brauchen
    (geoJson.features || []).forEach((rawFeature: any, index: number) => {
      if (features[index]) {
        features[index].set("name", rawFeature.properties?.name || "Grab");

        // KORREKTUR: Korrekte Attribute für Link & Label setzen
        features[index].set(
          "grabflur", // Das ist der Link zur Grabflur
          rawFeature.properties?.grabflur || null,
        );
        features[index].set(
          "grabnummer", // Das ist das Label
          rawFeature.properties?.grabnummer || null,
        );
      }
    });

    console.log(
      `[DataManager] ${features.length} Gräber geladen für Friedhof: ${friedhofAltName}`,
    );
    return features;
  }

  /**
   * TODO: Implementiere Speicher-Logik (z.B. uMap/OSM-Export)
   * Baut GeoJSON aus den modifizierten Features und übergibt sie.
   */
  async saveChanges(featuresToUpdate: Feature<Geometry>[]) {
    console.log("Speichern von Änderungen...");

    // 1. Transformiere Geometrien zurück nach EPSG:4326
    const format = new GeoJSON();

    if (featuresToUpdate.length > 0) {
      const updatedGeoJSON = format.writeFeatures(featuresToUpdate, {
        dataProjection: "EPSG:4326",
        featureProjection: this.state.projection,
      });

      // 2. TODO: Logik für uMap-API oder OSM-Export implementieren
      // (WFS-T wird hier NICHT verwendet)

      console.log("Features zum Aktualisieren:", updatedGeoJSON);

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
