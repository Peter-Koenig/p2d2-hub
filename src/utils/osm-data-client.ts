// OSM Data Client for Overpass API integration
import axios, { isAxiosError } from "axios";

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

export interface OverpassQueryOptions {
  timeout?: number;
  endpoint?: string;
  retryAttempts?: number;
  retryDelay?: number;
  maxElements?: number;
}

export class OSMDataClient {
  private defaultOptions: Required<OverpassQueryOptions> = {
    timeout: 90,
    endpoint: "https://overpass-api.de/api/interpreter", // Main instance
    retryAttempts: 3,
    retryDelay: 3000,
    maxElements: 10000,
  };

  // Load balancing endpoints with priority order
  private overpassEndpoints = [
    "https://overpass-api.de/api/interpreter", // Primary: Main instance
    "https://z.overpass-api.de/api/interpreter", // Secondary: Main instance mirror
  ];
  private options: Required<OverpassQueryOptions>;
  private currentEndpointIndex = 0;

  constructor(options: OverpassQueryOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Build Overpass query for administrative polygons using area search
   */
  buildAdminPolygonQuery(
    wpName: string,
    adminLevel: number,
    refinement?: string,
  ): string {
    const locationName = wpName.split("-")[1] || wpName;

    // Build area search based on name and optional refinement
    let areaSearch: string;
    if (refinement) {
      // Search for area with name and refinement (e.g., state/region)
      areaSearch =
        `area["name"="${refinement}"]->.refinementArea;\n` +
        `area["name"="${locationName}"](area.refinementArea)->.searchArea;`;
    } else {
      // Simple name-based area search
      areaSearch = `area["name"="${locationName}"]->.searchArea;`;
    }

    return `[out:json][timeout:${this.options.timeout || this.defaultOptions.timeout}][maxsize:1073741824];
${areaSearch}
(
  relation[boundary=administrative][admin_level=${adminLevel}](area.searchArea);
);
out geom;`;
  }

  /**
   * Execute Overpass query with retry logic
   */
  async executeOverpassQuery(query: string): Promise<OverpassResponse> {
    const retryAttempts =
      this.options.retryAttempts || this.defaultOptions.retryAttempts;
    const retryDelay =
      this.options.retryDelay || this.defaultOptions.retryDelay;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      const endpoint = this.overpassEndpoints[this.currentEndpointIndex];
      if (process.env.DEBUG) {
        console.log(
          `[osm-client] Using endpoint: ${endpoint} (${this.currentEndpointIndex + 1}/${this.overpassEndpoints.length})`,
        );
      }
      try {
        console.log(
          `[osm-client] Executing Overpass query (attempt ${attempt}/${retryAttempts})`,
        );

        const t0 = Date.now();

        // Create AbortController for robust timeout handling
        const abortController = new AbortController();
        const timeoutId = setTimeout(
          () => abortController.abort(),
          (this.options.timeout || this.defaultOptions.timeout) * 1000,
        );

        try {
          const response = await axios.post(
            endpoint,
            `data=${encodeURIComponent(query)}`,
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              timeout:
                (this.options.timeout || this.defaultOptions.timeout) * 1000,
              signal: abortController.signal,
            },
          );

          clearTimeout(timeoutId); // Clear timeout on success

          const responseTime = Date.now() - t0;
          const contentLength = response.headers?.["content-length"]
            ? Math.round(parseInt(response.headers["content-length"]) / 1024)
            : "unknown";

          console.log(
            `[osm-client] Overpass response ${response.status} in ${responseTime} ms ` +
              `(size: ${contentLength} kB)`,
          );

          if (response.status !== 200) {
            throw new Error(
              `Overpass API returned status ${response.status}: ${response.statusText}`,
            );
          }

          const data = response.data as OverpassResponse;

          if (!data.elements || data.elements.length === 0) {
            console.log(`[osm-client] No elements found in Overpass response`);
          } else {
            console.log(
              `[osm-client] Found ${data.elements.length} elements from Overpass API`,
            );
          }

          return data;
        } catch (error) {
          clearTimeout(timeoutId); // Ensure timeout is cleared on error

          // Handle timeout and abort errors specifically
          if (error instanceof Error && error.name === 'AbortError') {
            lastError = new Error(`Overpass query timeout after ${this.options.timeout || this.defaultOptions.timeout} seconds`);
          } else if (isAxiosError(error) && error.code === 'ECONNABORTED') {
            lastError = new Error('Overpass query was aborted due to timeout');
          } else {
            lastError = error instanceof Error ? error : new Error(String(error));
          }

          console.warn(
            `[osm-client] Overpass query attempt ${attempt} failed (endpoint: ${endpoint}):`,
            lastError.message,
          );

        if (attempt < retryAttempts) {
          // Rotate to next endpoint for next attempt
          this.currentEndpointIndex =
            (this.currentEndpointIndex + 1) % this.overpassEndpoints.length;

          // Intelligent delay: Longer wait for server errors, shorter for timeouts
          const dynamicDelay =
            error.response?.status === 504 ? 5000 : retryDelay;

          if (process.env.DEBUG) {
            console.log(
              `[osm-client] Retrying in ${dynamicDelay}ms with next endpoint...`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, dynamicDelay));
        }
      }
    }

    throw new Error(
      `All ${retryAttempts} Overpass query attempts across ${this.overpassEndpoints.length} endpoints failed. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Convert Overpass response to GeoJSON
   */
  convertToGeoJSON(response: OverpassResponse): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];

    for (const element of response.elements) {
      if (element.type === "relation" || element.type === "way") {
        const feature: GeoJSON.Feature = {
          type: "Feature",
          id: element.id,
          properties: {
            ...element.tags,
            osm_id: element.id,
            osm_type: element.type,
            admin_level: element.tags?.admin_level
              ? parseInt(element.tags.admin_level)
              : undefined,
          },
          geometry: this.convertGeometry(element),
        };
        features.push(feature);
      }
    }

    return {
      type: "FeatureCollection",
      features,
    };
  }

  /**
   * Validate polygon ring coordinates (closed ring with minimum 4 points)
   */
  private validatePolygonRing(coordinates: number[][]): boolean {
    return (
      coordinates.length >= 4 &&
      coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
      coordinates[0][1] === coordinates[coordinates.length - 1][1]
    );
  }

  /**
   * Convert Overpass geometry to GeoJSON geometry
   */
  private convertGeometry(
    element: OverpassResponse["elements"][0],
  ): GeoJSON.Geometry {
    if (element.type === "relation" && element.members) {
      // For relations, create a MultiPolygon from members
      const polygons: GeoJSON.Polygon[] = [];

      for (const member of element.members) {
        if (member.type === "way" && member.geometry) {
          // Stream processing for large geometries - avoid multiple copies
          const coordinates: number[][] = [];
          for (const point of member.geometry) {
            coordinates.push([point.lon, point.lat]);
          }

          // Ring schließen - all polygons must be closed for GeoServer
          if (coordinates.length > 2) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];

            // Check if ring is already closed (first point = last point)
            const isClosed = first[0] === last[0] && first[1] === last[1];

            if (!isClosed) {
              coordinates.push([first[0], first[1]]);
            }
          }
          // Validate the polygon ring before adding
          if (this.validatePolygonRing(coordinates)) {
            polygons.push({
              type: "Polygon",
              coordinates: [coordinates],
            });
          } else if (process.env.DEBUG) {
            console.warn(
              `[osm-client] Skipping invalid polygon ring with ${coordinates.length} points`,
            );
          }
        }
      }

      return polygons.length > 1
        ? {
            type: "MultiPolygon",
            coordinates: polygons.map((poly) => poly.coordinates),
          }
        : polygons[0] || { type: "Polygon", coordinates: [] };
    } else if (element.type === "way" && element.geometry) {
      // For ways, create a Polygon - use stream processing for memory efficiency
      const coordinates: number[][] = [];
      for (const point of element.geometry) {
        coordinates.push([point.lon, point.lat]);
      }

      // Ring schließen - all polygons must be closed for GeoServer
      if (coordinates.length > 2) {
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];

        // Check if ring is already closed (first point = last point)
        const isClosed = first[0] === last[0] && first[1] === last[1];

        if (!isClosed) {
          coordinates.push([first[0], first[1]]); // Ring schließen
        }
      }
      // Validate the polygon ring before returning
      if (this.validatePolygonRing(coordinates)) {
        return {
          type: "Polygon",
          coordinates: [coordinates],
        };
      } else if (process.env.DEBUG) {
        console.warn(
          `[osm-client] Skipping invalid polygon ring with ${coordinates.length} points`,
        );
      }
    }

    return { type: "Polygon", coordinates: [] };
  }

  /**
   * Main method to fetch administrative polygons from OSM
   */
  async fetchAdminPolygons(
    wpName: string,
    adminLevel: number,
    refinement?: string,
  ): Promise<GeoJSON.FeatureCollection> {
    console.log(
      `[osm-client] Fetching admin polygons for ${wpName}, level ${adminLevel}`,
    );

    const query = this.buildAdminPolygonQuery(wpName, adminLevel, refinement);
    if (process.env.DEBUG) {
      console.log(`[osm-client] Overpass query:\n${query}`);
    }

    const response = await this.executeOverpassQuery(query);
    const geojson = this.convertToGeoJSON(response);

    console.log(
      `[osm-client] Found ${geojson.features.length} polygons for ${wpName}, level ${adminLevel}`,
    );

    return geojson;
  }
}

// Default singleton instance
export const osmDataClient = new OSMDataClient();
