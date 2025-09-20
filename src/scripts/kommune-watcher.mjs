// src/scripts/kommune-watcher.mjs
import chokidar from "chokidar";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class KommuneWatcher {
  constructor(options = {}) {
    this.defaultOptions = {
      debounceMs: 2000,
      verbose: false,
      dryRun: false,
      patterns: ["*.md"],
    };
    this.options = { ...this.defaultOptions, ...options };
    this.watcher = null;
    this.pendingChanges = new Set();
    this.debounceTimer = null;
    this.isProcessing = false;
  }

  async start() {
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const contentDir = path.join(__dirname, "../../content/kommunen");

    console.log(`[kommune-watcher] Starting file watcher for: ${contentDir}`);
    console.log(
      `[kommune-watcher] Patterns: ${mergedOptions.patterns.join(", ")}`,
    );
    console.log(`[kommune-watcher] Debounce: ${mergedOptions.debounceMs}ms`);
    console.log(`[kommune-watcher] Dry run: ${mergedOptions.dryRun}`);
    console.log(`[kommune-watcher] Verbose: ${mergedOptions.verbose}`);

    this.watcher = chokidar.watch(mergedOptions.patterns, {
      cwd: contentDir,
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
      interval: 100,
      binaryInterval: 300,
      alwaysStat: false,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    if (!this.watcher) return;

    const mergedOptions = { ...this.defaultOptions, ...this.options };

    this.watcher
      .on("add", (filePath) => this.handleFileEvent("add", filePath))
      .on("change", (filePath) => this.handleFileEvent("change", filePath))
      .on("unlink", (filePath) => this.handleFileEvent("unlink", filePath))
      .on("error", (error) =>
        console.error(`[kommune-watcher] Error: ${error.message}`),
      )
      .on("ready", () =>
        console.log(
          "[kommune-watcher] File watcher ready and monitoring for changes",
        ),
      );
  }

  handleFileEvent(eventType, filePath) {
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const kommuneSlug = this.extractKommuneSlug(filePath);

    if (!kommuneSlug) {
      if (mergedOptions.verbose) {
        console.log(`[kommune-watcher] Ignoring non-kommune file: ${filePath}`);
      }
      return;
    }

    console.log(`[kommune-watcher] ${eventType}: ${kommuneSlug} (${filePath})`);

    this.pendingChanges.add(kommuneSlug);

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, mergedOptions.debounceMs);
  }

  async processPendingChanges() {
    if (this.isProcessing) {
      console.log("[kommune-watcher] Already processing changes, skipping");
      return;
    }

    this.isProcessing = true;
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const changes = Array.from(this.pendingChanges);
    this.pendingChanges.clear();

    if (changes.length === 0) {
      this.isProcessing = false;
      return;
    }

    console.log(
      `[kommune-watcher] Processing ${changes.length} pending changes: ${changes.join(", ")}`,
    );

    for (const kommuneSlug of changes) {
      try {
        // Wait for ContentCollection refresh
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (mergedOptions.dryRun) {
          console.log(`[kommune-watcher] Dry run: Would sync ${kommuneSlug}`);
          continue;
        }

        console.log(`[kommune-watcher] Starting sync for ${kommuneSlug}`);

        // Dynamic import the sync function
        const { syncKommunePolygons } = await import(
          "../utils/polygon-wfst-sync.js"
        );
        const result = await syncKommunePolygons(kommuneSlug);

        if (result.success) {
          console.log(
            `[kommune-watcher] Sync completed for ${kommuneSlug}: ${result.insertedPolygons} polygons inserted`,
          );
        } else {
          console.error(
            `[kommune-watcher] Sync failed for ${kommuneSlug}: ${result.errors.join(", ")}`,
          );
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[kommune-watcher] Error processing ${kommuneSlug}: ${errorMsg}`,
        );
      }

      // Delay between processing
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.isProcessing = false;
    console.log("[kommune-watcher] Finished processing all changes");
  }

  extractKommuneSlug(filePath) {
    const filename = path.basename(filePath, path.extname(filePath));

    // Basic validation
    if (filename && filename.length > 1 && /^[a-z0-9-_.]+$/.test(filename)) {
      return filename;
    }
    return null;
  }

  async stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isProcessing = false;
    console.log("[kommune-watcher] File watcher stopped");
  }

  getStatus() {
    return {
      watching: this.watcher !== null,
      pendingChanges: Array.from(this.pendingChanges),
      isProcessing: this.isProcessing,
    };
  }

  async triggerManualSync(slug) {
    try {
      console.log(`[kommune-watcher] Manual sync triggered for ${slug}`);
      const { syncKommunePolygons } = await import(
        "../utils/polygon-wfst-sync.js"
      );
      const result = await syncKommunePolygons(slug);

      if (result.success) {
        console.log(`[kommune-watcher] Manual sync successful for ${slug}`);
      } else {
        console.error(
          `[kommune-watcher] Manual sync failed for ${slug}: ${result.errors.join(", ")}`,
        );
      }
    } catch (error) {
      console.error(
        `[kommune-watcher] Failed manual sync for ${slug}: ${error.message}`,
      );
    }
  }
}
