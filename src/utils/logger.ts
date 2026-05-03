// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { AstroIntegrationLogger } from "astro";

// Simple logger that can work with Astro's logger or fallback to console
// Note: AstroIntegrationLogger is only available during integration runtime
export interface Logger {
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, error?: Error | string, data?: any): void;
  debug(message: string, data?: any): void;
}

// Default console logger for when Astro logger is not available
const consoleLogger: Logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || "");
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || "");
  },
  error: (message: string, error?: Error | string, data?: any) => {
    console.error(`[ERROR] ${message}`, error || "", data || "");
  },
  debug: (message: string, data?: any) => {
    if (process.env.APP_DEBUG) {
      console.debug(`[DEBUG] ${message}`, data || "");
    }
  },
};

// Create a logger that can adapt to Astro's integration logger or use console
export function createLogger(astroLogger?: AstroIntegrationLogger): Logger {
  if (astroLogger) {
    return {
      info: (message: string, data?: any) =>
        astroLogger.info(message + (data ? ` ${JSON.stringify(data)}` : "")),
      warn: (message: string, data?: any) =>
        astroLogger.warn(message + (data ? ` ${JSON.stringify(data)}` : "")),
      error: (message: string, error?: Error | string, data?: any) => {
        const errorMsg = error instanceof Error ? error.message : error;
        astroLogger.error(
          `${message}: ${errorMsg}` + (data ? ` ${JSON.stringify(data)}` : ""),
        );
      },
      debug: (message: string, data?: any) => {
        if (process.env.APP_DEBUG) {
          astroLogger.info(
            `[DEBUG] ${message}` + (data ? ` ${JSON.stringify(data)}` : ""),
          );
        }
      },
    };
  }

  return consoleLogger;
}

// Global logger instance
export const logger: Logger = consoleLogger;

// Helper to set Astro logger context
export function setAstroLogger(astroLogger: AstroIntegrationLogger): void {
  const astroBasedLogger = createLogger(astroLogger);

  // Override global logger methods
  logger.info = astroBasedLogger.info;
  logger.warn = astroBasedLogger.warn;
  logger.error = astroBasedLogger.error;
  logger.debug = astroBasedLogger.debug;
}
