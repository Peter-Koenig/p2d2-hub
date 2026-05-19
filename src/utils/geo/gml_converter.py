#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
# SPDX-License-Identifier: EUPL-1.2
import json
import logging
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List

logger = logging.getLogger(__name__)


class GMLConverter:
    """Convert GeoJSON polygons to standard GML format readable by QGIS"""

    def extract_polygon_features(self, geojson_data: Dict) -> List[Dict]:
        """Extract only polygon/multipolygon features from GeoJSON"""
        polygon_features = []

        for feature in geojson_data.get("features", []):
            geometry_type = feature.get("geometry", {}).get("type")

            if geometry_type in ["Polygon", "MultiPolygon"]:
                polygon_features.append(feature)
                logger.debug(
                    f"Extracted polygon: {feature.get('properties', {}).get('name', 'unnamed')}"
                )
            else:
                logger.debug(f"Skipped {geometry_type} feature")

        logger.info(
            f"Extracted {len(polygon_features)} polygon features from {len(geojson_data.get('features', []))} total features"
        )
        return polygon_features

    def coordinates_to_pos_list(self, coordinates: List) -> str:
        """Convert coordinate array to GML posList string (lon lat format)"""
        if not coordinates:
            return ""

        pos_list = []
        for coord in coordinates:
            if len(coord) >= 2:
                pos_list.extend([str(coord[0]), str(coord[1])])  # lon lat

        return " ".join(pos_list)

    def convert_to_gml(
        self, polygon_features: List[Dict], municipality: str, admin_level: int
    ) -> str:
        """Convert polygon features to standard GML format for QGIS"""

        # Create root FeatureCollection with proper namespaces
        root = ET.Element("gml:FeatureCollection")
        root.set("xmlns:gml", "http://www.opengis.net/gml/3.2")
        root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
        root.set(
            "xsi:schemaLocation",
            "http://www.opengis.net/gml/3.2 http://schemas.opengis.net/gml/3.2.1/gml.xsd",
        )

        # Add bounded by element
        bounded_by = ET.SubElement(root, "gml:boundedBy")
        null_elem = ET.SubElement(bounded_by, "gml:Null")
        null_elem.text = "missing"

        # Process each polygon feature
        for i, feature in enumerate(polygon_features):
            feature_member = ET.SubElement(root, "gml:featureMember")

            # Create feature element
            admin_boundary = ET.SubElement(feature_member, "AdminBoundary")
            admin_boundary.set("gml:id", f"AdminBoundary.{i + 1}")

            # Add properties
            properties = feature.get("properties", {})

            # Name
            name_elem = ET.SubElement(admin_boundary, "name")
            name_elem.text = properties.get("name", "Unknown")

            # Admin Level
            level_elem = ET.SubElement(admin_boundary, "admin_level")
            level_elem.text = str(admin_level)

            # Municipality
            municipality_elem = ET.SubElement(admin_boundary, "municipality")
            municipality_elem.text = municipality

            # OSM ID
            osm_id_elem = ET.SubElement(admin_boundary, "osm_id")
            osm_id_elem.text = str(properties.get("@id", properties.get("id", "")))

            # Geometry
            geometry = feature.get("geometry", {})
            if geometry.get("type") == "Polygon":
                geom_elem = self.create_polygon_geometry(geometry)
            elif geometry.get("type") == "MultiPolygon":
                geom_elem = self.create_multipolygon_geometry(geometry)
            else:
                continue  # Skip unsupported geometry types

            if geom_elem is not None:
                geom_property = ET.SubElement(admin_boundary, "geometry")
                geom_property.append(geom_elem)

        # Convert to string with proper XML declaration
        xml_str = ET.tostring(root, encoding="unicode", xml_declaration=False)
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str

    def create_polygon_geometry(self, geometry: Dict) -> ET.Element:
        """Create GML Polygon element"""
        # Create MultiPolygon instead of Polygon for PostGIS compatibility
        multipolygon = ET.Element("{http://www.opengis.net/gml/3.2}MultiPolygon")
        multipolygon.set("srsName", "EPSG:4326")

        # Wrap single polygon in polygonMember
        polygon_member = ET.SubElement(
            multipolygon, "{http://www.opengis.net/gml/3.2}polygonMember"
        )
        polygon = ET.SubElement(
            polygon_member, "{http://www.opengis.net/gml/3.2}Polygon"
        )

        coordinates = geometry.get("coordinates", [])
        if not coordinates:
            return multipolygon

        # Exterior ring
        exterior = ET.SubElement(polygon, "{http://www.opengis.net/gml/3.2}exterior")
        linear_ring = ET.SubElement(
            exterior, "{http://www.opengis.net/gml/3.2}LinearRing"
        )
        pos_list = ET.SubElement(linear_ring, "{http://www.opengis.net/gml/3.2}posList")
        pos_list.set("srsDimension", "2")
        pos_list.text = self.coordinates_to_pos_list(coordinates[0])

        # Interior rings (holes)
        for interior_coords in coordinates[1:]:
            interior = ET.SubElement(
                polygon, "{http://www.opengis.net/gml/3.2}interior"
            )
            interior_ring = ET.SubElement(
                interior, "{http://www.opengis.net/gml/3.2}LinearRing"
            )
            interior_pos_list = ET.SubElement(
                interior_ring, "{http://www.opengis.net/gml/3.2}posList"
            )
            interior_pos_list.set("srsDimension", "2")
            interior_pos_list.text = self.coordinates_to_pos_list(interior_coords)

        return multipolygon

    def create_multipolygon_geometry(self, geometry: Dict) -> ET.Element:
        """Create GML MultiSurface element"""
        # Use MultiPolygon instead of MultiSurface for better PostGIS compatibility
        multipolygon = ET.Element("{http://www.opengis.net/gml/3.2}MultiPolygon")
        multipolygon.set("srsName", "EPSG:4326")

        for polygon_coords in geometry.get("coordinates", []):
            # Use polygonMember instead of surfaceMember
            polygon_member = ET.SubElement(
                multipolygon, "{http://www.opengis.net/gml/3.2}polygonMember"
            )
            polygon = ET.SubElement(
                polygon_member, "{http://www.opengis.net/gml/3.2}Polygon"
            )

            if polygon_coords:
                # Exterior ring
                exterior = ET.SubElement(
                    polygon, "{http://www.opengis.net/gml/3.2}exterior"
                )
                linear_ring = ET.SubElement(
                    exterior, "{http://www.opengis.net/gml/3.2}LinearRing"
                )
                pos_list = ET.SubElement(
                    linear_ring, "{http://www.opengis.net/gml/3.2}posList"
                )
                pos_list.set("srsDimension", "2")
                pos_list.text = self.coordinates_to_pos_list(polygon_coords[0])

                # Interior rings
                for interior_coords in polygon_coords[1:]:
                    interior = ET.SubElement(
                        polygon, "{http://www.opengis.net/gml/3.2}interior"
                    )
                    interior_ring = ET.SubElement(
                        interior, "{http://www.opengis.net/gml/3.2}LinearRing"
                    )
                    interior_pos_list = ET.SubElement(
                        interior_ring, "{http://www.opengis.net/gml/3.2}posList"
                    )
                    interior_pos_list.set("srsDimension", "2")
                    interior_pos_list.text = self.coordinates_to_pos_list(
                        interior_coords
                    )

        return multipolygon

    def convert_to_wfst_gml(
        self,
        polygon_features: List[Dict],
        municipality: str,
        admin_level: int,
        container_type: str = "administrative",
    ) -> str:
        """Convert polygon features to WFS-T compatible GML format for direct insertion"""

        # Create a list to hold all container elements
        containers = []

        # Process each polygon feature as a separate container
        for i, feature in enumerate(polygon_features):
            container = ET.Element("p2d2:geo-containers")
            container.set("xmlns:p2d2", "urn:data-dna:govdata")
            container.set("xmlns:gml", "http://www.opengis.net/gml/3.2")
            container.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
            container.set(
                "xsi:schemaLocation",
                "urn:data-dna:govdata http://wfs.data-dna.eu/geoserver/schemas/p2d2/1.0/geo-containers.xsd",
            )

            # Add properties from feature
            properties = feature.get("properties", {})

            # Container type (technical classification)
            containertype_elem = ET.SubElement(container, "p2d2:container_type")
            containertype_elem.text = container_type

            # OSM ID
            osm_id_elem = ET.SubElement(container, "p2d2:osm_id")
            osm_id = properties.get("@id", properties.get("id", ""))
            osm_id_elem.text = (
                str(osm_id).replace("/", "_")
                if osm_id
                else f"unknown_{uuid.uuid4().hex[:8]}"
            )

            # Name
            name_elem = ET.SubElement(container, "p2d2:name")
            name_elem.text = properties.get("name", "Unknown")

            # Timestamps
            timestamp = datetime.now().isoformat()
            created_at_elem = ET.SubElement(container, "p2d2:created_at")
            created_at_elem.text = timestamp
            updated_at_elem = ET.SubElement(container, "p2d2:updated_at")
            updated_at_elem.text = timestamp
            last_updated_elem = ET.SubElement(container, "p2d2:last_updated")
            last_updated_elem.text = timestamp

            # Cache expiration (4 weeks)
            cache_expires_elem = ET.SubElement(container, "p2d2:cache_expires")
            cache_expires_elem.text = timestamp  # Will be updated in TypeScript

            # Container type
            container_type_elem = ET.SubElement(container, "p2d2:container_type")
            container_type_elem.text = "admin_boundary"

            # Municipality
            municipality_elem = ET.SubElement(container, "p2d2:municipality")
            municipality_elem.text = municipality

            # WP Name (with language code)
            wp_name_elem = ET.SubElement(container, "p2d2:wp_name")
            wp_name_elem.text = f"de-{municipality}"

            # Admin level
            admin_level_elem = ET.SubElement(container, "p2d2:osm_admin_level")
            admin_level_elem.text = str(admin_level)

            # Geometry
            geometry = feature.get("geometry", {})
            if geometry.get("type") == "Polygon":
                geom_elem = self.create_polygon_geometry(geometry)
            elif geometry.get("type") == "MultiPolygon":
                geom_elem = self.create_multipolygon_geometry(geometry)
            else:
                continue  # Skip unsupported geometry types

            if geom_elem is not None:
                # Remove namespace from geometry elements for WFS-T compatibility
                for elem in geom_elem.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]  # Remove namespace

                geometry_elem = ET.SubElement(container, "p2d2:geometry")
                geometry_elem.append(geom_elem)

            # Add the container to the list
            containers.append(container)

        # Convert each container to string and join with newlines
        container_strings = []
        for container in containers:
            xml_str = ET.tostring(container, encoding="unicode", xml_declaration=False)
            container_strings.append(xml_str)

        # Return all containers as separate elements
        return "\n".join(container_strings)
