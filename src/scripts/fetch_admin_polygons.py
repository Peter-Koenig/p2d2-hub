# SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
# SPDX-License-Identifier: EUPL-1.2
# p2d2: OSM-Overpass-Skript: Verwaltungsgrenzen laden

#!/usr/bin/env python3
import sys
import os
import json
import argparse
import subprocess
import tempfile
import logging
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.geo.overpass_downloader import OverpassDownloader
from utils.geo.gml_converter import GMLConverter

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def convert_to_geojson(overpass_data: dict) -> dict:
    """Convert Overpass response to GeoJSON using local osmtogeojson"""
    import tempfile
    import os
    from pathlib import Path

    # Find project root (where package.json liegt)
    script_dir = Path(__file__).parent.parent.parent  # /src/scripts -> /src -> /
    node_modules_path = script_dir / "node_modules" / ".bin" / "osmtogeojson"

    # Fallback für globale Installation
    osmtogeojson_cmd = str(node_modules_path) if node_modules_path.exists() else "osmtogeojson"

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
        json.dump(overpass_data, temp_file)
        temp_path = temp_file.name

    try:
        result = subprocess.run([
            osmtogeojson_cmd, temp_path
        ], capture_output=True, text=True, check=True)

        return json.loads(result.stdout)
    except FileNotFoundError:
        raise Exception(f"osmtogeojson not found. Install with: npm install osmtogeojson")
    finally:
        os.unlink(temp_path)



def main():
    parser = argparse.ArgumentParser(description="Download OSM Admin Polygons via Overpass API")
    parser.add_argument('--kommune', required=True, help="Kommune name (e.g., 'Frankfurt (Oder)')")
    parser.add_argument('--levels', required=True, help="Admin levels comma-separated (e.g., '8,9,10')")
    parser.add_argument('--output-dir', default='/tmp', help="Output directory (default: /tmp)")
    parser.add_argument('--debug', action='store_true', help="Show debug info including queries")

    args = parser.parse_args()

    # Parse admin levels
    try:
        admin_levels = [int(level.strip()) for level in args.levels.split(',')]
    except ValueError as e:
        logger.error(f"Invalid admin levels format: {e}")
        return 1

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True, parents=True)

    # Initialize downloader
    downloader = OverpassDownloader()
    gml_converter = GMLConverter()

    result = {
        "status": "success",
        "municipality": args.kommune,
        "files": {},
        "polygon_counts": {}
    }

    try:
        for level in admin_levels:
            logger.info(f"Downloading admin level {level} for {args.kommune}")

            # Build and show query if debug mode
            if args.debug:
                query = downloader.build_query(args.kommune, level)
                print("=" * 50)
                print("=== Overpass Query ===")
                print(query)
                print("=" * 50)

            # Download data
            overpass_data = downloader.download_admin_level(args.kommune, level)

            # Convert to GeoJSON
            geojson_data = convert_to_geojson(overpass_data)

            # Extract only polygon features
            polygon_features = gml_converter.extract_polygon_features(geojson_data)

            # Convert to standard GML (for QGIS)
            gml_content = gml_converter.convert_to_gml(polygon_features, args.kommune, level)

            # Save standard GML file
            gml_output_file = output_dir / f"{args.kommune.lower().replace(' ', '_').replace('(', '').replace(')', '')}_admin_level_{level}.gml"
            with open(gml_output_file, 'w', encoding='utf-8') as f:
                f.write(gml_content)

            # Convert to WFS-T GML for direct database insertion
            wfst_gml_content = gml_converter.convert_to_wfst_gml(polygon_features, args.kommune, level, "administrative")

            # Save WFS-T GML file
            wfst_gml_output_file = output_dir / f"{args.kommune.lower().replace(' ', '_').replace('(', '').replace(')', '')}_admin_level_{level}_wfst.gml"
            with open(wfst_gml_output_file, 'w', encoding='utf-8') as f:
                f.write(wfst_gml_content)

            # Save GeoJSON file (for debugging)
            output_file = output_dir / f"{args.kommune.lower().replace(' ', '_').replace('(', '').replace(')', '')}_admin_level_{level}.geojson"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(geojson_data, f, indent=2, ensure_ascii=False)

            # Update result
            feature_count = len(geojson_data.get('features', []))
            result["files"][str(level)] = str(output_file)
            result["gml_files"] = result.get("gml_files", {})
            result["gml_files"][str(level)] = str(gml_output_file)
            result["wfst_files"] = result.get("wfst_files", {})
            result["wfst_files"][str(level)] = str(wfst_gml_output_file)
            result["polygon_counts"][str(level)] = feature_count

            logger.info(f"Saved {len(polygon_features)} polygon features to {gml_output_file}, {wfst_gml_output_file} and {output_file}")

    except Exception as e:
        logger.error(f"Download failed: {e}")
        result["status"] = "error"
        result["error"] = str(e)
        return 1

    # Output JSON result for TypeScript integration
    print(json.dumps(result, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
