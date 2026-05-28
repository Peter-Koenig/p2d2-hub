// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vitest-Konfiguration für Integrationstests
//
// Test-Modus: npx vitest run                (einmalig)
//             npx vitest                     (Watch-Modus)
//
// Voraussetzung: Der Astro-Dev-Server läuft unter http://localhost:4321
//   npm run dev:de1
//
// Umgebungsvariablen aus .env.test werden über dotenv geladen
// (siehe setupFiles). DB-Zugriff und Auth-Cookies kommen daraus.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Testdateien in src/tests/ – nur .test.ts (keine .spec.ts)
    include: ["src/tests/**/*.test.ts"],

    // Lädt .env.test VOR allen Tests (dotenv ist devDependency)
    setupFiles: ["src/tests/setup.ts"],

    // Keine globals – alle Imports explizit (vitest import)
    globals: false,

    // Test-Umgebung: node (kein JSDOM nötig – reine HTTP-Tests)
    environment: "node",

    // Timeout für Integrationstests (DB + HTTP): 30s
    testTimeout: 30_000,

    // Hook-Timeout für beforeAll/beforeEach (DB-Cleanup kann länger dauern)
    hookTimeout: 15_000,

    // Keine parallelen Tests – jeder Test braucht exklusive DB-Daten
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
