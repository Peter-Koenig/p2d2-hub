#!/usr/bin/env python3
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class GMLConverter:
    """Convert GeoJSON polygons to standard GML format readable by QGIS"""

    def extract_polygon_features(self, geojson_data: Dict) -> List[Dict]:
        """Extract only polygon/multipolygon features from GeoJSON"""
        polygon_features = []

        for feature in geojson_data.get('features', []):
            geometry_type = feature.get('geometry', {}).get('type')

            if geometry_type in ['Polygon', 'MultiPolygon']:
                polygon_features.append(feature)
                logger.debug(f"Extracted polygon: {feature.get('properties', {}).get('name', 'unnamed')}")
            else:
                logger.debug(f"Skipped {geometry_type} feature")

        logger.info(f"Extracted {len(polygon_features)} polygon features from {len(geojson_data.get('features', []))} total features")
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

    def convert_to_gml(self, polygon_features: List[Dict], municipality: str, admin_level: int) -> str:
        """Convert polygon features to standard GML format for QGIS"""

        # Create root FeatureCollection with proper namespaces
        root = ET.Element("gml:FeatureCollection")
        root.set("xmlns:gml", "http://www.opengis.net/gml/3.2")
        root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
        root.set("xsi:schemaLocation", "http://www.opengis.net/gml/3.2 http://schemas.opengis.net/gml/3.2.1/gml.xsd")

        # Add bounded by element
        bounded_by = ET.SubElement(root, "gml:boundedBy")
        null_elem = ET.SubElement(bounded_by, "gml:Null")
        null_elem.text = "missing"

        # Process each polygon feature
        for i, feature in enumerate(polygon_features):
            feature_member = ET.SubElement(root, "gml:featureMember")

            # Create feature element
            admin_boundary = ET.SubElement(feature_member, "AdminBoundary")
            admin_boundary.set("gml:id", f"AdminBoundary.{i+1}")

            # Add properties
            properties = feature.get('properties', {})

            # Name
            name_elem = ET.SubElement(admin_boundary, "name")
            name_elem.text = properties.get('name', 'Unknown')

            # Admin Level
            level_elem = ET.SubElement(admin_boundary, "admin_level")
            level_elem.text = str(admin_level)

            # Municipality
            municipality_elem = ET.SubElement(admin_boundary, "municipality")
            municipality_elem.text = municipality

            # OSM ID
            osm_id_elem = ET.SubElement(admin_boundary, "osm_id")
            osm_id_elem.text = str(properties.get('@id', properties.get('id', '')))

            # Geometry
            geometry = feature.get('geometry', {})
            if geometry.get('type') == 'Polygon':
                geom_elem = self.create_polygon_geometry(geometry)
            elif geometry.get('type') == 'MultiPolygon':
                geom_elem = self.create_multipolygon_geometry(geometry)
            else:
                continue  # Skip unsupported geometry types

            if geom_elem is not None:
                geom_property = ET.SubElement(admin_boundary, "geometry")
                geom_property.append(geom_elem)

        # Convert to string with proper XML declaration
        xml_str = ET.tostring(root, encoding='unicode', xml_declaration=False)
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str

    def create_polygon_geometry(self, geometry: Dict) -> ET.Element:
        """Create GML Polygon element"""
        polygon = ET.Element("{http://www.opengis.net/gml/3.2}Polygon")
        polygon.set("srsName", "EPSG:4326")

        coordinates = geometry.get('coordinates', [])
        if not coordinates:
            return polygon

        # Exterior ring
        exterior = ET.SubElement(polygon, "{http://www.opengis.net/gml/3.2}exterior")
        linear_ring = ET.SubElement(exterior, "{http://www.opengis.net/gml/3.2}LinearRing")
        pos_list = ET.SubElement(linear_ring, "{http://www.opengis.net/gml/3.2}posList")
        pos_list.set("srsDimension", "2")
        pos_list.text = self.coordinates_to_pos_list(coordinates[0])

        # Interior rings (holes)
        for interior_coords in coordinates[1:]:
            interior = ET.SubElement(polygon, "{http://www.opengis.net/gml/3.2}interior")
            interior_ring = ET.SubElement(interior, "{http://www.opengis.net/gml/3.2}LinearRing")
            interior_pos_list = ET.SubElement(interior_ring, "{http://www.opengis.net/gml/3.2}posList")
            interior_pos_list.set("srsDimension", "2")
            interior_pos_list.text = self.coordinates_to_pos_list(interior_coords)

        return polygon

    def create_multipolygon_geometry(self, geometry: Dict) -> ET.Element:
        """Create GML MultiSurface element"""
        multisurface = ET.Element("{http://www.opengis.net/gml/3.2}MultiSurface")
        multisurface.set("srsName", "EPSG:4326")

        for polygon_coords in geometry.get('coordinates', []):
            surface_member = ET.SubElement(multisurface, "{http://www.opengis.net/gml/3.2}surfaceMember")

            # Create individual polygon
            polygon = ET.SubElement(surface_member, "{http://www.opengis.net/gml/3.2}Polygon")

            if polygon_coords:
                # Exterior ring
                exterior = ET.SubElement(polygon, "{http://www.opengis.net/gml/3.2}exterior")
                linear_ring = ET.SubElement(exterior, "{http://www.opengis.net/gml/3.2}LinearRing")
                pos_list = ET.SubElement(linear_ring, "{http://www.opengis.net/gml/3.2}posList")
                pos_list.set("srsDimension", "2")
                pos_list.text = self.coordinates_to_pos_list(polygon_coords[0])

                # Interior rings
                for interior_coords in polygon_coords[1:]:
                    interior = ET.SubElement(polygon, "{http://www.opengis.net/gml/3.2}interior")
                    interior_ring = ET.SubElement(interior, "{http://www.opengis.net/gml/3.2}LinearRing")
                    interior_pos_list = ET.SubElement(interior_ring, "{http://www.opengis.net/gml/3.2}posList")
                    interior_pos_list.set("srsDimension", "2")
                    interior_pos_list.text = self.coordinates_to_pos_list(interior_coords)

        return multisurface
