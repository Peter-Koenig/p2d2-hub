# Geodateninfrastruktur (GDI) - p2d2 Architektur

Stand: 27.10.2025
- WiP
- Prototypische Entwicklung
- aktuell am Beispiel [Friedhof Rheinkassel](https://osm.org/go/0GDpvHY26--?m=)

## Überblick

Die p2d2-Geodateninfrastruktur ist eine standardkonforme, skalierbare GDI-Lösung für die Erfassung, Verwaltung und Bereitstellung von Friedhofsdaten in Kommunen. Die Architektur folgt den Prinzipien der [GDI-DE (Geodateninfrastruktur Deutschland)](https://www.gdi-de.org/) und setzt auf offene Standards des [Open Geospatial Consortium (OGC)](https://www.ogc.org/standards).

## Definition Geodateninfrastruktur

Nach dem Geodatenzugangsgesetz (GeoZG) ist eine Geodateninfrastruktur:

> "Eine Infrastruktur bestehend aus Geodaten, Metadaten und Geodatendiensten, Netzdiensten und -technologien, Vereinbarungen über gemeinsame Nutzung, über Zugang und Verwendung sowie Koordinierungs- und Überwachungsmechanismen, -prozesse und -verfahren mit dem Ziel, Geodaten verschiedener Herkunft interoperabel verfügbar zu machen."

## Architektur-Komponenten

### 1. Datenhaltung (Storage Layer)

**PostgreSQL/PostGIS-Datenbank**
- **Zweck:** Persistente Speicherung aller raumbezogenen Daten
- **Technologie:** PostgreSQL 15+ mit PostGIS 3.4+ Extension
- **Datenmodell:** Container-Konzept (einheitliches Schema für Cemetery, Grabflur, Verwaltungsgrenzen)
- **Koordinatensysteme:** EPSG:25832 (primär), EPSG:3857, EPSG:4326

**GeoTIFF-Rasterdaten**
- **Zweck:** Georeferenzierte Friedhofspläne als Hintergrundkarten
- **Format:** Cloud-Optimized GeoTIFF (COG), 8-Bit Grayscale
- **Auflösung:** ~0.02 m/Pixel (native Scanauflösung)
- **Pyramidisierung:** 5 Overview-Levels mit Nearest-Neighbor-Resampling
- **Komprimierung:** DEFLATE, Tiled (512×512px Blocks)
- **Speicherort:** `/srv/geoserver/data/friedhofsplaene/`

### 2. Geodatenserver (Service Layer)

**GeoServer 2.24+**
- **Rolle:** OGC-konformer Geodatenserver
- **Services:**
  - WMS 1.3.0 (Web Map Service) - Kartenansicht
  - WFS 2.0.0 (Web Feature Service) - Vektorgeometrien
  - WFS-T (Transactional) - Live-Editing (in Entwicklung)
- **Projections:** On-the-fly Reprojection zwischen EPSG:25832, 3857, 4326
- **Styling:** SLD 1.0 (Styled Layer Descriptor) für Transparenz und Symbolisierung
- **Endpoint:** `http://192.168.xxx.yyy:8080/geoserver/`
- **Workspaces:**
  - `Verwaltungsdaten` (WFS-Features: Friedhöfe, Gräber)
  - `friedhofsplaene` (WMS-Raster: GeoTIFF-Layer)

**GeoServer-Konfiguration Highlights**
- **Coverage Stores:** Einzelne GeoTIFFs oder ImageMosaic für Multi-Friedhof-Support
- **Default Interpolation:** Nearest Neighbor (kritisch für Schwarz-Weiß-Pläne)
- **SLD-Style:** `friedhofsplan_transparent` wandelt Weiß → Transparent

### 3. Caching & Performance (Middleware Layer)

**MapProxy 1.16+**
- **Rolle:** Tile-Caching, Request-Aggregation, CORS-Proxy, OSM-Tile-Integration
- **Cache-Strategie:**
  - File-basierter Cache unter `/srv/mapproxy/cache_data/`
  - TMS (Tile Map Service) Directory-Layout
- **Grids:**
  - `nrw_grid` (EPSG:25832, 20 Zoom-Levels, √2-Faktor)
  - `friedhofsplan_grid_utm32` (High-Resolution, 9 Levels, 4.0 → 0.0078 m/px)
  - `osm_grid` (EPSG:3857, Web Mercator für OSM-Tiles)
- **Resampling:** Nearest Neighbor (konsistent mit GeoServer)
- **Endpoint:** `https://ows.data-dna.eu/`
- **Services:** WMS, WMTS, TMS

#### OSM-Tileserver-Integration

**Status:** Infrastruktur bereitgestellt, noch nicht produktiv

MapProxy dient als Proxy/Cache-Layer für einen lokalen OSM-Tileserver, um langfristig die öffentlichen OSM-Server zu entlasten:

**Aktueller Zustand:**
- **Upstream:** OSM-Community-Tiles (`tile.openstreetmap.org`) via MapProxy-Durchleitung
- **Lokaler Tileserver:** Aufgebaut (mod_tile + Mapnik + OSM-Datenbank), aber nicht aktiviert
- **Endpoint:** `http://192.168.xxx.yyy:8080/tile/%(z)s/%(x)s/%(y)s.png` (intern)

**MapProxy-Konfiguration (aktuell):**
```
sources:
  osm_source:
    type: tile
    grid: osm_grid
    url: http://192.168.xxx.yyy:8080/tile/%(z)s/%(x)s/%(y)s.png  # Lokaler Tileserver (vorbereitet)
    # url: http://a.tile.openstreetmap.org/%(z)s/%(x)s/%(y)s.png  # Fallback zu OSM
    http:
      headers:
        User-Agent: "p2d2-MapProxy/1.0"

grids:
  osm_grid:
    srs: 'EPSG:3857'
    bbox: [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
    origin: 'nw'
```

**Geplante Migration:**
1. **Phase 1 (aktuell):** OSM-Community-Tiles + lokales MapProxy-Caching
   - Vorteil: Reduzierte Last auf OSM durch MapProxy-Cache
   - Nachteil: Initial Requests gehen noch zu OSM

2. **Phase 2 (geplant):** Lokaler Tileserver produktiv
   - **Stack:** PostgreSQL/PostGIS + osm2pgsql + Mapnik + mod_tile
   - **Daten:** OSM-Extract für NRW (~5 GB PBF, wöchentliches Update)
   - **Seeding:** Pre-Caching für Köln/NRW bis Zoom-Level 16
   - **Vorteil:** Vollständige Unabhängigkeit, keine Last auf OSM-Community

3. **Phase 3 (Zukunft):** Custom OSM-Styles
   - Angepasste Kartenstylings für Friedhofskontext
   - Hervorhebung von Points of Interest (Friedhöfe, öffentliche Gebäude)

**Motivation:**
Die Nutzung öffentlicher OSM-Tileserver ist laut [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) nur für leichte bis moderate Nutzung vorgesehen. Für produktive Anwendungen mit vielen Nutzern empfiehlt die OSM-Community den Betrieb eines eigenen Tileservers oder die Nutzung kommerzieller Anbieter. Mit der lokalen Infrastruktur folgen wir diesem Best Practice und entlasten die Community-Ressourcen nachhaltig.

**Technische Details (Lokaler Tileserver):**
- **Software:** mod_tile + renderd + Mapnik
- **Datenbank:** PostgreSQL 15 + PostGIS 3.4 mit OSM-Schema
- **Speicherbedarf:** ~50 GB für NRW-Datenbank, ~200 GB für Tile-Cache
- **Update-Strategie:** osmosis für tägliche Diff-Updates
- **Dokumentation:** Siehe `docs/OSM-TILESERVER.md` (in Vorbereitung)

**MapProxy-Konfiguration für Friedhofspläne:**
```
sources:
  friedhofsplan_rheinkassel_wms:
    type: wms
    req:
      url: http://192.168.xxx.yyy:8080/geoserver/wms
      layers: friedhofsplaene:rheinkassel_friedhof
      styles: friedhofsplan_transparent
    coverage:
      bbox: [355079.917, 5656115.018, 355310.314, 5656324.347]
      srs: 'EPSG:25832'

grids:
  friedhofsplan_grid_utm32:
    srs: 'EPSG:25832'
    bbox:
    res: [4.0, 2.0, 1.0, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625]
```

### 4. Frontend (Presentation Layer)

**Astro 4.x + OpenLayers 9.x**
- **Kartenbibliothek:** OpenLayers 9.1+ (modernes WebGL-Rendering)
- **Layer-Typen:**
  - `ImageWMS` für Friedhofspläne (Aspect-Ratio-korrekt)
  - `TileWMS` für Basemaps (Luftbild, OSM)
  - `VectorLayer` für WFS-Features (Cemetery-Polygone, Grabfluren)
- **Koordinatensystem-Handling:**
  - Dynamischer CRS-Switch (EPSG:3857 ↔ EPSG:25832)
  - Scale-preserving View-Transitions
  - UTM-Resolution-Arrays für korrekte Zoom-Levels

**Layer-Hierarchie (Z-Index)**
```
Z-Index 15: Labels (geplant)
Z-Index 10: WFS Features (Cemetery-Polygone, Grabfluren)
Z-Index  5: Friedhofsplan (ImageWMS)
Z-Index  1: Luftbild (TileWMS)
Z-Index  0: Basemap (TileWMS)
```

**Frontend-Konfiguration**
```
const friedhofsplanLayer = new ImageLayer({
  source: new ImageWMS({
    url: 'https://ows.data-dna.eu/service',
    params: {
      'LAYERS': 'friedhofsplan_rheinkassel',
      'FORMAT': 'image/png',
      'TRANSPARENT': true,
      'VERSION': '1.1.1',
    },
    projection: 'EPSG:25832',
    serverType: 'geoserver',
    ratio: 1.0, // Kein Oversampling
  }),
  extent: [355079.917, 5656115.018, 355310.314, 5656324.347],
  zIndex: 5,
  opacity: 0.7,
  visible: true,
});
```

## Datenfluss

### Kartenansicht (WMS)
```
Browser (OpenLayers)
  ↓ GetMap-Request (EPSG:25832, BBOX, WIDTH, HEIGHT)
MapProxy (ows.data-dna.eu)
  ↓ Cache-Lookup (Tile-Grid)
  ├─ Cache Hit → Tile zurück
  └─ Cache Miss → Forward zu GeoServer
     GeoServer
       ↓ GeoTIFF-Rendering (Nearest-Neighbor)
       ↓ SLD-Styling (Transparenz)
       └─ PNG-Response
     MapProxy
       ↓ Tile-Cache (speichern)
       └─ Tile zurück
Browser
  └─ Anzeige im Canvas
```

### Feature-Abfrage (WFS)
```
Browser (OpenLayers VectorLayer)
  ↓ GetFeature-Request (CQL_FILTER, outputFormat=json)
WFS-Proxy (/api/wfs-proxy)
  ↓ Basic-Auth-Injection
GeoServer WFS
  ↓ SQL-Query zu PostGIS
PostGIS
  └─ GeoJSON-Response
Browser
  └─ VectorLayer-Rendering
```

### Feature-Bearbeitung (WFS-T, geplant)
```
Browser (Draw/Modify-Interactions)
  ↓ WFS-T Transaction (XML)
GeoServer WFS-T
  ↓ INSERT/UPDATE/DELETE
PostGIS
  └─ Geometrien persistiert
```

## Technische Spezifikationen

### Koordinatensysteme

| EPSG-Code | Name | Verwendung | Extent (Deutschland) |
|-----------|------|------------|---------------------|
| **25832** | ETRS89 / UTM Zone 32N | Primär (NRW, Köln) | [277000, 5580000, 510000, 5820000] |
| **3857** | Web Mercator | Basemaps (OSM, Luftbild) | Weltweit |
| **4326** | WGS 84 | Datenimport/-export | [-180, -90, 180, 90] |

### OGC-Standards

| Standard | Version | Verwendung | Endpoint |
|----------|---------|------------|----------|
| WMS | 1.3.0 | Kartenansicht (Raster) | `/geoserver/wms` |
| WFS | 2.0.0 | Feature-Download | `/geoserver/ows` |
| WFS-T | 2.0.0 | Feature-Editing | `/geoserver/ows` (geplant) |
| WMTS | 1.0.0 | Tile-Service | `/service?SERVICE=WMTS` |
| TMS | 1.0.0 | Tile-Service (REST) | `/tiles/` |
| SLD | 1.0.0 | Kartenstyling | `/geoserver/styles/` |

### Performance-Optimierungen

1. **GeoTIFF-Optimierung**
   - Cloud-Optimized Format (COG) für HTTP-Range-Requests
   - Tiled Struktur (512×512px) für schnellen Partial-Read
   - DEFLATE-Kompression (~60% Platzeinsparung)
   - Overviews mit Nearest-Neighbor (keine Qualitätsverluste)

2. **MapProxy-Caching**
   - Meta-Tiles (4×4) für reduzierten Overhead
   - Seeding-Strategien für Hotspots
   - Cache-Invalidierung bei Datenänderungen

3. **Frontend-Optimierung**
   - ImageWMS statt TileWMS (1 Request statt 10-20)
   - Custom Resolution-Arrays für präzise Zoom-Levels
   - Layer-Interaktion-Manager (Long-Press für Opacity)

## Sicherheit & Zugriffskontrolle

### Aktuelle Implementierung
- **Read-Only WFS:** Basic Authentication (temporäre Credentials)
- **WMS:** Public Access (keine Auth erforderlich)
- **MapProxy CORS:** Aktiviert für Browser-Requests

### Geplant (Issue #1)
- **Anonymous GeoServer Access** für public Geodaten
- **WFS-T Authentication** via OAuth2/OIDC
- **Role-Based Access Control (RBAC)** für sensitive Daten

## Skalierbarkeit & Erweiterungen

### Aktueller Zustand
- **1 Friedhof** (Rheinkassel, 230m×210m)
- **1 GeoTIFF** (~11.000×10.000 Pixel)

### Zukünftige Erweiterungen
1. **Multi-Friedhof-Support**
   - GeoServer ImageMosaic für alle Kölner Friedhöfe
   - Dynamisches Extent [356000, 5644000, 362000, 5653000]
   - Automatische Index-Generierung

2. **Weitere Datenschichten**
   - Grabsteine (Point-Features)
   - Bepflanzung (Polygon-Features)
   - Verwaltungsgrenzen (OSM-Import)

3. **WFS-T Live-Editing**
   - Browser-basierte Geometrie-Erfassung
   - Conflict-Resolution bei gleichzeitigen Edits
   - Historisierung & Rollback

## Deployment & Operations

### Infrastruktur
- **Virtualisierung:** Proxmox VE 8.x
- **Netzwerk:** OPNsense Firewall
- **CI/CD:** GitLab CI (Webhook-basiert)
- **Monitoring:** Uptime-Checks, Log-Aggregation

### URLs
- **Production:** `https://www.data-dna.eu`
- **Development:** `https://dev.data-dna.eu`
- **Operations:** `https://opn.data-dna.eu` (Feature-Editor)
- **OWS-Endpoint:** `https://ows.data-dna.eu`

### Backup-Strategie
- **PostGIS:** Tägliches pg_dump (Full + Incrementals)
- **GeoTIFFs:** Versionskontrolle + Offsite-Backup
- **GeoServer-Config:** Git-Repository

## Konformität & Standards

- ✅ **GDI-DE-konform:** Interoperabilität mit deutschen GDI-Systemen (angestrebt)
- ✅ **INSPIRE-kompatibel:** Metadaten nach ISO 19115 (angestrebt)
- ✅ **OGC-Standards:** WMS, WFS, WMTS, SLD
- ✅ **Open Source:** Alle Komponenten unter OSI-approved Lizenzen

## Ressourcen

- **GDI-DE Architektur:** [https://www.gdi-de.org/](https://www.gdi-de.org/)
- **OGC Standards:** [https://www.ogc.org/standards](https://www.ogc.org/standards)
- **GeoServer Docs:** [https://docs.geoserver.org/](https://docs.geoserver.org/)
- **MapProxy Docs:** [https://mapproxy.org/docs/](https://mapproxy.org/docs/)
- **OpenLayers API:** [https://openlayers.org/](https://openlayers.org/)
- **OSM Tile Usage Policy:** [https://operations.osmfoundation.org/policies/tiles/](https://operations.osmfoundation.org/policies/tiles/)
- **MapProxy OSM Integration:** [https://wiki.openstreetmap.org/wiki/MapProxy](https://wiki.openstreetmap.org/wiki/MapProxy)

---

**Version:** 1.0.0 (Oktober 2025)
**Maintainer:** p2d2 Team
**Lizenz:** MIT (Code), ODbL (Daten)

Diese vollständige Dokumentation kann direkt als `docs/GDI-ARCHITEKTUR.md` im Repository gespeichert werden und enthält alle URLs als Inline-Links statt Fußnoten.

[1](https://www.markdownguide.org/extended-syntax/)
[2](https://www.markdownguide.org/basic-syntax/)
[3](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks)
[4](https://www.jetbrains.com/help/hub/markdown-syntax.html)
[5](https://www.codecademy.com/resources/docs/markdown/code-blocks)
[6](https://learn.microsoft.com/en-us/azure/devops/project/wiki/markdown-guidance?view=azure-devops)
[7](https://confluence.atlassian.com/spaces/BitbucketServer/pages/776639995/Markdown+syntax+guide)
[8](https://docs.github.com/github/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)
[9](https://docs.stoplight.io/docs/platform/07adf9e4c3f3a-use-markdown-in-documentation)
[10](https://commonmark.org/help/tutorial/09-code.html)
