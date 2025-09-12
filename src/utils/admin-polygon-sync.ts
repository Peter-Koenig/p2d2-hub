// Admin Polygon Sync Manager - Main synchronization logic
import { writeFile } from "fs/promises";
import { WFSAuthClient } from "./wfs-auth";
import { transformExtentFromWgs84, transformCenterFromWgs84 } from "./crs";

let wfstClient: Awaited<
  ReturnType<typeof WFSAuthClient.createWFSTClient>
> | null = null;

async function getWFSTClient() {
  if (!wfstClient) {
    wfstClient = await WFSAuthClient.createWFSTClient();
  }
  return wfstClient;
}
import { osmDataClient } from "./osm-data-client";
import { wfsTransactionBuilder } from "./wfs-transaction-builder";
import {
  getAllKommunen,
  getKommuneBySlug,
  type KommuneData,
} from "./kommune-utils";
import type {
  SyncOptions,
  SyncResult,
  KommuneSyncStatus,
} from "../types/admin-polygon";

export class AdminPolygonSyncManager {
  private defaultOptions: Required<SyncOptions> = {
    dryRun: false,
    verbose: false,
    force: false,
    delayMs: 1000,
  };
  private options: Required<SyncOptions>;

  constructor(options: SyncOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Main synchronization method for a single kommune
   */
  async syncKommunePolygons(kommuneSlug: string): Promise<SyncResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const result: SyncResult = {
      success: false,
      kommuneSlug,
      adminLevel: 0,
      polygonsFound: 0,
      polygonsInserted: 0,
      durationMs: 0,
    };

    try {
      // Wait for ContentCollection refresh (fix for caching issue)
      if (mergedOptions.verbose) {
        console.log(`[admin-sync] Waiting for ContentCollection refresh...`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, mergedOptions.delayMs),
      );

      const kommune = await getKommuneBySlug(kommuneSlug);

      if (!kommune) {
        const errorMsg = `Kommune '${kommuneSlug}' not found in ContentCollection`;
        console.error(`[admin-sync] ${errorMsg}`);
        const allKommunen = await getAllKommunen();
        console.error(
          `[admin-sync] Available kommunen: ${allKommunen.map((k) => k.slug).join(", ")}`,
        );
        throw new Error(errorMsg);
      }

      if (!kommune.wp_name) {
        throw new Error(`Kommune ${kommuneSlug} missing wp_name property`);
      }

      if (!kommune.osmAdminLevels || kommune.osmAdminLevels.length === 0) {
        console.log(
          `[admin-sync] No admin levels defined for ${kommuneSlug}, skipping`,
        );
        result.success = true;
        return result;
      }

      console.log(
        `[admin-sync] Starting sync for ${kommuneSlug} (${kommune.title})`,
      );
      console.log(
        `[admin-sync] Admin levels: ${kommune.osmAdminLevels.join(", ")}`,
      );
      console.log(`[admin-sync] Wikipedia reference: ${kommune.wp_name}`);

      // Delete existing polygons first if not dry run
      if (!mergedOptions.dryRun && mergedOptions.force) {
        await this.deleteKommunePolygons(kommuneSlug);
      }

      let totalPolygonsFound = 0;
      let totalPolygonsInserted = 0;

      // Process each admin level
      for (const adminLevel of kommune.osmAdminLevels) {
        const levelResult = await this.processAdminLevel(
          kommune,
          adminLevel,
          mergedOptions,
        );
        totalPolygonsFound += levelResult.polygonsFound;
        totalPolygonsInserted += levelResult.polygonsInserted;

        if (!levelResult.success) {
          throw new Error(
            `Failed to process admin level ${adminLevel}: ${levelResult.error}`,
          );
        }
      }

      result.success = true;
      result.polygonsFound = totalPolygonsFound;
      result.polygonsInserted = totalPolygonsInserted;
      result.adminLevel = kommune.osmAdminLevels[0];

      console.log(
        `[admin-sync] ✓ Sync completed for ${kommuneSlug}: ${totalPolygonsFound} found, ${totalPolygonsInserted} inserted`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[admin-sync] ✗ Sync failed for ${kommuneSlug}: ${errorMsg}`,
      );
      result.error = errorMsg;
      result.success = false;
    } finally {
      result.durationMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Process a single admin level for a kommune
   */
  private async processAdminLevel(
    kommune: KommuneData,
    adminLevel: number,
    options: Required<SyncOptions>,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      kommuneSlug: kommune.slug,
      adminLevel,
      polygonsFound: 0,
      polygonsInserted: 0,
      durationMs: 0,
    };

    try {
      // Fetch polygons from OSM
      const geojson = await osmDataClient.fetchAdminPolygons(
        kommune.wp_name,
        adminLevel,
        kommune.osm_refinement,
      );
      result.polygonsFound = geojson.features.length;

      if (geojson.features.length === 0) {
        console.log(
          `[admin-sync] No polygons found for ${kommune.slug}, level ${adminLevel}`,
        );
        result.success = true;
        return result;
      }

      if (options.verbose) {
        console.log(
          `[admin-sync] Found ${geojson.features.length} polygons for level ${adminLevel}`,
        );
      }

      // --- Map-Block ist optional ---------------------------------
      const targetCRS =
        typeof kommune.map?.projection === "string" && kommune.map.projection
          ? kommune.map.projection
          : "EPSG:4326";

      // centre-Logging nur, wenn map existiert
      if (kommune.map?.center) {
        console.log(`[admin-sync] centre ${kommune.map.center.join(", ")}`);
      }

      // Empty placeholder, verhindert spätere undefined-Zugriffe
      const safeMap = kommune.map ?? { projection: targetCRS, center: [0, 0] };
      let transformedGeoJSON = geojson;

      if (targetCRS !== "EPSG:4326") {
        if (options.verbose) {
          console.log(
            `[admin-sync] Transforming coordinates from WGS84 to ${targetCRS}`,
          );
        }

        // --- NEW: wer greift hier noch auf map zu? -----------------
        console.log(
          "[debug] about to call transformPolygons – typeof kommune.map:",
          typeof kommune.map,
        );
        console.log(
          "[debug] transformPolygons expects 3 params, we pass:",
          "geojson=",
          !!geojson,
          "targetCRS=",
          targetCRS,
          "kommune.slug=",
          kommune.slug,
        );
        const transformationResult = await this.transformPolygons(
          geojson,
          targetCRS,
          kommune, // fehlender Parameter nachreichen
        );
        transformedGeoJSON = transformationResult ?? geojson;
      }

      // Sicherstellen, dass transformedGeoJSON immer gültige features hat
      const safeFeatures = transformedGeoJSON?.features ?? [];
      result.polygonsFound = safeFeatures.length;
      result.polygonsInserted = options.dryRun ? 0 : safeFeatures.length;

      // Insert via WFS-T
      if (!options.dryRun) {
        await this.insertPolygonsViaWFST(
          transformedGeoJSON,
          kommune.slug,
          adminLevel,
        );
      } else {
        // Dry run: Dump polygons to EWKT file for inspection
        const ewktFile = `tmp/${kommune.slug}_L${adminLevel}.ewkt`;
        const ewkts = transformedGeoJSON.features
          .map((f) => `SRID=4326;${JSON.stringify(f.geometry)}`)
          .join("\n");

        await writeFile(ewktFile, ewkts, { flag: "a" });
        console.log(
          `[admin-sync] Dry run - ${transformedGeoJSON.features.length} polygons dumped to ${ewktFile}`,
        );
        result.polygonsInserted = 0;
      }

      result.success = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[admin-sync] Failed to process admin level ${adminLevel} for ${kommune.slug}: ${errorMsg}`,
      );
      result.error = errorMsg;
    }

    return result;
  }

  /**
   * Transform polygons from WGS84 to target CRS
   */
  private transformPolygons(
    geojson: GeoJSON.FeatureCollection,
    targetCRS: string,
    kommune: KommuneData,
  ): Promise<GeoJSON.FeatureCollection> {
    console.log(
      `[admin-sync] Coordinate transformation to ${targetCRS} would be performed here`,
    );

    // Debug-Ausgabe der Kartenmitte (nur wenn vorhanden)
    if (kommune.map?.center) {
      console.log(`[admin-sync] centre ${kommune.map.center.join(", ")}`);
    } else if (process.env.DEBUG) {
      console.log("[admin-sync] centre n/a (no map.center provided)");
    }

    // Die ursprüngliche Rückgabe des unveränderten GeoJSON
    // sollte beibehalten werden, bis echte Transformation implementiert ist
    // For now, we'll return the original GeoJSON since coordinate transformation
    // should be handled by the WFS server or database layer
    // This ensures the caller always receives a valid FeatureCollection
    return Promise.resolve(geojson);
  }

  /**
   * Insert polygons via WFS-T transaction
   */
  private async insertPolygonsViaWFST(
    geojson: GeoJSON.FeatureCollection,
    kommuneSlug: string,
    adminLevel: number,
  ): Promise<void> {
    const transactionXml = wfsTransactionBuilder.buildInsertTransaction(
      geojson.features,
      kommuneSlug,
      adminLevel,
    );

    if (process.env.DEBUG) {
      console.log(`[admin-sync] WFS-T Transaction XML:\n${transactionXml}`);
    }

    console.log(
      `[admin-sync] Executing WFS-T transaction for ${kommuneSlug}, level ${adminLevel}`,
    );

    try {
      const client = await getWFSTClient();
      const response = await client.executeWFSTransaction(transactionXml);

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `WFS-T transaction failed: ${response.status} ${response.statusText}\n${responseText}`,
        );
      }

      console.log(
        `[admin-sync] ✓ WFS-T transaction successful for ${kommuneSlug}`,
      );
    } catch (error) {
      console.error(
        `[admin-sync] ✗ WFS-T transaction failed for ${kommuneSlug}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete all polygons for a kommune
   */
  async deleteKommunePolygons(kommuneSlug: string): Promise<void> {
    try {
      const transactionXml =
        wfsTransactionBuilder.buildDeleteTransaction(kommuneSlug);

      if (process.env.DEBUG) {
        console.log(
          `[admin-sync] WFS-T Delete Transaction XML:\n${transactionXml}`,
        );
      }

      console.log(`[admin-sync] Deleting existing polygons for ${kommuneSlug}`);

      const client = await getWFSTClient();
      const response = await client.executeWFSTransaction(transactionXml);

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `WFS-T delete failed: ${response.status} ${response.statusText}\n${responseText}`,
        );
      }

      console.log(`[admin-sync] ✓ Deleted polygons for ${kommuneSlug}`);
    } catch (error) {
      console.error(
        `[admin-sync] ✗ Failed to delete polygons for ${kommuneSlug}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get sync status for all kommunen
   */
  async getSyncStatus(): Promise<KommuneSyncStatus[]> {
    const kommunen = await getAllKommunen();
    const statuses: KommuneSyncStatus[] = [];

    for (const kommune of kommunen) {
      statuses.push({
        slug: kommune.slug,
        title: kommune.title,
        hasOSMData: !!kommune.wp_name,
        adminLevels: kommune.osmAdminLevels || [],
        polygonCount: 0, // Would require database query to get actual count
        status: "not_found",
      });
    }

    return statuses;
  }

  /**
   * Sync all kommunen
   */
  async syncAllKommunen(): Promise<SyncResult[]> {
    const kommunen = await getAllKommunen();
    const results: SyncResult[] = [];

    for (const kommune of kommunen) {
      if (
        kommune.wp_name &&
        kommune.osmAdminLevels &&
        kommune.osmAdminLevels.length > 0
      ) {
        const result = await this.syncKommunePolygons(kommune.slug);
        results.push(result);

        // Add delay between kommunen to avoid rate limiting
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.delayMs || 2000),
        );
      }
    }

    return results;
  }
}

// Default singleton instance
export const adminPolygonSync = new AdminPolygonSyncManager();
