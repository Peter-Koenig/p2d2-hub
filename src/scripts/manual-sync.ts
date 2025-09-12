import { loadEnvironment } from "../utils/env-config";
// Manual Sync CLI Script - Command line interface for admin polygon synchronization

// Load environment at startup - will be called in main()

// Set NODE_ENV to development for proper credential selection
process.env.NODE_ENV = process.env.NODE_ENV || "development";

// Load environment variables from .env files using native Node.js
import fs from "fs";
import path from "path";

function loadEnvFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      content.split("\n").forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || "";

          // Remove quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }

          process.env[key] = value;
        }
      });
      console.log(
        `[manual-sync] Loaded environment from ${path.basename(filePath)}`,
      );
      return true;
    }
  } catch (error) {
    console.warn(`[manual-sync] Failed to load ${filePath}:`, error.message);
  }
  return false;
}

// Load .env.development first, then .env as fallback
const envLoaded =
  loadEnvFile(path.resolve(process.cwd(), ".env.development")) ||
  loadEnvFile(path.resolve(process.cwd(), ".env"));

// Debug environment variables
console.log("[manual-sync] Environment check:");
console.log(
  "WFST_USERNAME:",
  process.env.WFST_USERNAME ? "SET" : "MISSING (using read-only fallback)",
);
console.log(
  "WFST_PASSWORD:",
  process.env.WFST_PASSWORD ? "SET" : "MISSING (using read-only fallback)",
);
console.log("NODE_ENV:", process.env.NODE_ENV || "not set");

// Check if we're running in dev mode and suggest loading .env file
if (!process.env.WFST_USERNAME || !process.env.WFST_PASSWORD) {
  console.log(
    "[manual-sync] Note: Using read-only credentials - WFS-T operations may fail",
  );
  console.log(
    "To enable write operations, set WFST_USERNAME and WFST_PASSWORD in .env.development",
  );
}

// Top-level error handling für CLI-Skript
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Parameter Validation
if (process.argv.length < 3) {
  console.error("Usage: npm run sync:manual <kommune-slug> [dry-run]");
  process.exit(1);
}
import { AdminPolygonSyncManager } from "../utils/admin-polygon-sync";
import { KommuneWatcher } from "./kommune-watcher";
import { getAllKommunen, getKommuneBySlug } from "../utils/kommune-utils";

interface CLIArgs {
  command: string;
  kommuneSlug?: string;
  verbose: boolean;
  dryRun: boolean;
  force: boolean;
  delayMs: number;
  all: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const command = args[0];
  const kommuneSlug =
    args[1] !== "--verbose" &&
    args[1] !== "--dry-run" &&
    args[1] !== "--force" &&
    args[1] !== "--all"
      ? args[1]
      : undefined;

  return {
    command,
    kommuneSlug,
    verbose: args.includes("--verbose"),
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    delayMs: args.includes("--delay")
      ? parseInt(args[args.indexOf("--delay") + 1]) || 1000
      : 1000,
    all: args.includes("--all"),
  };
}

function printUsage(): void {
  console.log(`
Manual Admin Polygon Sync - CLI Interface

Usage:
  npm run manual-sync <command> [kommune-slug] [options]

Commands:
  sync <slug>      Sync polygons for a specific kommune
  delete <slug>    Delete polygons for a specific kommune
  status [slug]    Get sync status for kommunen
  list             List all available kommunen
  watch            Start file watcher for automatic sync
  help             Show this help message

Options:
  --verbose        Enable verbose logging
  --dry-run        Simulate operations without making changes
  --force          Force operations (skip confirmation, delete before sync)
  --delay <ms>     Delay between operations in milliseconds (default: 1000)
  --all            Apply to all kommunen (for sync/delete commands)

Examples:
  npm run manual-sync sync bonn --verbose
  npm run manual-sync delete berlin --force
  npm run manual-sync status
  npm run manual-sync sync --all --dry-run
  npm run manual-sync watch --verbose
`);
}

async function handleSyncCommand(args: CLIArgs): Promise<void> {
  const syncManager = new AdminPolygonSyncManager({
    dryRun: args.dryRun,
    verbose: args.verbose,
    force: args.force,
    delayMs: args.delayMs,
  });

  if (args.all) {
    console.log(
      `[manual-sync] Syncing all kommunen${args.dryRun ? " (dry run)" : ""}`,
    );
    const results = await syncManager.syncAllKommunen();

    console.log("\n[manual-sync] Sync Summary:");
    results.forEach((result) => {
      const status = result.success ? "✓" : "✗";
      console.log(
        `  ${status} ${result.kommuneSlug}: ${result.polygonsFound} found, ${result.polygonsInserted} inserted${result.error ? ` - ERROR: ${result.error}` : ""}`,
      );
    });

    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;
    console.log(
      `\n[manual-sync] Completed: ${successCount}/${totalCount} kommunen successful`,
    );
  } else if (args.kommuneSlug) {
    console.log(
      `[manual-sync] Syncing ${args.kommuneSlug}${args.dryRun ? " (dry run)" : ""}`,
    );
    const result = await syncManager.syncKommunePolygons(args.kommuneSlug);

    if (result.success) {
      console.log(
        `[manual-sync] ✓ Success: ${result.polygonsFound} polygons found, ${result.polygonsInserted} inserted in ${result.durationMs}ms`,
      );
    } else {
      console.error(`[manual-sync] ✗ Failed: ${result.error}`);
      process.exit(1);
    }
  } else {
    console.error(
      "[manual-sync] Error: Kommune slug required for sync command",
    );
    process.exit(1);
  }
}

async function handleDeleteCommand(args: CLIArgs): Promise<void> {
  if (!args.kommuneSlug && !args.all) {
    console.error(
      "[manual-sync] Error: Kommune slug or --all flag required for delete command",
    );
    process.exit(1);
  }

  const syncManager = new AdminPolygonSyncManager({
    dryRun: args.dryRun,
    verbose: args.verbose,
  });

  if (args.all) {
    console.log(
      `[manual-sync] Deleting polygons for all kommunen${args.dryRun ? " (dry run)" : ""}`,
    );
    const kommunen = await getAllKommunenFromFS();

    for (const kommune of kommunen) {
      if (args.dryRun) {
        console.log(
          `[manual-sync] Dry run: Would delete polygons for ${kommune.slug}`,
        );
      } else {
        console.log(`[manual-sync] Deleting polygons for ${kommune.slug}`);
        await syncManager.deleteKommunePolygons(kommune.slug);
      }
      await new Promise((resolve) => setTimeout(resolve, args.delayMs));
    }
  } else if (args.kommuneSlug) {
    if (args.dryRun) {
      console.log(
        `[manual-sync] Dry run: Would delete polygons for ${args.kommuneSlug}`,
      );
    } else {
      console.log(`[manual-sync] Deleting polygons for ${args.kommuneSlug}`);
      await syncManager.deleteKommunePolygons(args.kommuneSlug);
    }
  }
}

async function handleStatusCommand(args: CLIArgs): Promise<void> {
  const syncManager = new AdminPolygonSyncManager();
  const statuses = await syncManager.getSyncStatus();

  if (args.kommuneSlug) {
    const status = statuses.find((s) => s.slug === args.kommuneSlug);
    if (status) {
      console.log(`\nStatus for ${args.kommuneSlug}:`);
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.error(`[manual-sync] Kommune not found: ${args.kommuneSlug}`);
      process.exit(1);
    }
  } else {
    console.log("\nSync Status for all kommunen:");
    statuses.forEach((status) => {
      const levels =
        status.adminLevels.length > 0
          ? `[${status.adminLevels.join(",")}]`
          : "[none]";
      const hasData = status.hasOSMData ? "✓" : "✗";
      console.log(
        `  ${hasData} ${status.slug.padEnd(15)} ${status.title.padEnd(20)} ${levels}`,
      );
    });
  }
}

async function handleListCommand(): Promise<void> {
  const kommunen = await getAllKommunen();

  console.log("\nAvailable kommunen:");
  kommunen.forEach((kommune) => {
    const levels =
      kommune.osmAdminLevels?.length > 0
        ? `[${kommune.osmAdminLevels.join(",")}]`
        : "[none]";
    const wpName = kommune.wp_name || "none";
    console.log(
      `  ${kommune.slug.padEnd(15)} ${kommune.title.padEnd(20)} ${levels} wp:${wpName}`,
    );
  });
  console.log(`\nTotal: ${kommunen.length} kommunen`);
}

async function handleWatchCommand(args: CLIArgs): Promise<void> {
  console.log("[manual-sync] Starting file watcher...");

  const watcher = new KommuneWatcher({
    verbose: args.verbose,
    dryRun: args.dryRun,
    debounceMs: args.delayMs,
  });

  watcher.start();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[manual-sync] Shutting down file watcher...");
    watcher.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[manual-sync] Terminating file watcher...");
    watcher.stop();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  // Load environment at startup
  await loadEnvironment();

  const args = parseArgs();

  if (!args.command || args.command === "help") {
    printUsage();
    process.exit(0);
  }

  try {
    switch (args.command) {
      case "sync":
        await handleSyncCommand(args);
        break;
      case "delete":
        await handleDeleteCommand(args);
        break;
      case "status":
        await handleStatusCommand(args);
        break;
      case "list":
        await handleListCommand();
        break;
      case "watch":
        await handleWatchCommand(args);
        break;
      default:
        console.error(`[manual-sync] Unknown command: ${args.command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[manual-sync] Error: ${errorMsg}`);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      console.error("[manual-sync] Fatal error:", error);
      process.exit(1);
    })
    .finally(() => {
      // Sicherstellen, dass der Prozess beendet wird
      process.exit(0);
    });
}
