import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { WFSAuthClient } from "@/utils/wfs-auth";
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";
import { transformExtent } from "ol/proj"; // <-- NEU IMPORTIEREN

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
   * Lädt das Parent-Feature (Friedhof) und Child-Features (Grabflure).
   * Gräber werden nicht mehr zentral geladen, sondern on-demand per BBOX.
   */
  async loadInitialFeatures() {
    // 1. Lade Parent-Feature (Friedhof)
    const parentFeature = await this.fetchParentFeature(); // <-- Gibt nur Feature zurück
    if (!parentFeature) {
      throw new Error(`Haupt-Feature '${this.state.name}' nicht gefunden.`);
    }

    // 2. Lade Child-Features (Grabflure)
    const childFeatures = await this.fetchChildFeatures();

    // 3. Gräber (L12) NICHT MEHR LADEN
    // const graeberFeatures = await this.fetchGraeberFeatures(altName); // <-- ENTFERNT

    // 4. Features im State speichern (Signatur geändert)
    this.state.setFeatures(parentFeature, childFeatures);

    // 5. LayerManager anweisen (Signatur geändert)
    this.layerManager.createFeatureLayers(parentFeature, childFeatures);
  }

  /**
   * Lädt das Parent-Feature (Friedhof)
   */
  private async fetchParentFeature(): Promise<Feature<Geometry> | null> {
    const cqlFilter = `osm_admin_level=8 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name='${this.state.name}'`;

    // 'propertyName' wird entfernt, da 'alt_name' nicht mehr benötigt wird
    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
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

    // 'altName' Extraktion entfernt

    return features[0];
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

  // ENTFERNT: fetchGraeberFeatures (die "alle laden"-Methode)

  // NEU: Lädt Gräber bei Bedarf per BBOX-Filter (On-Demand)
  async loadGraeberForExtent(extent: number[]) {
    const graeberSource = this.layerManager.getGraeberSource();
    if (!graeberSource) {
      console.error("Gräber-Source nicht im LayerManager gefunden.");
      return;
    }

    // 1. Erstelle BBOX-Query
    // WFS 2.0.0 BBOX-Filter erwartet [minx,miny,maxx,maxy,crs]
    const currentProjection = this.state.projection;
    const wgs84Extent = transformExtent(extent, currentProjection, "EPSG:4326");

    const wfsUrl = this.wfsClient.buildAuthorizedWFSURL("p2d2_graeber", {
      bbox: `${wgs84Extent.join(",")},EPSG:4326`,
    });

    console.log(`[DataManager] Lade Gräber für BBOX: ${wgs84Extent.join(",")}`);

    try {
      const response = await this.wfsClient.fetchWithAuth(wfsUrl);
      if (!response.ok) {
        throw new Error(
          `WFS-Anfrage für Gräber (BBOX) fehlgeschlagen: ${response.statusText}`,
        );
      }

      const geoJson = await response.json();
      const newFeatures = this.geojsonFormat.readFeatures(geoJson, {
        dataProjection: "EPSG:4326",
        featureProjection: currentProjection,
      });

      // 2. Attribute übertragen und EINDEUTIGE ID setzen (wichtig für Deduplizierung)
      (geoJson.features || []).forEach((rawFeature: any, index: number) => {
        if (newFeatures[index]) {
          const props = rawFeature.properties;
          newFeatures[index].set("grabflur", props?.grabflur || null);
          newFeatures[index].set("grabnummer", props?.grabnummer || null);

          // KORREKTUR: Eindeutige ID aus 'id'-Attribut (z.B. 162368) setzen.
          const id = props?.id; // <-- KORREKTUR
          if (id !== undefined) {
            // Prüfe auf undefined, da ID '0' sein könnte
            newFeatures[index].setId(id);
          } else {
            console.warn(
              "Grab-Feature ohne 'id'-Attribut als ID gefunden.",
              props,
            );
          }
        }
      });

      // 3. Deduplizierung (nur Features hinzufügen, die noch nicht in der Source sind)
      let addedCount = 0;
      newFeatures.forEach((feature) => {
        const id = feature.getId();
        if (id && !graeberSource.getFeatureById(id)) {
          graeberSource.addFeature(feature);
          addedCount++;
        }
      });

      console.log(
        `[DataManager] ${addedCount} neue Gräber zur Source hinzugefügt.`,
      );
    } catch (error) {
      console.error("[DataManager] Fehler bei loadGraeberForExtent:", error);
    }
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
