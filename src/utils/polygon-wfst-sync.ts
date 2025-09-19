import { getCollection } from 'astro:content';
import { spawn } from 'child_process';
import { WFSAuthClient } from './wfs-auth';

interface SyncResult {
  success: boolean;
  processedLevels: number[];
  insertedPolygons: number;
  errors: string[];
}

interface PolygonRecord {
  category: 'admin_boundary';
  osm_id: string;
  name: string;
  geometry: any; // GeoJSON Geometry
  created_at: string;
  updated_at: string;
  last_updated: string;
  cache_expires: string;
  container_type: 'admin_boundary';
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
    errors: []
  };

  try {
    // 1. Kommune aus Content Collection laden
    const kommunen = await getCollection('kommunen');
    const kommune = kommunen.find(k => k.slug === slug);
    
    if (!kommune?.data.osmAdminLevels || !kommune.data.wpname) {
      throw new Error(`Kommune ${slug} hat keine OSM-Daten definiert`);
    }

    const municipalityName = extractMunicipalityName(kommune.data.wpname);
    
    // 2. Für jedes Admin-Level Python-Script aufrufen und persistieren
    for (const level of kommune.data.osmAdminLevels) {
      try {
        const geoJsonData = await fetchAdminPolygons(municipalityName, [level]);
        const polygons = convertToPolygonRecords(geoJsonData, kommune.data, level);
        
        if (polygons.length > 0) {
          await persistViaWFST(polygons);
          result.processedLevels.push(level);
          result.insertedPolygons += polygons.length;
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
async function fetchAdminPolygons(kommune: string, levels: number[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = ['src/scripts/fetch_admin_polygons.py', '--kommune', kommune, '--levels', levels.join(','), '--debug'];
    const process = spawn('python', args);
    
    let output = '';
    process.stdout.on('data', (data) => output += data.toString());
    process.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error('Invalid JSON from Python script'));
        }
      } else {
        reject(new Error(`Python script failed with code ${code}`));
      }
    });
  });
}

// GeoJSON zu Datenbankrecords konvertieren
function convertToPolygonRecords(geoJsonData: any, kommuneData: any, level: number): PolygonRecord[] {
  if (!geoJsonData.features) return [];
  
  return geoJsonData.features.map(feature => ({
    category: 'admin_boundary',
    osm_id: feature.properties.osm_id?.toString() || '',
    name: feature.properties.name || '',
    geometry: feature.geometry,
    created_at: feature.properties.timestamp || new Date().toISOString(),
    updated_at: feature.properties.timestamp || new Date().toISOString(),
    last_updated: new Date().toISOString(),
    cache_expires: new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000).toISOString(), // 4 Wochen
    container_type: 'admin_boundary',
    municipality: extractMunicipalityName(kommuneData.wpname),
    wp_name: kommuneData.wpname,
    osm_admin_level: level
  }));
}

// WFS-T Transaction für Insert
async function persistViaWFST(records: PolygonRecord[]): Promise<void> {
  const wfsClient = WFSAuthClient.createWFSTClient();
  const transactionXml = buildWFSTInsertXML(records);
  
  const response = await wfsClient.executeWFSTransaction(transactionXml);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WFS-T failed: ${response.status} - ${error}`);
  }
}

// WFS-T 2.0 / GML 3.2 XML Builder
function buildWFSTInsertXML(records: PolygonRecord[]): string {
  const features = records.map(record => {
    const coords = record.geometry.coordinates[0]; // Outer ring
    const posList = coords.map(coord => coord.join(' ')).join(' ');
    
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
  }).join('');

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
  return wpName.replace(/^[a-z]{2}-/, ''); // Entferne Länderkürzel
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

