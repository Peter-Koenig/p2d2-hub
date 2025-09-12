// WFS Transaction Builder for WFS-T operations
import type { GeoJSON } from "geojson";

export interface WFSTransactionOptions {
  typeName: string;
  featurePrefix?: string;
  srsName?: string;
  namespace?: string;
}

export class WFSTransactionBuilder {
  private defaultOptions: Required<WFSTransactionOptions> = {
    typeName: "Verwaltungsdaten:p2d2_containers",
    featurePrefix: "polygon_",
    srsName: "EPSG:4326",
    namespace: 'xmlns:Verwaltungsdaten="urn:data-dna:govdata"',
  };

  constructor(private options: WFSTransactionOptions = {}) {}

  /**
   * Build WFS-T Insert transaction for GeoJSON features
   */
  buildInsertTransaction(
    features: GeoJSON.Feature[],
    kommuneSlug: string,
    adminLevel: number,
  ): string {
    const mergedOptions = { ...this.defaultOptions, ...this.options };

    const insertElements = features
      .map((feature, index) =>
        this.buildInsertElement(feature, kommuneSlug, adminLevel, index),
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:ogc="http://www.opengis.net/ogc"
  ${mergedOptions.namespace}
  service="WFS"
  version="2.0">

  ${insertElements}

</wfs:Transaction>`;
  }

  /**
   * Build individual Insert element for a feature
   */
  private buildInsertElement(
    feature: GeoJSON.Feature,
    kommuneSlug: string,
    adminLevel: number,
    index: number,
  ): string {
    const mergedOptions = { ...this.defaultOptions, ...this.options };
    const featureId = `${mergedOptions.featurePrefix}${feature.id || Date.now()}_${index}`;

    const geometryXml = this.convertGeometryToGML(feature.geometry);
    const propertiesXml = this.buildPropertiesXml(
      feature.properties,
      kommuneSlug,
      adminLevel,
    );

    return `<wfs:Insert>
  <${mergedOptions.typeName}>
  ${propertiesXml}
  <geometry>${geometryXml}</geometry>
</${mergedOptions.typeName}>
</wfs:Insert>`;
  }

  /**
   * Convert GeoJSON geometry to GML format
   */
  private convertGeometryToGML(geometry: GeoJSON.Geometry): string {
    if (geometry.type === "Polygon") {
      return this.convertPolygonToGML(geometry);
    } else if (geometry.type === "MultiPolygon") {
      return this.convertMultiPolygonToGML(geometry);
    } else {
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }
  }

  /**
   * Convert Polygon to GML
   */
  private convertPolygonToGML(polygon: GeoJSON.Polygon): string {
    const coordinates = polygon.coordinates[0]; // Outer ring
    const posList = coordinates.map((coord) => coord.join(" ")).join(" ");

    return `<gml:MultiSurface>
      <gml:surfaceMember>
        <gml:Polygon>
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>${posList}</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </gml:surfaceMember>
    </gml:MultiSurface>`;
  }

  /**
   * Convert MultiPolygon to GML
   */
  private convertMultiPolygonToGML(multiPolygon: GeoJSON.MultiPolygon): string {
    const surfaceElements = multiPolygon.coordinates
      .map((polygonCoords) => {
        const posList = polygonCoords[0]
          .map((coord) => coord.join(" "))
          .join(" ");
        return `<gml:surfaceMember>
          <gml:Polygon>
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>${posList}</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </gml:surfaceMember>`;
      })
      .join("\n");

    return `<gml:MultiSurface>${surfaceElements}</gml:MultiSurface>`;
  }

  /**
   * Build properties XML for WFS-T Insert
   */
  private buildPropertiesXml(
    properties: Record<string, any>,
    kommuneSlug: string,
    adminLevel: number,
  ): string {
    // Minimal-Felder basierend auf GeoServer-Schema
    const propLines = [
      `<osm_id>${properties.osm_id || ""}</osm_id>`,
      `<category>admin_boundary</category>`,
      `<container_type>administrative_polygon</container_type>`,
      `<municipality>${this.escapeXml(kommuneSlug)}</municipality>`,
    ];

    return propLines.join("\n    ");
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Build WFS-T Delete transaction for a kommune
   */
  buildDeleteTransaction(kommuneSlug: string): string {
    const mergedOptions = { ...this.defaultOptions, ...this.options };

    return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:ogc="http://www.opengis.net/ogc"
  ${mergedOptions.namespace}
  service="WFS"
  version="2.0">

  <wfs:Delete typeName="${mergedOptions.typeName}">
    <ogc:Filter>
      <ogc:PropertyIsEqualTo>
        <ogc:PropertyName>kommune_slug</ogc:PropertyName>
        <ogc:Literal>${this.escapeXml(kommuneSlug)}</ogc:Literal>
      </ogc:PropertyIsEqualTo>
    </ogc:Filter>
  </wfs:Delete>

</wfs:Transaction>`;
  }
}

// Default singleton instance
export const wfsTransactionBuilder = new WFSTransactionBuilder();
