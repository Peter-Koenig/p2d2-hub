// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// Development Startup Script - Auto-starts file watcher with Astro dev server
import { KommuneWatcher } from "./kommune-watcher.mjs";

async function startDevEnvironment() {
  console.log(
    "[dev-startup] Starting development environment with file watching...",
  );

  // Wait for Astro server to fully start
  console.log("[dev-startup] Waiting for Astro server to initialize (3s)...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Start file watcher with verbose logging
  const watcher = new KommuneWatcher({
    verbose: true,
    debounceMs: 2000,
  });

  watcher.start();

  console.log(
    "[dev-startup] Development environment ready with automatic file watching",
  );
  console.log("[dev-startup] Monitoring src/content/kommunen/ for changes");
  console.log(
    "[dev-startup] Use Ctrl+C to stop both Astro server and file watcher",
  );
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[dev-startup] Shutting down development environment...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[dev-startup] Terminating development environment...");
  process.exit(0);
});

// Start if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDevEnvironment().catch((error) => {
    console.error(
      "[dev-startup] Failed to start development environment:",
      error,
    );
    process.exit(1);
  });
}

export { startDevEnvironment };
