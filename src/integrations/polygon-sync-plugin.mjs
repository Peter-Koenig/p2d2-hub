// src/integrations/polygon-sync-plugin.mjs
/**
 * AstroJS Integration Plugin for automatic polygon synchronization
 * Watches markdown files in the kommunen directory and triggers WFS-T sync
 */
export function polygonSyncPlugin(options = {}) {
  const {
    watchDir = "src/content/kommunen",
    autoSync = true,
    followSymlinks = true,
    debounceMs = 2000,
    debug = false,
  } = options;

  let watcherService = null;

  return {
    name: "polygon-sync-plugin",
    hooks: {
      // Start watching in development mode
      "astro:server:start": async ({ logger }) => {
        if (!autoSync) {
          logger.info("[polygon-sync-plugin] Auto sync disabled");
          return;
        }

        try {
          // Dynamically import TypeScript modules at runtime
          const { KommuneWatcher } = await import(
            "../scripts/kommune-watcher.mjs"
          );

          watcherService = new KommuneWatcher({
            debounceMs,
            verbose: debug,
          });

          await watcherService.start();
          logger.info(
            `[polygon-sync-plugin] Polygon sync plugin: Watching ${watchDir} for changes`,
          );
        } catch (error) {
          logger.error(
            `[polygon-sync-plugin] Failed to start - ${error.message}`,
          );
        }
      },

      // Trigger sync on build completion in production
      "astro:build:done": async ({ logger }) => {
        if (!autoSync) return;

        try {
          // In production, we might want to sync all kommunen on build
          // For now, just log that build completed
          logger.info(
            "[polygon-sync-plugin] Build completed - manual sync may be required",
          );
        } catch (error) {
          logger.error(
            `[polygon-sync-plugin] Build sync error - ${error.message}`,
          );
        }
      },

      // Cleanup on server shutdown
      "astro:server:done": async ({ logger }) => {
        if (watcherService) {
          try {
            await watcherService.stop();
            logger.info("[polygon-sync-plugin] Stopped watching");
          } catch (error) {
            logger.error(
              `[polygon-sync-plugin] Error during cleanup - ${error.message}`,
            );
          } finally {
            watcherService = null;
          }
        }
      },
    },
  };
}
