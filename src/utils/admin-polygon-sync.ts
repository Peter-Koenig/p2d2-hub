import { syncKommunePolygons } from "./polygon-wfst-sync";
import { WFSAuthClient } from "./wfs-auth";
import { getAllKommunen as getAllKommunenFromFS } from "./kommune-utils";

interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
  delayMs?: number;
}

interface SyncResult {
  success: boolean;
  polygonsFound: number;
  polygonsInserted: number;
  durationMs: number;
  error?: string;
}

export interface SyncAllResult {
  success: boolean;
  kommuneSlug: string;
  polygonsFound: number;
  polygonsInserted: number;
  error?: string;
}

export interface SyncStatus {
  slug: string;
  title: string;
  adminLevels: number[];
  hasOSMData: boolean;
}

export class AdminPolygonSyncManager {
  private options: SyncOptions;
  private wfstConfig: {
    endpoint: string;
    username?: string;
    password?: string;
    namespace?: string;
    workspace?: string;
  };

  constructor(options: SyncOptions = {}) {
    this.options = {
      dryRun: false,
      verbose: false,
      force: false,
      delayMs: 1000,
      ...options,
    };

    // WFS-T configuration from environment variables
    this.wfstConfig = {
      endpoint: process.env.WFST_ENDPOINT || "",
      workspace: process.env.WFST_WORKSPACE || "Verwaltungsdaten",
      namespace: process.env.WFST_NAMESPACE || "urn:data-dna:govdata",
      username: process.env.WFST_USERNAME,
      password: process.env.WFST_PASSWORD,
    };

    if (this.options.verbose) {
      console.log("[AdminPolygonSyncManager] Configuration:", {
        endpoint: this.wfstConfig.endpoint ? "SET" : "MISSING",
        hasUsername: !!this.wfstConfig.username,
        hasPassword: !!this.wfstConfig.password,
        dryRun: this.options.dryRun,
      });
    }
  }

  /**
   * Synchronize polygons for all kommunen
   */
  async syncAllKommunen(): Promise<SyncAllResult[]> {
    const kommunen = await getAllKommunenFromFS();
    const results: SyncAllResult[] = [];

    for (const kommune of kommunen) {
      try {
        if (this.options.delayMs && results.length > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.options.delayMs),
          );
        }

        const result = await this.syncKommunePolygons(kommune.slug);
        results.push({
          success: result.success,
          kommuneSlug: kommune.slug,
          polygonsFound: result.polygonsFound,
          polygonsInserted: result.polygonsInserted,
          error: result.error,
        });
      } catch (error) {
        results.push({
          success: false,
          kommuneSlug: kommune.slug,
          polygonsFound: 0,
          polygonsInserted: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /**
   * Synchronize polygons for a specific kommune
   */
  async syncKommunePolygons(slug: string): Promise<SyncResult> {
    const startTime = Date.now();

    if (this.options.verbose) {
      console.log(`[AdminPolygonSyncManager] Starting sync for ${slug}`);
    }

    try {
      if (this.options.dryRun) {
        if (this.options.verbose) {
          console.log(`[AdminPolygonSyncManager] Dry run - would sync ${slug}`);
        }
        return {
          success: true,
          polygonsFound: 0,
          polygonsInserted: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Check if we have WFS-T configuration
      if (!this.wfstConfig.endpoint) {
        throw new Error("WFST_ENDPOINT environment variable is not set");
      }

      // Use the sync function from polygon-wfst-sync
      const result = await syncKommunePolygons(
        slug,
        ["admin_boundary"],
        this.wfstConfig,
      );

      const durationMs = Date.now() - startTime;

      if (this.options.verbose) {
        console.log(
          `[AdminPolygonSyncManager] Sync completed for ${slug} in ${durationMs}ms`,
        );
        console.log(
          `  Processed levels: ${result.processedLevels.join(", ") || "none"}`,
        );
        console.log(`  Inserted polygons: ${result.insertedPolygons}`);
        console.log(
          `  Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "none"}`,
        );
      }

      return {
        success: result.success,
        polygonsFound: result.processedLevels.length,
        polygonsInserted: result.insertedPolygons,
        durationMs,
        error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (this.options.verbose) {
        console.error(
          `[AdminPolygonSyncManager] Sync failed for ${slug}:`,
          error,
        );
      }

      return {
        success: false,
        polygonsFound: 0,
        polygonsInserted: 0,
        durationMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete polygons for a specific kommune
   */
  async deleteKommunePolygons(slug: string): Promise<void> {
    if (this.options.verbose) {
      console.log(`[AdminPolygonSyncManager] Deleting polygons for ${slug}`);
    }

    if (this.options.dryRun) {
      if (this.options.verbose) {
        console.log(
          `[AdminPolygonSyncManager] Dry run - would delete polygons for ${slug}`,
        );
      }
      return;
    }

    // Check if we have WFS-T configuration
    if (!this.wfstConfig.endpoint) {
      throw new Error("WFST_ENDPOINT environment variable is not set");
    }

    // Create WFS-T client
    const wfsClient = WFSAuthClient.createWFSTClient(this.wfstConfig);

    // TODO: Implement actual deletion logic
    // For now, just log that deletion would happen
    console.warn(
      `[AdminPolygonSyncManager] Delete operation not yet implemented for ${slug}`,
    );

    // Note: Actual deletion would require building WFS-T Delete transactions
    // based on the existing features in the WFS-T endpoint
  }

  /**
   * Get sync status for all kommunen
   */
  async getSyncStatus(): Promise<SyncStatus[]> {
    const kommunen = await getAllKommunenFromFS();
    const statuses: SyncStatus[] = [];

    for (const kommune of kommunen) {
      statuses.push({
        slug: kommune.slug,
        title: kommune.title || kommune.slug,
        adminLevels: kommune.osmAdminLevels || [],
        hasOSMData: !!(
          kommune.osmAdminLevels && kommune.osmAdminLevels.length > 0
        ),
      });
    }

    return statuses;
  }
}
