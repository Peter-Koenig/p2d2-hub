// TypeScript interfaces for Admin Polygon Sync functionality
export type { GeoJSON } from "geojson";

export interface OSMPolygonFeature extends GeoJSON.Feature {
  id: number;
  properties: {
    name: string;
    admin_level: number;
    wikipedia?: string;
    wikidata?: string;
    type: string;
    timestamp: string;
    version: number;
    changeset: number;
    user: string;
    uid: number;
  };
  geometry: GeoJSON.Geometry;
}

export interface OSMPolygonCollection extends GeoJSON.FeatureCollection {
  features: OSMPolygonFeature[];
}

export interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
  delayMs?: number;
}

export interface SyncResult {
  success: boolean;
  kommuneSlug: string;
  adminLevel: number;
  polygonsFound: number;
  polygonsInserted: number;
  error?: string;
  durationMs: number;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: Array<{
    type: "node" | "way" | "relation";
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
    members?: Array<{
      type: "node" | "way" | "relation";
      ref: number;
      role: string;
      geometry?: Array<{ lat: number; lon: number }>;
    }>;
  }>;
}

export interface WFSTTransactionResult {
  success: boolean;
  transactionId?: string;
  insertedCount?: number;
  error?: string;
  response?: Response;
}

export interface KommuneSyncStatus {
  slug: string;
  title: string;
  hasOSMData: boolean;
  adminLevels: number[];
  lastSync?: Date;
  polygonCount: number;
  status: "pending" | "synced" | "error" | "not_found";
}
