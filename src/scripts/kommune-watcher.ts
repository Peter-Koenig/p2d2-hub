// Kommune File Watcher - Monitors src/content/kommunen/ for changes
import chokidar from 'chokidar';
import { adminPolygonSync } from '../utils/admin-polygon-sync';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WatchOptions {
  debounceMs?: number;
  verbose?: boolean;
  dryRun?: boolean;
  patterns?: string[];
}

export class KommuneWatcher {
  private defaultOptions: Required<WatchOptions> = {
    debounceMs: 2000,
    verbose: false,
    dryRun: false,
    patterns: ['**/*.md']
  };

  private watcher: chokidar.FSWatcher | null = null;
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private options: WatchOptions = {}) {}

  /**
   * Start watching for kommune file changes
   */
  start(): void {
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const contentDir = path.join(__dirname, '../../content/kommunen');

    console.log(`[kommune-watcher] Starting file watcher for: ${contentDir}`);
    console.log(`[kommune-watcher] Patterns: ${mergedOptions.patterns.join(', ')}`);
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
        pollInterval: 50
      }
    });

    this.setupEventHandlers();
  }

  /**
   * Setup file system event handlers
   */
  private setupEventHandlers(): void {
    if (!this.watcher) return;

    const mergedOptions = { ...this.defaultOptions, ...this.options };

    this.watcher
      .on('add', (filePath: string) => this.handleFileEvent('add', filePath))
      .on('change', (filePath: string) => this.handleFileEvent('change', filePath))
      .on('unlink', (filePath: string) => this.handleFileEvent('unlink', filePath))
      .on('error', (error: Error) => {
        console.error(`[kommune-watcher] Error: ${error.message}`);
      })
      .on('ready', () => {
        console.log('[kommune-watcher] File watcher ready and monitoring for changes');
      });
  }

  /**
   * Handle file system events
   */
  private handleFileEvent(eventType: 'add' | 'change' | 'unlink', filePath: string): void {
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const kommuneSlug = this.extractKommuneSlug(filePath);

    if (!kommuneSlug) {
      if (mergedOptions.verbose) {
        console.log(`[kommune-watcher] Ignoring non-kommune file: ${filePath}`);
      }
      return;
    }

    console.log(`[kommune-watcher] ${eventType}: ${kommuneSlug} (${filePath})`);

    // Debug: ContentCollection Status prüfen
    if (mergedOptions.verbose) {
      console.log(`[kommune-watcher] Pending changes: ${Array.from(this.pendingChanges).join(', ')}`);
      console.log(`[kommune-watcher] Debounce timer active: ${!!this.debounceTimer}`);
      console.log(`[kommune-watcher] Currently processing: ${this.isProcessing}`);
    }

    this.pendingChanges.add(kommuneSlug);

    // Debounce to handle multiple rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, mergedOptions.debounceMs);
  }

  /**
   * Process all pending changes
   */
  private async processPendingChanges(): Promise<void> {
    if (this.isProcessing) {
      console.log('[kommune-watcher] Already processing changes, skipping');
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

    console.log(`[kommune-watcher] Processing ${changes.length} pending changes: ${changes.join(', ')}`);

    for (const kommuneSlug of changes) {
      try {
        // Additional wait for ContentCollection refresh
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (mergedOptions.dryRun) {
          console.log(`[kommune-watcher] Dry run: Would sync ${kommuneSlug}`);
          continue;
        }

        console.log(`[kommune-watcher] Starting sync for ${kommuneSlug}`);

        const result = await adminPolygonSync.syncKommunePolygons(kommuneSlug, {
          dryRun: mergedOptions.dryRun,
          verbose: mergedOptions.verbose,
          force: true
        });

        if (result.success) {
          console.log(`[kommune-watcher] ✓ Sync completed for ${kommuneSlug}: ${result.polygonsInserted} polygons inserted`);
        } else {
          console.error(`[kommune-watcher] ✗ Sync failed for ${kommuneSlug}: ${result.error}`);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[kommune-watcher] ✗ Error processing ${kommuneSlug}: ${errorMsg}`);
      }

      // Small delay between processing kommunen
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.isProcessing = false;
    console.log('[kommune-watcher] Finished processing all changes');
  }

  /**
   * Extract kommune slug from file path
   */
  private extractKommuneSlug(filePath: string): string | null {
    // Extract filename without extension
    const filename = path.basename(filePath, path.extname(filePath));

    // Basic validation - should match slug pattern
    if (filename && filename.length > 1 && /^[a-z0-9-]+$/.test(filename)) {
      return filename;
    }

    return null;
  }

  /**
   * Stop watching for changes
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.isProcessing = false;

    console.log('[kommune-watcher] File watcher stopped');
  }

  /**
   * Get current status
   */
  getStatus(): {
    watching: boolean;
    pendingChanges: string[];
    isProcessing: boolean;
  } {
    return {
      watching: this.watcher !== null,
      pendingChanges: Array.from(this.pendingChanges),
      isProcessing: this.isProcessing
    };
  }
}

// CLI interface for manual control
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];

  const watcher = new KommuneWatcher({
    verbose: args.includes('--verbose'),
    dryRun: args.includes('--dry-run'),
    debounceMs: 2000
  });

  switch (command) {
    case 'start':
      console.log('[kommune-watcher] Starting in CLI mode...');
      watcher.start();

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n[kommune-watcher] Shutting down...');
        watcher.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n[kommune-watcher] Terminating...');
        watcher.stop();
        process.exit(0);
      });
      break;

    case 'status':
      console.log('[kommune-watcher] Status:');
      console.log(JSON.stringify(watcher.getStatus(), null, 2));
      process.exit(0);
      break;

    default:
      console.log('Usage:');
      console.log('  npm run kommune-watcher start [--verbose] [--dry-run]');
      console.log('  npm run kommune-watcher status');
      process.exit(1);
  }
}
