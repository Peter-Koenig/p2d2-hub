// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { promises as fs } from "fs";
import path from "path";

// Definiert den Pfad, unter dem die uMap-Daten öffentlich erreichbar sein sollen.
const PUBLIC_DATA_PATH = "data"; // -> /public/data/
const FILENAME = "umap_pre_alpha.geojson"; // -> /public/data/umap_pre_alpha.geojson

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Lese das GeoJSON (als Text/String) aus dem Request-Body
    // (EditorDataManager.writeFeatures gibt einen String zurück)
    const geoJsonString = await request.text();

    if (!geoJsonString || geoJsonString.length < 20) {
      return new Response(
        JSON.stringify({ error: "Ungültige GeoJSON-Daten empfangen." }),
        {
          status: 400,
        },
      );
    }

    // 2. Ziel-Pfad definieren
    // KORREKTUR: Schreibe in das 'dist/client'-Verzeichnis (Produktion) statt 'public' (Quelle)
    const targetDir = path.join(
      process.cwd(),
      "dist",
      "client",
      PUBLIC_DATA_PATH,
    );
    const filePath = path.join(targetDir, FILENAME);

    // 3. Sicherstellen, dass das Verzeichnis existiert
    await fs.mkdir(targetDir, { recursive: true });

    // 4. GeoJSON-String in die Datei schreiben
    await fs.writeFile(filePath, geoJsonString);

    console.log(
      `[API save-for-umap] 🗺️ uMap-Daten erfolgreich gespeichert in: ${filePath}`,
    );

    return new Response(
      JSON.stringify({
        message: "Daten erfolgreich für uMap gespeichert.",
        path: `/${PUBLIC_DATA_PATH}/${FILENAME}`,
      }),
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[API save-for-umap] Fehler beim Speichern der uMap-Daten:",
      error,
    );
    return new Response(
      JSON.stringify({ error: "Speichern der uMap-Daten fehlgeschlagen." }),
      {
        status: 500,
      },
    );
  }
};
