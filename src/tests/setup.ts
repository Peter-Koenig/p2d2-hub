// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vitest-Setup – lädt .env.test vor allen Tests
//
// dotenv ist bereits in devDependencies vorhanden.
// Der Pfad ist relativ zum Projekt-Root (dort liegt .env.test).
import { config } from "dotenv";

config({ path: ".env.test" });
