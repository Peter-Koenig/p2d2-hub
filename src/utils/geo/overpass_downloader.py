#!/usr/bin/env python3
import requests
import json
import logging
import time
from typing import Dict, List

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OverpassDownloader:
    """Simple Overpass API client with load balancing"""

    ENDPOINTS = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass.openstreetmap.ru/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://z.overpass-api.de/api/interpreter"
    ]

    def __init__(self, timeout=180):
        self.timeout = timeout
        self.current_endpoint = 0

    def build_query(self, municipality_name: str, admin_level: int) -> str:
        """Build simple area-based Overpass query"""
        return f'''[out:json][timeout:{self.timeout}];
area[name="{municipality_name}"]->.searchArea;
(
  relation[boundary=administrative][admin_level={admin_level}](area.searchArea);
);
out geom;'''

    def query_overpass(self, query: str) -> Dict:
        """Execute Overpass query with load balancing"""
        for attempt in range(3):
            endpoint = self.ENDPOINTS[self.current_endpoint]
            self.current_endpoint = (self.current_endpoint + 1) % len(self.ENDPOINTS)

            try:
                logger.info(f"Attempt {attempt + 1}/3 using endpoint: {endpoint}")

                response = requests.post(
                    endpoint,
                    data=query,
                    headers={'Content-Type': 'text/plain'},
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    element_count = len(data.get('elements', []))
                    logger.info(f"Successfully fetched {element_count} elements")
                    return data
                else:
                    logger.warning(f"HTTP {response.status_code} from {endpoint}")

            except Exception as e:
                logger.warning(f"Request failed: {e}")
                if attempt < 2:  # Don't sleep on last attempt
                    time.sleep(2 ** attempt)  # Exponential backoff

        raise Exception("All Overpass endpoints failed")

    def download_admin_level(self, municipality_name: str, admin_level: int) -> Dict:
        """Download admin polygons for specific level"""
        query = self.build_query(municipality_name, admin_level)
        return self.query_overpass(query)

    def download_cemeteries(self, municipality_name: str) -> Dict:
        """Download cemetery polygons for municipality"""
        query = self.build_cemetery_query(municipality_name)
        return self.query_overpass(query)

    def build_cemetery_query(self, municipality_name: str) -> str:
        """Build cemetery query"""
        return f"""
[out:json][timeout:{self.timeout}];
area[name="{municipality_name}"]->.searchArea;
(
  way[landuse=cemetery](area.searchArea);
  relation[landuse=cemetery][type=multipolygon](area.searchArea);
);
out geom;
"""
