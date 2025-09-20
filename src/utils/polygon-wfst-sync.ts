import { spawn } from "child_process";
import { WFSAuthClient } from "./wfs-auth";

interface SyncResult {
  success: boolean;
  processedLevels: number[];
  insertedPolygons: number;
  errors: string[];
}

interface PolygonRecord {
  category: "admin_boundary";
  osm_id: string;
  name: string;
  geometry: any; // GeoJSON Geometry
  created_at: string;
  updated_at: string;
  last_updated: string;
  cache_expires: string;
  container_type: "admin_boundary";
  municipality: string;
  wp_name: string;
  osm_admin_level: number;
}

// Hauptfunktion für Polygon-Synchronisation
export async function syncKommunePolygons(slug: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    processedLevels: [],
    insertedPolygons: 0,
    errors: [],
  };

  try {
    // 1. Kommune aus Content Collection laden (dynamisch um Build-Konflikte zu vermeiden)
    const { getCollection } = await import("astro:content");
    const kommunen = await getCollection("kommunen");
    const kommune = kommunen.find((k) => k.slug === slug);

    if (process.env.DEBUG) {
      console.debug(`[DEBUG] Found kommune: ${slug}`, {
        hasOsmLevels: !!kommune?.data.osmAdminLevels,
        levels: kommune?.data.osmAdminLevels,
        wp_name: kommune?.data.wp_name,
      });
    }

    if (!kommune?.data.osmAdminLevels || !kommune.data.wp_name) {
      throw new Error(`Kommune ${slug} hat keine OSM-Daten definiert`);
    }

    const municipalityName = extractMunicipalityName(kommune.data.wp_name);

    // 2. Für jedes Admin-Level Python-Script aufrufen und persistieren
    for (const level of kommune.data.osmAdminLevels) {
      try {
        if (process.env.DEBUG) {
          console.debug(
            `[DEBUG] Processing admin level ${level} for ${municipalityName}`,
          );
        }
        const geoJsonData = await fetchAdminPolygons(municipalityName, level);
        const polygons = convertToPolygonRecords(
          geoJsonData,
          kommune.data,
          level,
        );

        if (polygons.length > 0) {
          if (process.env.DEBUG) {
            console.debug(
              `[DEBUG] Converted ${polygons.length} polygons to WFS-T records for level ${level}`,
            );
          }
          await persistViaWFST(polygons);
          result.processedLevels.push(level);
          result.insertedPolygons += polygons.length;
        } else if (process.env.DEBUG) {
          console.debug(`[DEBUG] No polygons found for level ${level}`);
        }
      } catch (error) {
        result.errors.push(`Level ${level}: ${error.message}`);
        result.success = false;
      }
    }
  } catch (error) {
    result.errors.push(error.message);
    result.success = false;
  }

  return result;
}

// Python-Script Aufruf
async function fetchAdminPolygons(
  kommune: string,
  level: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = [
      "src/scripts/fetch_admin_polygons.py",
      "--kommune",
      kommune,
      "--levels",
      level.toString(),
      "--debug",
    ];

    if (process.env.DEBUG) {
      console.debug(
        `[DEBUG] Executing Python script: python ${args.join(" ")}`,
      );
    }
    const pythonProcess = spawn("python", args);

    let output = "";
    let stderr = "";
    pythonProcess.stdout.on("data", (data) => (output += data.toString()));
    pythonProcess.stderr.on("data", (data) => (stderr += data.toString()));
    pythonProcess.on("close", (code) => {
      if (process.env.DEBUG) {
        console.debug(`[DEBUG] Python script exited with code ${code}`);
        if (stderr) console.debug(`[DEBUG] Python stderr: ${stderr}`);
      }

      if (code === 0) {
        try {
          // Extract JSON from potentially multi-line output
          // Look for the JSON object starting with { and ending with }
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            if (process.env.DEBUG) {
              console.debug(
                `[DEBUG] No JSON found in Python output: ${output}`,
              );
            }
            reject(new Error("No JSON found in Python script output"));
            return;
          }

          const result = JSON.parse(jsonMatch[0]);

          // Check if result contains GeoJSON files - read the actual GeoJSON
          if (result.files && result.files[level.toString()]) {
            import("fs")
              .then(({ readFileSync }) => {
                try {
                  const geoJsonPath = result.files[level.toString()];
                  const geoJsonData = JSON.parse(
                    readFileSync(geoJsonPath, "utf8"),
                  );
                  if (process.env.DEBUG) {
                    console.debug(
                      `[DEBUG] Loaded GeoJSON: ${geoJsonData.features?.length || 0} features from ${geoJsonPath}`,
                    );
                  }
                  resolve(geoJsonData);
                } catch (fileError) {
                  if (process.env.DEBUG) {
                    console.debug(
                      "DEBUG Failed to read GeoJSON file:",
                      fileError,
                    );
                  }
                  reject(new Error("Failed to read generated GeoJSON file"));
                }
              })
              .catch((importError) => {
                if (process.env.DEBUG) {
                  console.debug("DEBUG Failed to import fs:", importError);
                }
                reject(new Error("Failed to import filesystem module"));
              });
          } else {
            if (process.env.DEBUG) {
              console.debug(
                `[DEBUG] Python script returned ${result.features?.length || 0} features`,
              );
            }
            resolve(result);
          }
        } catch (e) {
          if (process.env.DEBUG) {
            console.debug(
              `[DEBUG] Python output that failed to parse: ${output}`,
            );
            console.debug(`[DEBUG] JSON parsing error: ${e.message}`);
          }
          reject(new Error("Invalid JSON from Python script"));
        }
      } else {
        if (process.env.DEBUG) {
          console.debug(`[DEBUG] Python script failed with output: ${output}`);
        }
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
      }
    });
  });
}

// GeoJSON zu Datenbankrecords konvertieren
function convertToPolygonRecords(
  geoJsonData: any,
  kommuneData: any,
  level: number,
): PolygonRecord[] {
  if (!geoJsonData.features) return [];

  return geoJsonData.features.map((feature) => ({
    category: "admin_boundary",
    osm_id: feature.properties.osm_id?.toString() || "",
    name: feature.properties.name || "",
    geometry: feature.geometry,
    created_at: feature.properties.timestamp || new Date().toISOString(),
    updated_at: feature.properties.timestamp || new Date().toISOString(),
    last_updated: new Date().toISOString(),
    cache_expires: new Date(
      Date.now() + 4 * 7 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 4 Wochen
    container_type: "admin_boundary",
    municipality: extractMunicipalityName(kommuneData.wp_name),
    wp_name: kommuneData.wp_name,
    osm_admin_level: level,
  }));
}

// WFS-T Transaction für Insert
async function persistViaWFST(records: PolygonRecord[]): Promise<void> {
  if (process.env.DEBUG) {
    console.debug(
      `[DEBUG] Starting WFS-T transaction for ${records.length} records`,
    );
  }

  const wfsClient = WFSAuthClient.createWFSTClient();
  const transactionXml = buildWFSTInsertXML(records);

  if (process.env.DEBUG) {
    console.debug(
      `[DEBUG] WFS-T Transaction XML size: ${transactionXml.length} chars`,
    );
    // Log first 200 chars of XML for debugging
    console.debug(
      `[DEBUG] WFS-T Transaction start: ${transactionXml.substring(0, 200)}...`,
    );
  }

  const response = await wfsClient.executeWFSTransaction(transactionXml);

  if (process.env.DEBUG) {
    console.debug(`[DEBUG] WFS-T Response status: ${response.status}`);
  }

  if (!response.ok) {
    const error = await response.text();
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] WFS-T Error response: ${error}`);
    }
    throw new Error(`WFS-T failed: ${response.status} - ${error}`);
  }

  if (process.env.DEBUG) {
    console.debug(`[DEBUG] WFS-T transaction completed successfully`);
  }
}

// WFS-T 2.0 / GML 3.2 XML Builder
function buildWFSTInsertXML(records: PolygonRecord[]): string {
  const features = records
    .map((record) => {
      const coords = record.geometry.coordinates[0]; // Outer ring
      const posList = coords.map((coord) => coord.join(" ")).join(" ");

      return `
      <p2d2:p2d2_containers>
        <p2d2:category>${escapeXml(record.category)}</p2d2:category>
        <p2d2:osm_id>${escapeXml(record.osm_id)}</p2d2:osm_id>
        <p2d2:name>${escapeXml(record.name)}</p2d2:name>
        <p2d2:created_at>${record.created_at}</p2d2:created_at>
        <p2d2:updated_at>${record.updated_at}</p2d2:updated_at>
        <p2d2:last_updated>${record.last_updated}</p2d2:last_updated>
        <p2d2:cache_expires>${record.cache_expires}</p2d2:cache_expires>
        <p2d2:container_type>${escapeXml(record.container_type)}</p2d2:container_type>
        <p2d2:municipality>${escapeXml(record.municipality)}</p2d2:municipality>
        <p2d2:wp_name>${escapeXml(record.wp_name)}</p2d2:wp_name>
        <p2d2:osm_admin_level>${record.osm_admin_level}</p2d2:osm_admin_level>
        <p2d2:geometry>
          <gml:Polygon srsName="EPSG:4326">
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList srsDimension="2">${posList}</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </p2d2:geometry>
      </p2d2:p2d2_containers>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:p2d2="urn:data-dna:govdata"
  service="WFS"
  version="2.0.0">
  <wfs:Insert>${features}</wfs:Insert>
</wfs:Transaction>`;
}

// Hilfsfunktionen
function extractMunicipalityName(wpName: string): string {
  return wpName.replace(/^[a-z]{2}-/, ""); // Entferne Länderkürzel
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
