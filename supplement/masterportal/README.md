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
│   │   ├── p2d2-editor-config.json  # Add-on p2d2FeatureEditor je Layer-ID, stage-spezifisch
│   │   ├── style_v3.json            # Styles (styleConf)
│   │   └── img/                     # Bilder, u. a. p2d2-logo.svg
│   └── localdata/          # Demodaten
├── addons/
│   ├── addonsConf.json     # registriert p2d2FeatureEditor (Typ javascript)
│   └── p2d2FeatureEditor/  # Klick auf Feature öffnet den Astro-Feature-Editor
│       ├── index.js
│       └── js/             # clickFlow, editorUrl, editorConfig, editorDialog
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

### p2d2FeatureEditor (Typ `javascript`)

Ein Klick auf ein Feature eines konfigurierten Layers verhält sich wie in der
Standalone-Karte (`src/utils/feature-popup-handler.ts`):

1. Prüfung per WFS (über den Stage-Proxy, `count=1`), ob Kind-Features
   existieren (z. B. Grabflure eines Friedhofs).
2. Mit Treffern öffnet sich der Astro-Feature-Editor in einem eigenen Fenster
   (`/feature-editor/<name>?wp_name=…&container_type=…&name=…&extent=…&projection=…&osm_admin_level=…`).
3. Ohne Treffer, bei Fehler, bei Zeitüberschreitung oder blockiertem Fenster
   erscheint ein modaler Info-Dialog. Bei Zeitüberschreitung und blockiertem
   Fenster enthält er den Button „Editor öffnen“ (neue Nutzergeste).
   Ein Klick daneben oder Escape schließt ihn.
4. Die Karte zoomt in jedem Fall auf das Feature.

Für die konfigurierten Layer ist das GFI abgeschaltet (`gfiAttributes: "ignore"`
in `services-p2d2.json`), damit kein zweites Fenster erscheint.

| Datei | Inhalt |
|---|---|
| `addonsConf.json` | Eintrag `{"p2d2FeatureEditor": {"type": "javascript"}}` |
| `p2d2FeatureEditor/index.js` | Einstieg: wartet auf die 2D-Karte, Klick-Listener, Zoom |
| `p2d2FeatureEditor/js/clickFlow.js` | reiner Ablauf (Kinderprüfung, Fenster, Zeitlimit) |
| `p2d2FeatureEditor/js/editorUrl.js` | Editor-URL, CQL, Proxy-URL |
| `p2d2FeatureEditor/js/editorConfig.js` | `validateConfig` |
| `p2d2FeatureEditor/js/editorDialog.js` | Info-Dialog (`<dialog>`, nur `textContent`) |

Das Add-on wird nur aktiv, wenn es zusätzlich in `config.js.template` unter
`addons` steht.

### Konfiguration `portal/resources/p2d2-editor-config.json`

Das JavaScript enthält keine Fachwerte (Typen, Layer-Namen, Level,
Proxy-Pfad, Fenstermaße). Sie stehen je Layer-ID aus `services-p2d2.json` in
`p2d2-editor-config.json`. Die Datei wird zur Laufzeit relativ zur Portal-Seite
geladen und passt nicht auf die Proxy-Regel des nginx. `validateConfig` wirft
bei fehlenden oder falsch typisierten Pflichtschlüsseln, es gibt keine stillen
Standardwerte.

| Schlüssel | Bedeutung |
|---|---|
| `wfsBase`, `typeName`, `proxyPath` | WFS ohne Query, Feature-Typ, Stage-Proxy |
| `checkTimeoutMs` | Zeitlimit der Kinderprüfung; danach wird abgebrochen (Popup-Frist der Browser beachten) |
| `children.level`, `children.separator`, `children.prefixFields` | Kind-Level, Trenner, Präfixfelder in Reihenfolge |
| `editor.windowNamePrefix`, `editor.windowFeatures` | Fenstername (`<Präfix><name>`) und `window.open`-Merkmale |
| `zoom.padding`, `zoom.durationMs`, `zoom.minZoom`, `zoom.maxZoom` | Rand in Pixeln, Animationsdauer, Grenzen in **Portal-Stufen** (`portal-config-p2d2.json`) |
| `info.fields`, `info.texts` | Anzeigefelder (Schlüssel, Beschriftung) und Texte des Dialogs |

### Weiteren Layer aufnehmen

1. Layer in `services-p2d2.json` anlegen, `gfiAttributes` auf `"ignore"`.
2. Eintrag mit derselben Layer-ID unter `layers` in `p2d2-editor-config.json`.
3. Passt die Kind-Regel (`osm_admin_level=<level> AND wp_name AND
   container_type AND name LIKE '<Präfix><Trenner>%'`) nicht, wird sie in
   `editorUrl.js`/`clickFlow.js` als zusätzliche, konfigurierbare Regel ergänzt.
   Der Astro-Editor muss die Kategorie ebenfalls kennen.
4. Tests: `src/tests/masterportal-supplement.test.ts` prüft Layer-ID,
   `gfiAttributes` und `wfsBase`/`typeName` gegen die Layer-URL.

### Herkunft der Regeln

Admin-Level der Hauptkarte (`getOsmAdminLevel` in `src/utils/wfs-layer-manager.ts`)
und Kind-Regel (`loadGrabflurData` in `src/utils/feature-popup-handler.ts`)
liegen im Standalone-Code. Die Konfiguration bildet sie für die Stage nach;
ändert sich eine Regel dort, muss die Konfiguration nachgezogen werden.

### Bekannte Einschränkungen

- Nur 2D-Karte. Ist ein Werkzeug mit eigenen Karteninteraktionen aktiv
  (Messen, Zeichnen, Auswahl …), reagiert das Add-on nicht – dieselbe Bedingung
  wie beim GFI (`Menu/currentMouseMapInteractionsComponent`).
- Das Editor-Fenster wird nicht für Cross-Window-Events registriert
  (`registerEditorWindow` im Standalone); Änderungen im Editor aktualisieren
  die Masterportal-Karte nicht.
- Öffnet `window.open` erst nach der Kinderprüfung. Dauert sie länger als die
  Popup-Frist des Browsers, blockiert er das Fenster; dafür gibt es den Button.
- `%` und `_` im Präfix wirken als LIKE-Platzhalter (wie im Standalone).
- `ol/proj.js` ist nur transitiv über den Masterportal-Upstream verfügbar.
- Die Zielseite liest `osm_admin_level` noch nicht; der Parameter wird für
  spätere Kategorien schon übergeben.

### Tests

- `src/tests/masterportal-editor-contract.test.ts`: Vertrag mit Zielseite,
  `EditorState.ts`, `crs.ts`, `services-p2d2.json` und dem CQL des Standalone.
- `src/tests/masterportal-editor-flow.test.ts`: Ablauf, `validateConfig`, Zoom.
- `src/tests/masterportal-supplement.test.ts`: Registrierung, keine
  Friedhofskonstanten im Add-on-Code, kein `innerHTML`, Konsistenz der Konfiguration.

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
