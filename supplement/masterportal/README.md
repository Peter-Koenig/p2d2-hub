# supplement/masterportal

Dieser Ordner ist die Quelle für das **Default-Masterportal** einer p2d2-Stage im
Add-on-Modus (CIVITAS/CORE V1s, später V2/Helm). Er ist bewusst **kein** Teil des
Astro-Builds: die Standalone-Anwendung ignoriert ihn vollständig.

## Zweck

- **Add-on-Modus:** Der Masterportal-Baustein (`overlay_addon_V1s/k8s/masterportal`)
  bezieht `portal/`, `addons/` und `README.md` aus diesem Ordner des Stage-Branches.
- **Standalone:** Astro verarbeitet nur `src/` und `public/`; `supplement/` liegt
  außerhalb und wird weder von `tsconfig` noch von Tailwind (`@source ../**`),
  Vitest oder npm-Workspaces erfasst.

## Aufbau

```text
supplement/masterportal/
├── portal/
│   ├── index.html          # Einstiegspunkt (Seitentitel stage-spezifisch)
│   ├── config.js.template  # Laufzeit-Konfiguration (envsubst-Platzhalter)
│   ├── resources/
│   │   ├── portal-config-p2d2.json  # Portal-Konfiguration (portalConf), stage-spezifisch
│   │   ├── services-p2d2.json       # Layer-Definitionen (layerConf), stage-spezifisch
│   │   ├── style_v3.json            # Styles (styleConf)
│   │   └── img/                     # Bilder, u. a. p2d2-logo.svg
│   └── localdata/          # Demodaten
├── addons/
│   ├── addonsConf.json     # leeres Objekt (Customizing folgt separat)
│   └── p2d2FeatureEditor/
│       └── js/editorUrl.js # URL-Bau für den Astro-Feature-Editor (noch ohne Wirkung)
└── README.md
```

## Ablauf

1. Der Ordner liegt im **Stage-Branch** des p2d2-Repos. Die Inhalte sind
   **stage-spezifisch**: Stage de1 weicht mit eigener Portal-Konfiguration,
   eigenen Layern, Titel und Logo von den übrigen Stages ab. Bei Merges zwischen
   Stage-Branches ist `supplement/masterportal/` daher gezielt zu prüfen bzw.
   auszunehmen, damit keine Layer, Hosts oder Kartenausschnitte einer anderen
   Stage übernommen werden.
2. Beim Masterportal-Build wird der Stage-Branch genau einmal flach geklont
   (`addon_stage_checkout`, `modules_addon_V1s/addon_30_frontend.sh`). Der
   Image-Tag wird über die Tree-Hash dieses Ordners
   (`git rev-parse HEAD:supplement/masterportal`) gebildet.
3. Beim Containerstart wird `portal/config.js.template` per `envsubst` nach
   `/var/run/masterportal/config.js` gerendert (emptyDir) und von nginx unter
   `/masterportal/config.js` ausgeliefert. Das Portal einer Stage liegt unter
   `https://<frontend-host>/masterportal/` (ohne Stage-Segment; der Host
   bestimmt die Stage). Stage- und domainabhängige Werte kommen aus der
   ConfigMap `masterportal-<stage>-config`.

## Laufzeit-Variablen (config.js)

| Variable | Quelle |
|---|---|
| `IDM_HOST` | `idm.${ADDON_DOMAIN}` |
| `IAM_REALM` | `ADDON_IAM_REALM` (Standard `cc-prd`) |
| `OIDC_CLIENT_ID` | `geostack_public` (CIVITAS/CORE-Public-Client) |
| `OIDC_REDIRECT_URI` | `https://<frontend-host>/masterportal/` |
| `INTERCEPTOR_URL_REGEX` | `https://(geoportal|<host-prefix>)[.]<domain-mit-[.]>/` |
| `PORTAL_BACKEND_ORIGIN` | `https://geoportal.${ADDON_DOMAIN}` |

## Eigene Konfigurationsdateien und Proxy-Regel

Das nginx im Masterportal-Pod leitet genau diese Pfade an das CIVITAS-Portal-
Backend weiter (nginx-Vorlage `overlay_addon_V1s/k8s/masterportal/nginx/templates/default.conf.template`
im Repository `civitas_einrichtung`):

- `/masterportal/config.json`
- `/masterportal/resources/services-internet.json`
- `/masterportal/resources/rest-services-internet.json`

Alle anderen Pfade unter `/masterportal/` werden statisch aus dem Stage-Ordner
ausgeliefert. Eigene Dateien tragen deshalb Namen, die **nicht** auf diese Regel
passen; `config.js.template` verweist darauf:

| Schlüssel (config.js) | Datei | Herkunft |
|---|---|---|
| `portalConf` | `./resources/portal-config-p2d2.json` | statisch, dieser Ordner |
| `layerConf` | `./resources/services-p2d2.json` | statisch, dieser Ordner |
| `styleConf` | `./resources/style_v3.json` | statisch, dieser Ordner |
| `restConf` | `./resources/rest-services-internet.json` | Portal-Backend (Proxy) |

Pfade werden relativ zur Portal-URL aufgelöst (`/masterportal/`). Nur
`config.js` wird zur Laufzeit gerendert; JSON-Dateien werden unverändert
ausgeliefert.

## Add-ons (`addons/`)

`addons/p2d2FeatureEditor/js/editorUrl.js` ist ein reines ES-Modul ohne
Imports, DOM, Vue oder OpenLayers. Es baut die Editor-URL
`/feature-editor/<name>?wp_name=…&container_type=…&name=…&extent=…&projection=…`
sowie CQL und Proxy-URL der Kinderprüfung (Grabflure). Das Fenster mit dem
Astro-Feature-Editor öffnet später ein GFI-Theme, das dieses Modul nutzt.

- Ohne Eintrag in `addonsConf.json` wird das Modul nicht gebündelt; das Portal
  verhält sich unverändert. Der Build bricht dadurch nicht ab.
- Der Ordner `p2d2FeatureEditor/` gilt für den Image-Build trotzdem als
  „wirksames“ Add-on: `ADDONS_SHA` ist gesetzt und geht in den Image-Tag ein,
  und die Dateien werden nach `/src/addons/` kopiert.
- Vertragstest gegen die Zielseite, `EditorState.ts`, `crs.ts` und
  `services-p2d2.json`: `src/tests/masterportal-editor-contract.test.ts`.

## Stage de1: Inhalte

- Hintergrundkarte: MapProxy-Layer `p2d2_osm` (WMS
  `https://geoportal.udp.data-dna.eu/mapserver/service`), Karte in EPSG:25832.
- Fachlayer: Friedhöfe Köln als GeoJSON über den Stage-Proxy
  `/api/wfs-proxy?url=<kodierte WFS-URL>` (GeoServer-Workspace `de1`,
  `typeName=geo-containers`, CQL-Filter auf Köln/`cemetery`/`osm_admin_level=8`,
  Daten in EPSG:4326, Umprojektion im Client). Style `p2d2_friedhof` in
  `style_v3.json`.
- Kartenausschnitt: Zentrum Kölner Dom, `extent` = Stadtgebiet Köln
  (`[minX, minY, maxX, maxY]`, EPSG:25832). Der `extent` begrenzt nur den
  Kartenmittelpunkt.

**Feste Hostnamen:** `geoportal.udp.data-dna.eu` steht fest in
`services-p2d2.json` (MapProxy-URL und innere WFS-URL); es gibt kein Templating
für JSON-Dateien. Bei einer anderen Domain sind diese Einträge anzupassen.
