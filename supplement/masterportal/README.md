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
│   ├── addonsConf.json     # registriert p2d2FeatureEditor (javascript), p2d2Crs (tool)
│   ├── p2d2FeatureEditor/  # Klick auf Feature öffnet den Astro-Feature-Editor
│   │   ├── index.js
│   │   └── js/             # clickFlow, editorUrl, editorConfig, editorDialog, editorProjection
│   └── p2d2Crs/            # Projektions-Switch (Werkzeug-Menü)
│       ├── index.js, components/, store/, locales/
│       └── js/             # utm, viewSwap, runtime
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
| `p2d2FeatureEditor/js/editorProjection.js` | Projektion der Editor-URL: lokales CRS aus `Modules/P2d2Crs/localCrs`, sonst View-Projektion |

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
   `gfiAttributes` und die Stage-Werte `wfsBase`/`typeName`/`proxyPath`.

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
  die Masterportal-Karte nicht (siehe „Cross-Window-Events“).
- Öffnet `window.open` erst nach der Kinderprüfung. Dauert sie länger als die
  Popup-Frist des Browsers, blockiert er das Fenster; dafür gibt es den Button.
- `%` und `_` im Präfix wirken als LIKE-Platzhalter (wie im Standalone).
- `ol/proj.js` ist nur transitiv über den Masterportal-Upstream verfügbar.
- Die Zielseite liest `osm_admin_level` noch nicht; der Parameter wird für
  spätere Kategorien schon übergeben.

### Cross-Window-Events

- **Heute:** Der Editor sendet seine Ereignisse (`p2d2:editor:*`) per
  `window.opener.postMessage` mit `type: "p2d2:cross-window-event"` an das
  öffnende Fenster, hier das Masterportal (`src/utils/cross-window-events.ts`).
  Das Masterportal hat keinen Empfänger; die Nachrichten werden ignoriert.
  Das Add-on enthält bewusst weder `postMessage` noch einen `message`-Listener.
- **Voraussetzungen:** `window.opener` bleibt erhalten – kein `noopener`, kein
  `noreferrer` (`validateConfig` lehnt beides in `editor.windowFeatures` ab) und
  kein `Cross-Origin-Opener-Policy`-Header an Masterportal oder Editor.
  Masterportal und Editor laufen unter derselben Origin (Ziel der Nachricht ist
  `window.location.origin`).
- **Ausblick:** Eine Empfangs-Bridge, die `p2d2:cross-window-event` im
  Masterportal als Ereignis weiterreicht (z. B. Neuladen des Layers nach
  `p2d2:editor:save:complete`), ist ein eigener Auftrag.
- Test: `src/tests/masterportal-crosswindow-contract.test.ts` prüft das
  Protokoll; `masterportal-supplement.test.ts` prüft die Isolation des Add-ons.

### Tests

- `src/tests/masterportal-editor-contract.test.ts`: Vertrag mit Zielseite,
  `EditorState.ts`, `crs.ts`, `services-p2d2.json` und dem CQL des Standalone.
- `src/tests/masterportal-editor-flow.test.ts`: Ablauf, `validateConfig`, Zoom.
- `src/tests/masterportal-supplement.test.ts`: Registrierung, keine
  Friedhofskonstanten im Add-on-Code, kein `innerHTML`, Konsistenz der Konfiguration.

### p2d2Crs (Typ `tool`): Projektions-Switch

Werkzeug im `secondaryMenu` (erster Eintrag, vor „Karte drucken“). Es schaltet
die 2D-Karte zwischen dem lokalen UTM-CRS (`localCrs`, Default `EPSG:25832`)
und `EPSG:3857` (`genericCrs`) um, wie der Umschalter der Standalone-Karte
(`src/components/MapCanvas.astro`, `toggleCRS`). Die Wahl wird nicht
gespeichert; nach dem Neuladen startet das Portal in der Projektion aus
`portal-config-p2d2.json`.

| Datei | Inhalt |
|---|---|
| `p2d2Crs/index.js` | Einstieg `{component, store, locales}` (Pflicht für Typ `tool`) |
| `p2d2Crs/components/P2d2Crs.vue` | Anzeige und Umschalter, gesperrt außerhalb von 2D |
| `p2d2Crs/store/*` | Modul `Modules/P2d2Crs`: `localCrs`, `genericCrs`, `activeCrs`; Aktionen `toggle`, `setLocalCrs` |
| `p2d2Crs/js/utm.js` | `isUtm`, `utmDefinition` (326xx, 327xx mit `+south`, 258xx mit GRS80; Zone 1–60), `crsLabel`, `createEnsureProjection` |
| `p2d2Crs/js/viewSwap.js` | `targetCrs`, `targetResolution`, `snapResolution`, `buildViewOptions`, `reprojectLayers`, `swapView` |
| `p2d2Crs/js/runtime.js` | einzige Datei mit Masterportal-Importen (masterportalapi `crs`, `ol/View`, `window.mapCollection`) |

Der State setzt kein `hasMouseMapInteractions`. Sonst übernähme das Werkzeug
beim Öffnen die Mausinteraktion, und der `p2d2FeatureEditor` würde keine
Klicks mehr auswerten (`Menu/currentMouseMapInteractionsComponent`).

`setLocalCrs(code)` registriert eine UTM-Zone bei Bedarf und setzt `localCrs`;
die Aktion ist für die Kommunenwahl vorgesehen und wird noch nicht aufgerufen.

#### Ablauf `swapView`

Das Masterportal 3.27.1 kann die Projektion zur Laufzeit nicht wechseln
(`openConfig`/`watchPortalConfig` setzen nur Werte auf die bestehende View).
`swapView` ersetzt deshalb die View und verbindet danach neu:

0. Nur bei `Maps/mode === "2D"` und wenn das Ziel nicht schon aktiv ist.
1. Projektion sicherstellen: UTM-Zonen ohne proj4-Definition über
   masterportalapi `crs.registerProjections` (proj4, OL, GeoServer-Alias,
   Kennung für das Koordinatenwerkzeug). `EPSG:3857` ist in ol und proj4
   eingebaut und steht nicht in `namedProjections`; fehlt es zur Laufzeit,
   bricht der Wechsel ohne Änderung ab.
2. Bodenauflösung am Zentrum erhalten (`getPointResolution`) und auf die
   nächste Stufe der Portal-Tabelle einrasten (`snapResolution`, gleiche Regel
   wie OL `constrainResolution`). In Köln ist 1 m/px in UTM etwa 1,59 m/px in 3857.
3. Neue View wie masterportalapi `createMapView`: dieselbe Tabelle `options`
   (wird View-Property) und `resolutions`, `constrainResolution`,
   `constrainOnlyCenter`, `backgroundImage`, Extent der Portal-Konfiguration
   in die Zielprojektion transformiert, Zentrum transformiert, Rotation erhalten.
4. `map.setView`; übernimmt die Karte die View nicht oder wirft der Aufbau,
   wird die alte View zurückgesetzt.
5. Store und Listener neu verbinden (siehe Liste).
6. Vektorquellen: mit URL oder Loader `refresh()` (der Loader bekommt die neue
   View-Projektion), ohne (Zeichnen, Messen, Inline-Features) Geometrien
   transformieren; Overlays verschieben.
7. Koordinaten der alten Projektion verwerfen: Marker, Highlights, BackForward.

#### Neuverbindungsliste (Masterportal 3.27.1, masterportalapi 2.64.0)

| Teil | Fundstelle | Maßnahme |
|---|---|---|
| Store `Maps/projection`, `resolutions`, `scales`, `initialCenter`, `initialZoom` | `src/core/maps/store/actionsMapsAttributesMapper.js` `setInitialAttributes` (nur beim Start) | `Maps/setProjection`, `setResolutions`, `setScales`, `setInitialCenter` (transformiert), `setInitialZoom` |
| `change:resolution`-Listener (Maßstab, Zoom im Store, Maßstabsleiste) | ebd. `registerMapViewListener` | `Maps/registerMapViewListener`, dann `updateAttributesByChangeResolution`, `updateAttributesByMoveend` |
| Maßstab im Store, Scale-Switcher | ebd. `updateAttributesByChangeResolution`, `src/modules/scaleSwitcher/components/ScaleSwitcher.vue` (`view.get("options")`) | neue View trägt `options` |
| totalView | `src/core/maps/store/actionsMapsInteractions.js` `resetView` | `initialCenter` transformiert |
| GeoJSON-, WFS-, OAF-Layer | masterportalapi `src/layer/vector.js`, `src/layer/wfs.js` (Loader mit View-Projektion) | `refresh()` |
| Zeichnen, Messen, Inline-Features, Overlays | Vektorquellen ohne URL/Loader | Geometrien und Positionen transformieren |
| Marker, Highlights | `src/core/maps/store/actionsMapsMarker.js`, `src/core/maps/js/removeHighlighting.js` | `Maps/removePointMarker`, `removePolygonMarker`, `removeHighlightFeature` |
| BackForward | `src/modules/controls/backForward/store/mutationsBackForward.js` | `Controls/BackForward/setMemory([])`, `setPosition(null)` |
| WMS-Kacheln | `src/core/layers/js/layer2dRasterWms.js` (TileGrid aus den View-Auflösungen) | keine; bleibt gültig, weil die Tabelle gleich bleibt |
| Rotation-Reset-Icon | `src/modules/controls/rotation/components/RotationItem.vue` (`change:rotation` der alten View) | keine; mit `showResetRotationAlways: true` ohne Wirkung |

Andere Teile lesen die View bei jedem Zugriff über `mapCollection.getMapView("2D")`.

#### Grenzen und Risiken

- **R1 Interna:** `swapView` hängt an der View-Property `options`, an den
  Store-Feldern oben und am internen Feld `loader_` von `ol/source/Vector`
  (`isRemoteSource`). Ein Masterportal- oder ol-Update kann das ändern; die
  Tests decken nur das ol des p2d2-Repositorys ab, nicht das des Masterportals.
- **R2 Unbekannte Konsumenten:** Module, die die Projektion zwischenspeichern
  und nicht in der Liste stehen, bleiben auf der alten Projektion.
- **R3 Skizzen:** Zeichnungen und Messungen werden transformiert; Werkzeuge mit
  eigenem Zustand in Kartenkoordinaten können Reste behalten.
- **R4 3D:** Der Umschalter ist außerhalb von 2D gesperrt. Ob der 3D-Modus nach
  einem Wechsel auf 3857 richtig startet, ist ungeprüft (offene Grenze).
- **R5 `openConfig`/`setPortalConfig`:** setzt die Startwerte der
  Portal-Konfiguration (EPSG:25832) auf die aktuelle View. In p2d2 nicht
  konfiguriert.
- **R6 Upstream-Updates:** Die Fundstellen oben gelten für Masterportal 3.27.1
  und masterportalapi 2.64.0 und sind bei einem Update zu prüfen.
- **Druck:** nicht Ziel; das Verhalten des Druckdienstes in EPSG:3857 ist ungeprüft.
- **Maßstab in 3857:** Die Portal-Tabelle gilt nominell; in Köln ist der
  Bodenmaßstab etwa 0,63-mal so groß wie angezeigt.
- **Basiskarte:** Der WMS `p2d2_osm` liefert EPSG:25832, 3857 und 4326; andere
  UTM-Zonen brauchen andere Basiskarten.
- **Editor-URL:** Der `p2d2FeatureEditor` übergibt immer `localCrs`, auch wenn
  die Karte in 3857 steht (`js/editorProjection.js`).

#### Tests

- `src/tests/masterportal-crs-utm.test.ts`: UTM-Codes, Definitionen, Registrierung.
- `src/tests/masterportal-crs-viewswap.test.ts`: Ziel, Bodenauflösung,
  Einrasten (abgeglichen mit dem OL-Konstruktor), View-Optionen, `swapView`
  mit Fakes (Reihenfolge, Rollback, 3D, refresh/transform), Store-Aktionen.
- `src/tests/masterportal-supplement.test.ts`: Registrierung, Menüposition,
  Isolation, kein `hasMouseMapInteractions`.
- `src/tests/masterportal-editor-contract.test.ts`: Editor-URL bleibt bei 3857 UTM.

## Stage de1: Inhalte

- Hintergrundkarte: MapProxy-Layer `p2d2_osm` (WMS
  `https://geoportal.udp.data-dna.eu/mapserver/service`), Karte in EPSG:25832.
- Fachlayer: ein GeoJSON-Layer `p2d2-geo-containers` („Auswahl“) **ohne
  `url`**. Die masterportalapi legt dafür eine leere Quelle an
  (`layer/vector.js` `createVectorSource`); den Inhalt lädt das Add-on
  `p2d2Selector` je Auswahl von Kommune und Kategorie über den Stage-Proxy
  `/api/wfs-proxy?url=<kodierte WFS-URL>` (GeoServer-Workspace `de1`,
  `typeName=geo-containers`, Daten in EPSG:4326, Umprojektion im Client).
  Style `p2d2_friedhof` in `style_v3.json`, GFI aus (Klicks behandelt der
  `p2d2FeatureEditor`). In `layerConfig` ist der Layer sichtbar, sonst entsteht
  kein OL-Layer.
- Kartenausschnitt: Start im Zentrum Kölner Dom auf Stufe 3, **ohne `extent`**.
  Ein Extent begrenzt in OpenLayers das Kartenzentrum; mit dem früheren
  Köln-Extent landeten alle anderen Kommunen an dessen Rand (Report 017 E).
  Die View lässt sich wie im Standalone frei verschieben.

**Feste Hostnamen:** `geoportal.udp.data-dna.eu` steht fest in
`services-p2d2.json` (MapProxy-URL) und in `p2d2-editor-config.json`
(`wfsBase`); es gibt kein Templating für JSON-Dateien. Bei einer anderen Domain
sind diese Einträge anzupassen.
