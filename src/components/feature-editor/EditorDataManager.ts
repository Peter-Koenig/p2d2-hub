// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { WFSAuthClient } from "@/utils/wfs-auth";
import type { EditorState } from "./EditorState";
import type { EditorLayerManager } from "./EditorLayerManager";
import { transformExtent } from "ol/proj";

/**
 * Verwaltet das Laden von Features (WFS) und das Speichern (uMap/OSM-Export).
 */
export class EditorDataManager {
  private state: EditorState;
  private layerManager: EditorLayerManager;
  private wfsClient: WFSAuthClient;
  private geojsonFormat: GeoJSON;

  // HINZUFÜGEN: WFS-Request-Cache für bereits geladene Grabfluren
  private loadedGrabflurIDs: Set<string | number> = new Set();
  // NEU: Präfix für Grabflur-Namen aus admin_name des Parent-Features
  private grabflurPrefix: string | null = null;

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
    console.log("[DataManager] Lade Features sequenziell...");

    // ÄNDERUNG: Von parallel auf sequenziell umgestellt
    const parentFeature = await this.fetchParentFeature();
    if (!parentFeature) {
      throw new Error(`Haupt-Feature '${this.state.name}' nicht gefunden.`);
    }
    const childFeatures = await this.fetchChildFeatures();

    // 3. Gräber (L12) NICHT MEHR LADEN
    // const graeberFeatures = await this.fetchGraeberFeatures(altName); // <-- ENTFERNT

    // 4. Features im State speichern (Signatur geändert)
    this.state.setFeatures(parentFeature, childFeatures);

    // 5. LayerManager anweisen (Signatur geändert)
    this.layerManager.createFeatureLayers(parentFeature, childFeatures);

    // 6. Friedhofsplan-Layer Extent setzen
    const parentGeometry = parentFeature.getGeometry();
    if (parentGeometry) {
      this.layerManager.setFriedhofsplanExtent(parentGeometry.getExtent());
    }
  }

  /**
   * Lädt das Parent-Feature (Friedhof)
   */
  private async fetchParentFeature(): Promise<Feature<Geometry> | null> {
    const cqlFilter = `osm_admin_level=8 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name='${this.state.name}'`;

    // 'propertyName' wird entfernt, da 'alt_name' nicht mehr benötigt wird
    const wfsUrl = this.wfsClient.buildWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const response = await this.wfsClient.fetchWFS(wfsUrl);
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

    // NEU: admin_name aus GeoJSON-Properties lesen und speichern
    const rawAdminName = geoJson.features?.[0]?.properties?.admin_name;
    this.grabflurPrefix = rawAdminName ?? null;

    // 'altName' Extraktion entfernt

    return features[0];
  }

  /**
   * Lädt die Child-Features (Grabflure)
   */
  private async fetchChildFeatures(): Promise<Feature<Geometry>[]> {
    // ÄNDERUNG: Verwende grabflurPrefix (admin_name) oder fallback auf state.name
    const prefix = this.grabflurPrefix ?? this.state.name;
    const namePattern = `${prefix}-%`;
    const cqlFilter = `osm_admin_level=10 AND wp_name='${this.state.wpName}' AND container_type='${this.state.containerType}' AND name LIKE '${namePattern}'`;

    const wfsUrl = this.wfsClient.buildWFSURL("p2d2_containers", {
      CQL_FILTER: cqlFilter,
    });

    const response = await this.wfsClient.fetchWFS(wfsUrl);
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
  // ERSETZEN: Signatur von loadGraeberForExtent (benötigt jetzt das Feature für die ID)
  async loadGraeberForExtent(grabflurFeature: Feature<Geometry>) {
    const graeberSource = this.layerManager.getGraeberSource();
    if (!graeberSource) {
      console.error("Gräber-Source nicht im LayerManager gefunden.");
      return;
    }

    // HINZUFÜGEN: Cache-Prüfung
    const grabflurId = grabflurFeature.getId();
    if (grabflurId === undefined) {
      console.error("Grabflur-Feature hat keine ID. Caching nicht möglich.");
      // (Trotzdem laden, aber nicht cachen)
    } else if (this.loadedGrabflurIDs.has(grabflurId)) {
      console.log(
        `[DataManager] ✓ Gräber für Flur ${grabflurId} bereits geladen (Cache).`,
      );
      return;
    }

    // ANPASSEN: extent aus dem Feature holen (statt als Parameter zu übergeben)
    const geometry = grabflurFeature.getGeometry();
    if (!geometry) return;
    const extent = geometry.getExtent();

    // 1. Erstelle BBOX-Query
    // WFS 2.0.0 BBOX-Filter erwartet [minx,miny,maxx,maxy,crs]
    const currentProjection = this.state.projection;
    const wgs84Extent = transformExtent(extent, currentProjection, "EPSG:4326");

    const wfsUrl = this.wfsClient.buildWFSURL("p2d2_graeber", {
      bbox: `${wgs84Extent.join(",")},EPSG:4326`,
    });

    console.log(`[DataManager] Lade Gräber für BBOX: ${wgs84Extent.join(",")}`);

    try {
      const response = await this.wfsClient.fetchWFS(wfsUrl);
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
          console.log(
            "%c[DEBUG DataManager] Grab hinzugefügt:",
            "color: teal; font-weight: bold;",
            {
              id: feature.getId(),
              grabflur: feature.get("grabflur"),
              grabnummer: feature.get("grabnummer"),
            },
          );
          addedCount++;
        }
      });

      // HINZUFÜGEN: Nach Erfolg im Cache speichern
      if (grabflurId !== undefined) {
        this.loadedGrabflurIDs.add(grabflurId);
      }

      console.log(
        `[DataManager] ${addedCount} neue Gräber zur Source hinzugefügt.`,
      );
    } catch (error) {
      console.error("[DataManager] Fehler bei loadGraeberForExtent:", error);
    }
  }

  /**
   * Speichert geänderte Features für uMap als öffentliche GeoJSON-Datei.
   */
  async saveChanges(featuresToUpdate: Feature<Geometry>[]) {
    console.log("Speichern von Änderungen für uMap (Pre-Alpha)...");

    const format = new GeoJSON();

    if (featuresToUpdate.length === 0) {
      alert("Es gibt keine Änderungen zum Speichern.");
      return;
    }

    // 1. Transformiere Geometrien zurück nach EPSG:4326 (WGS84)
    // Diese Funktion exportiert standardmäßig ALLE Attribute (Properties).
    const geoJsonString = format.writeFeatures(featuresToUpdate, {
      dataProjection: "EPSG:4326",
      featureProjection: this.state.projection,
    });

    try {
      // 2. Sende den GeoJSON-String an den neuen API-Endpunkt
      const response = await fetch("/api/save-for-umap", {
        method: "POST",
        headers: {
          // KORREKTUR 2: Korrekter Header für einen GeoJSON-String
          "Content-Type": "application/geo+json",
        },
        body: geoJsonString,
      });

      if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult.error || "Server-Antwort war nicht OK");
      }

      const result = await response.json();
      console.log("Speichern erfolgreich:", result.message);

      alert(
        `Speichern (Pre-Alpha) erfolgreich!\n\nDie Daten sind jetzt unter ${result.path} verfügbar und werden von uMap in Kürze geladen.`,
      );
    } catch (error) {
      console.error("Fehler beim Senden der Daten an den API-Endpunkt:", error);
      alert(`Fehler beim Speichern der Daten: ${(error as Error).message}`);
    }
  }
}
