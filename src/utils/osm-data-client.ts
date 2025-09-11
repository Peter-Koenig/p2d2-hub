// OSM Data Client for Overpass API integration
import axios from "axios";

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
    timeout: 120,
    endpoint: "https://overpass-api.de/api/interpreter",
    retryAttempts: 3,
    retryDelay: 1000,
    maxElements: 10000,
  };

  constructor(options: OverpassQueryOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Build Overpass query for administrative polygons
   */
  buildAdminPolygonQuery(wpName: string, adminLevel: number): string {
    const cleanWpName = wpName.replace(/"/g, '\\"');
    const namePart = wpName.split("-")[1]?.slice(0, 50) || "";

    return `[out:json][timeout:${this.options.timeout || this.defaultOptions.timeout}];
(
  relation["admin_level"="${adminLevel}"]["wikipedia"~"${cleanWpName}"];
  relation["admin_level"="${adminLevel}"]["name"~"${namePart}", i];
  way["admin_level"="${adminLevel}"]["wikipedia"~"${cleanWpName}"];
  way["admin_level"="${adminLevel}"]["name"~"${namePart}", i];
);
out body ${this.options.maxElements || this.defaultOptions.maxElements};
>;
out skel qt;`;
  }

  /**
   * Execute Overpass query with retry logic
   */
  async executeOverpassQuery(query: string): Promise<OverpassResponse> {
    const endpoint = this.options.endpoint || this.defaultOptions.endpoint;
    const retryAttempts =
      this.options.retryAttempts || this.defaultOptions.retryAttempts;
    const retryDelay =
      this.options.retryDelay || this.defaultOptions.retryDelay;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        console.log(
          `[osm-client] Executing Overpass query (attempt ${attempt}/${retryAttempts})`,
        );

        const t0 = Date.now();
        const response = await axios.post(
          endpoint,
          `data=${encodeURIComponent(query)}`,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout:
              (this.options.timeout || this.defaultOptions.timeout) * 1000,
          },
        );

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
        lastError = error as Error;
        console.warn(
          `[osm-client] Overpass query attempt ${attempt} failed:`,
          error.message,
        );

        if (attempt < retryAttempts) {
          console.log(`[osm-client] Retrying in ${retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw new Error(
      `All ${retryAttempts} Overpass query attempts failed. Last error: ${lastError?.message}`,
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
          const coordinates = member.geometry.map((point) => [
            point.lon,
            point.lat,
          ]);
          // Ring schließen - alle Polygone müssen geschlossen sein für GeoServer
          if (coordinates.length > 2) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];

            // Prüfe ob Ring bereits geschlossen ist (erster Punkt = letzter Punkt)
            const isClosed = first[0] === last[0] && first[1] === last[1];

            if (!isClosed) {
              coordinates.push([first[0], first[1]]);
            }
          }
          polygons.push({
            type: "Polygon",
            coordinates: [coordinates],
          });
        }
      }

      return polygons.length > 1
        ? {
            type: "MultiPolygon",
            coordinates: polygons.map((poly) => poly.coordinates),
          }
        : polygons[0] || { type: "Polygon", coordinates: [] };
    } else if (element.type === "way" && element.geometry) {
      // For ways, create a Polygon
      const coordinates = element.geometry.map((point) => [
        point.lon,
        point.lat,
      ]);
      // Ring schließen - alle Polygone müssen geschlossen sein für GeoServer
      if (coordinates.length > 2) {
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];

        // Prüfe ob Ring bereits geschlossen ist (erster Punkt = letzter Punkt)
        const isClosed = first[0] === last[0] && first[1] === last[1];

        if (!isClosed) {
          coordinates.push([first[0], first[1]]); // Ring schließen
        }
      }
      return {
        type: "Polygon",
        coordinates: [coordinates],
      };
    }

    return { type: "Polygon", coordinates: [] };
  }

  /**
   * Main method to fetch administrative polygons from OSM
   */
  async fetchAdminPolygons(
    wpName: string,
    adminLevel: number,
  ): Promise<GeoJSON.FeatureCollection> {
    console.log(
      `[osm-client] Fetching admin polygons for ${wpName}, level ${adminLevel}`,
    );

    const query = this.buildAdminPolygonQuery(wpName, adminLevel);
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
