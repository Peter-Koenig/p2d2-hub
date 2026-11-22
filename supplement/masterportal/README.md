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
│   │   ├── p2d2-selection.json      # Kommunen und Kategorien (generiert aus src/content)
│   │   ├── style_v3.json            # Styles (styleConf)
│   │   └── img/                     # Bilder, u. a. p2d2-logo.svg
│   │       └── p2d2/                # Kachelbilder (generiert aus public/images)
│   └── localdata/          # Demodaten
├── addons/
│   ├── addonsConf.json     # registriert p2d2FeatureEditor (javascript), p2d2Crs und p2d2Selector (tool)
│   ├── p2d2FeatureEditor/  # Klick auf Feature öffnet den Astro-Feature-Editor
│   │   ├── index.js
│   │   └── js/             # clickFlow, editorUrl, editorConfig, editorDialog, editorProjection
│   ├── p2d2Crs/            # Projektions-Switch (Werkzeug-Menü)
│   │   ├── index.js, components/, store/, locales/
│   │   └── js/             # utm, viewSwap, runtime
│   └── p2d2Selector/       # Auswahl Kommune/Kategorie, dynamischer Layer, Zoom (Hauptmenü)
│       ├── index.js, components/, store/, locales/
│       └── js/             # selection, wfsRequest, zoom, fit, layerControl, debug, runtime
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
`config.js` wird zur Laufzeit gerendert. Die beiden JSON-Dateien mit Hosts
tragen Platzhalter, die das nginx beim Ausliefern ersetzen muss (Abschnitt
„Hostnamen“).

## Hostnamen

In den ausgelieferten Dateien steht kein Host der Betreiber-Domain. Statt des
Hosts stehen dieselben Platzhalter wie in den Dateien des Portal-Backends
(`services-internet.json`), die das nginx im Masterportal-Pod per `sub_filter`
ersetzt:

| Datei | Schlüssel | Wert in der Datei | ausgeliefert (Beispiel `ADDON_DOMAIN=udp.projekte-koenig.eu`) |
|---|---|---|---|
| `services-p2d2.json` | `p2d2-osm.url` | `MAPSERVER-URL/service` | `https://geoportal.udp.projekte-koenig.eu/mapserver/service` |
| `p2d2-editor-config.json` | `wfsBase` | `GEOSERVER_URL/de1/ows` | `https://geoportal.udp.projekte-koenig.eu/geoserver/de1/ows` |

- `MAPSERVER_URL` und `GEOSERVER_URL` leitet `05-masterportal-env.envsh` im
  Installer aus `PORTAL_BACKEND_ORIGIN` ab (`https://geoportal.${ADDON_DOMAIN}`,
  ConfigMap `masterportal-<stage>-config`). Es gibt keine neue
  Betreibervariable.
- Der Stage-Pfad (`de1`) steht in der Datei; er ist je Stage-Branch richtig.
- **Voraussetzung im Installer:** Das nginx ersetzt die Platzhalter bisher nur
  in den Backend-Dateien. Für diese beiden Dateien braucht es eine eigene
  `location` mit `sub_filter` (Vorschlag im Bericht zu Turn 028). Ohne sie
  bleiben die Platzhalter stehen: Die Karte lädt keine Kacheln, der Selektor
  meldet „wfsBase ist keine absolute http(s)-URL“.
- Ausnahme mit festem Host: der Link auf die Projektseite im Menütitel
  (`portal-config-p2d2.json`, `mainMenu.title.link`).
- Test: `masterportal-supplement.test.ts`, Abschnitt „feste Hostnamen im Portal“.

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
| `p2d2Crs/store/*` | Modul `Modules/P2d2Crs`: `localCrs`, `genericCrs`, `activeCrs`; Aktionen `toggle`, `setLocalCrs`, `activateLocal` |
| `p2d2Crs/js/utm.js` | `isUtm`, `utmDefinition` (326xx, 327xx mit `+south`, 258xx mit GRS80; Zone 1–60), `crsLabel`, `createEnsureProjection` |
| `p2d2Crs/js/viewSwap.js` | `targetCrs`, `targetResolution`, `snapResolution`, `buildViewOptions`, `reprojectLayers`, `swapView` |
| `p2d2Crs/js/runtime.js` | einzige Datei mit Masterportal-Importen (masterportalapi `crs`, `ol/View`, `window.mapCollection`) |

Der State setzt kein `hasMouseMapInteractions`. Sonst übernähme das Werkzeug
beim Öffnen die Mausinteraktion, und der `p2d2FeatureEditor` würde keine
Klicks mehr auswerten (`Menu/currentMouseMapInteractionsComponent`).

`setLocalCrs(code)` registriert eine UTM-Zone bei Bedarf und setzt `localCrs`,
ohne die View zu ändern. `activateLocal` schaltet die View auf `localCrs`
(`swapView`) und setzt `activeCrs`. Beide ruft der `p2d2Selector` bei der
Kommunenwahl auf.

**Extent-Regel: Nur die Start-View hat einen Extent.**

- **Start-View:** `mapView.extent` ist Deutschland mit Rand in EPSG:25832
  (Herleitung unter „Stage de1“). Die masterportalapi baut die Start-View mit
  `Object.assign` über ihre Standardwerte (`src/defaults.js:11`,
  `src/maps/mapView.js:38-55`). Fehlt `extent`, gilt ihr Standard-Extent
  `[510000, 5850000, 625000.4, 6000000]` (Raum Hamburg); `constrainOnlyCenter`
  klemmt dann schon das Startzentrum Köln an dessen Ecke (9,15° E / 52,80° N).
- **Jede View aus `swapView` hat keinen Extent**, bei der Kommunenwahl wie beim
  Umschalter (`toggle`). Ein Extent der Portal-Konfiguration wird nicht in
  andere Zonen transformiert: in 32610, 32650 und 32651 läge er weit außerhalb
  der Zone, und nach 3857 würde er auf Europa klemmen.
- **Kommunenwahl in derselben Projektion wie die Start-View:** `swapView`
  baut die View einmal neu, wenn sie einen Extent hat (View-Property `extent`,
  `ol/View` übernimmt Konstruktor-Optionen als Properties). Schritte 0–6
  laufen, 7 und 8 entfallen (Koordinaten bleiben gültig), Ergebnis
  `rebuilt: true`. Ohne Extent passiert nichts. So hat die View nach jeder
  Kommunenwahl keinen Extent, unabhängig von Zone und Reihenfolge, und lässt
  sich wie im Standalone frei verschieben.

#### Ablauf `swapView`

Das Masterportal 3.27.1 kann die Projektion zur Laufzeit nicht wechseln
(`openConfig`/`watchPortalConfig` setzen nur Werte auf die bestehende View).
`swapView` ersetzt deshalb die View und verbindet danach neu:

0. Nur bei `Maps/mode === "2D"` und wenn das Ziel nicht schon aktiv ist.
   Ausnahme: gleiche Projektion bei einer View mit Extent (Extent-Regel oben).
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
   `constrainOnlyCenter`, `backgroundImage`, kein Extent, Zentrum
   transformiert, Rotation erhalten.
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
  mit Fakes (Reihenfolge, Rollback, 3D, refresh/transform, Neubau bei
  gleicher Projektion, kein Extent in neuen Views), Store-Aktionen.
- `src/tests/masterportal-focus-extent.test.ts`: Start-View wie masterportalapi
  `createMapView` mit dem Deutschland-Extent (Abdeckung, kein Klemmen bei
  `animate`, Gegenprobe mit Standard-Extent), Kommunenwahl mit echter View,
  echtem `swapView` und beiden Add-ons in fünf UTM-Zonen, Reihenfolgen,
  `toggle` ab Start-View und nach der Wahl.
- `src/tests/masterportal-supplement.test.ts`: Registrierung, Menüposition,
  Isolation, kein `hasMouseMapInteractions`.
- `src/tests/masterportal-editor-contract.test.ts`: Editor-URL bleibt bei 3857 UTM.

### p2d2Selector (Typ `tool`): Auswahl, dynamischer Layer, Zoom

Werkzeug im `mainMenu` (eigene Sektion an Index 1, Titel „Public-Public
Data-DNA“) mit zwei Kachelmatrizen (Kommunen, Kategorien) aus
`portal/resources/p2d2-selection.json`. Ein Klick wählt, ein zweiter Klick auf
dieselbe Kachel hebt die Auswahl auf. Vuex-Modul `Modules/P2d2Selector`, kein
`hasMouseMapInteractions` (sonst sperrt die Klickprüfung des
`p2d2FeatureEditor`).

#### Darstellung

Vorlage sind `KommunenGrid.astro` und `Kategorien.astro` des Standalone. Ohne
Tailwind: scoped CSS in `components/P2d2Selector.vue`, Farben und Maße als
CSS-Variablen an `#p2d2-selector`.

- **Kachel:** Bild (`object-fit: cover`, `loading="lazy"`), Verlauf nach unten,
  Farbstreifen oben, Titel unten (höchstens zwei Zeilen). Höhe aus dem
  Seitenverhältnis 4:3 der Bilder (800 × 600), begrenzt auf 8rem bis 12rem.
  Fehlt das Bild oder lädt es
  nicht, bleibt der dunkle Hintergrund `#2a2a2a` (wie `onerror` im Standalone).
- **Farben aus dem Standalone:** Kommunen Streifen `colorStripe` (Standard
  `#FF6900`), Schein `rgba(255, 105, 0, 0.3)`; Kategorien Streifen `#0FF078`,
  Verlauf `#074220f5`, Schein `#0a6630`.
- **Aktiv** (`aria-pressed="true"`): Schlagschatten in der Streifenfarbe (3px)
  plus Schein. Der Fokus-Ring (`:focus-visible`, 2px, Abstand 5px) liegt
  außerhalb davon.
- **Spalten:** Die Spaltenzahl hängt an der Breite des Selektors, nicht am
  Fenster (Container Queries, `#p2d2-selector` mit
  `container-type: inline-size`): eine Spalte, zwei ab 20,5rem (328 px), drei
  ab 31rem (496 px), nie mehr als drei. Jede Kachel ist damit mindestens 10rem
  breit; Abstand 0,5rem. Der Inhalt des Menüs ist um 2 × 1,5rem Innenabstand
  schmaler als das Menü (`MenuContainerBody.vue`, `$padding`); eine
  Bildlaufleiste im Menü kostet zusätzlich ihre Breite.

  | Fenster | Menü (25 %) | Inhalt | Spalten | Kachelbreite | Kachelhöhe |
  |---|---|---|---|---|---|
  | 1366 px | 341,5 px | 293,5 px | 1 | 293,5 px | 192 px (Obergrenze) |
  | 1920 px | 480 px | 432 px | 2 | 212 px | 159 px |
  | 2560 px | 640 px | 592 px | 3 | 192 px | 144 px |
  | 3440 px | 860 px | 812 px | 3 | 265 px | 192 px (Obergrenze) |

  Das Menü lässt sich mit dem Griff am Rand breiter ziehen; Browser-Zoom
  verkleinert die Pixel und verbreitert damit das Menü in CSS-Pixeln (z. B.
  1920 px bei 67 % → etwa 2865 CSS-Pixel). Vorher (`auto-fill`, 10rem) ergab
  das vier Spalten und mehr; jetzt bleibt es bei drei.

  **Rückfall** für Browser ohne Container Queries (vor Firefox 110, Chrome 105,
  Safari 16): `repeat(auto-fill, minmax(13rem, 1fr))`. Drei Spalten erst ab
  640 px Inhalt (2752 px Fenster), vier ab 856 px; eine feste Obergrenze gibt
  es dort nicht.
- **Überschriften** „Kommunen“ und „Kategorien“: Abstand 1rem zu den Kacheln
  (`.p2d2-heading`, statt 0,5rem des Bootstrap-`h6`); der Abstand zwischen den
  Abschnitten bleibt `gap-3` (1rem).
- **Hinweise** (`layerNoticeKey`): Laden der Auswahl-Datei, Laden der Objekte,
  „keine Objekte“ und Fehler. Ohne Auswahl und nach erfolgreichem Laden steht
  nichts über den Kacheln.
- **Icon** `bi-grid-3x3-gap` steht im State und in der Menü-Konfiguration;
  Ursache, falls es nicht erscheint: Bericht zu Turn 028.

#### Bilder

Der Generator (`npm run generate:masterportal-selection`) bestimmt je Eintrag
das Bild nach der Regel des Standalone, `<slug>_<image_version>.jpg`
(Standard `001`), kopiert es aus `public/images/{kommunen,kategorien}/` nach
`portal/resources/img/p2d2/{kommunen,kategorien}/` und schreibt den Pfad in
das Feld `image` der Auswahl-Datei (relativ zur Portal-Seite, z. B.
`resources/img/p2d2/kommunen/koeln_001.jpg`). Fehlt das Bild: `image: null`
und eine Warnung. Dateien im Bildordner, die keine Auswahl nutzt, entfernt er.
`--check` prüft zusätzlich Vorhandensein, SHA-256 gegen die Quelle und
verwaiste Dateien. Die Bilder gehören zum Tree-Hash von
`supplement/masterportal`; ein neues Bild ändert den Image-Tag.

#### Ablauf `applySelection`

Die Aktion `select` wendet den Kachelklick an und löst `applySelection` aus.
Alle Schritte laufen synchron, ohne `await` dazwischen. OpenLayers lädt erst
beim nächsten Rendern; deshalb entsteht genau **ein** Request mit dem neuen
Loader in der neuen Projektion, auch wenn `swapView` die Quelle vorher schon
neu angestoßen hat.

1. Signatur `<kommune>|<kategorie>` (leer ohne Auswahl). Gleiche Signatur wie
   die zuletzt angewendete: nichts tun.
2. Neue Kommune (Slug ≠ zuletzt fokussierte), `focusKommune`:
   1. `Modules/P2d2Crs/setLocalCrs(map.projection)` registriert die UTM-Zone.
   2. `Modules/P2d2Crs/activateLocal` tauscht die View auf das lokale CRS
      (`swapView`), auch wenn vorher EPSG:3857 aktiv war (wie im Standalone).
      Die View hat danach keinen Extent (Regel unter „p2d2Crs“).
   3. Ziel aus `map.extent` (Abschnitt „Ausschnitt“) oder, ohne Extent, aus
      `map.zoom` (Zoom-Regel); das Zentrum liegt in der Mitte der sichtbaren
      Fläche neben dem Menü. `view.animate` mit Zentrum und Auflösung (300 ms
      wie im Standalone).
   4. `Maps/setInitialCenter` und `Maps/setInitialZoom`: „Startansicht“
      (totalView) führt zur gewählten Kommune.

   Ob Schritt 1 und 2 gewirkt haben, prüft der Selektor am Store
   (`localCrs`) und an der View-Projektion; der Rückgabewert von `dispatch`
   ist in Vuex immer ein Promise.
3. Kommune und Kategorie gewählt: Loader mit der URL der Auswahl setzen und
   `source.refresh()`. Sonst: leerer Loader, `source.clear()`.

Nach Abwahl der Kommune bleiben `localCrs` und View wie sie sind (wie im
Standalone); eine erneute Wahl derselben Kommune zoomt wieder auf sie.

#### Dynamischer Layer (`js/layerControl.js`)

Der Layer `p2d2-geo-containers` steht ohne `url` in `services-p2d2.json`. Der
Selektor sucht ihn über `mapCollection.getMap("2D")` per `layer.get("id")` und
setzt einen eigenen Loader (`source.setLoader`):

- **Token und Abbruch:** Jeder Loader-Aufruf bricht den vorherigen per
  `AbortController` ab und erhält ein neues Token. Eine Antwort mit veraltetem
  Token wird verworfen (`success([])`, nichts eingefügt). Das gilt auch für
  Aufrufe nach dem CRS-Umschalter (`swapView` → `refresh`).
- **Fehler:** HTTP-Status ≠ 2xx oder kein `type: "FeatureCollection"` →
  `failure()`, Status `error`, Meldung im Panel und über
  `Alerting/addSingleAlert` (Kategorie `error`). 0 Features → Status `empty`,
  nur im Panel.
- **Lesen:** `GeoJSON.readFeatures` mit `dataProjection: EPSG:4326` und der
  View-Projektion, die OpenLayers dem Loader übergibt.
- **Loader-Vertrag:** Der Loader gibt nichts zurück und ruft `success` bzw.
  `failure` genau einmal. Ab OpenLayers 10.10 (Masterportal 3.27.1) fügt
  `VectorSource` die Features selbst ein, wenn ein Loader ein Promise
  zurückgibt; zusammen mit dem eigenen `addFeatures` wäre das doppelt.

Die Stage-Werte `wfsBase`, `typeName` und `proxyPath` liest der Selektor aus
`layers["p2d2-geo-containers"]` in `p2d2-editor-config.json` (dieselbe Datei
wie der `p2d2FeatureEditor`). Fehlt einer, ist der Status `error` mit Text; es
gibt keinen Standardwert.

#### Request

- CQL: `wp_name='<wpName>' AND container_type='<containerType>' AND
  osm_admin_level=<n>`; Hochkommata werden verdoppelt, das Level kommt je
  `containerType` aus `p2d2-selection.json` und muss eine ganze Zahl sein.
- Innere URL wie `buildWFSURL` aus `@p2d2/core` (`version=2.0.0`,
  `outputFormat=application/json`, `srsName=EPSG:4326`, ohne `count`), außen
  `<proxyPath>?url=<encodeURIComponent(…)>` wie im Standalone.

#### Zoom-Regel

Auflösung = `2π·6370997/256/2^zoom` (OpenLayers-View des Standalone ohne
Tabelle; für alle UTM-Zonen gleich), dann linear auf die nächste Stufe der
Portal-Tabelle eingerastet (wie `snapResolution`). Köln (Zoom 11) → Stufe 1
(1:200 000, 52,92 m/px), Bonn (12) → Stufe 2, Berlin (10) → Stufe 0,
Kronshagen (14) → Stufe 4. Gilt nur für Kommunen ohne `map.extent`
(Flensburg, Hangzhou); das Zentrum wird wie beim Ausschnitt um das Menü
verschoben.

#### Ausschnitt (`js/fit.js`)

- **`map.extent`** aus der Collection (`[minLon, minLat, maxLon, maxLat]`,
  EPSG:4326) übernimmt der Generator, wenn er gültig ist (vier Zahlen, min < max,
  Länge ±180, Breite ±90, `map.center` innen; `extentErrors` in
  `js/selection.js`). Der Selektor transformiert ihn mit `transformExtent`
  (8 Stützpunkte je Kante) in die Zone.
- **Sichtbare Fläche:** Die Karte ist so breit wie das Fenster, das
  ausgeklappte Hauptmenü liegt darüber. `menuPadding` = `[20, 20 + Zweitmenü,
  20, 20 + Hauptmenü]`; die Menübreite kommt aus
  `Menu/currentMainMenuOffsetWidth` (nach Übergang oder Ziehen gesetzt), sonst
  aus `Menu/currentMenuWidth` (`"25%"` × Kartenbreite); eingeklappt oder unter
  dem Breakpoint (`isMobile`) 0. Das Padding verschiebt das Zentrum, die
  Auflösung bestimmt der Modus.
- **Modi**, Umschaltung über `?p2d2Fit=<modus>` (einmal beim Start gelesen,
  unbekannt → `nearest`; der Modus steht im Debug-Ereignis `focus`):

| Modus | Regel | Entspricht |
|---|---|---|
| `nearest` (Standard) | nächste Stufe zur passenden Auflösung | `view.fit(…, {nearest: true})` |
| `ceil` | feinste Stufe, bei der die ganze BBox sichtbar ist | `view.fit(…, {nearest: false})` |
| `exact` | passende Auflösung ohne Einrasten | `fit` mit `constrainResolution: false` |
| `tight` | BBox füllt die sichtbare Fläche (die kürzere Seite passt), dann wie `ceil` | Vorschlag für den Sollwert Köln Stufe 3 |

- **`exact`:** Die Views haben `constrainResolution: true` (`buildViewOptions`
  in p2d2Crs). Die Zwischenauflösung bleibt nach `animate` stehen, rastet aber
  beim ersten Verschieben auf die nächste Stufe ein (`endInteraction`,
  `setCenter`). Maßstab und „Startansicht“ arbeiten mit der nächsten Stufe.

#### Debug-Ausgabe

Mit `?p2d2debug=1` in der Portal-URL schreibt der Selektor per
`console.debug` mit dem Präfix `[p2d2Selector]`: Signatur, Request-URL,
HTTP-Status, Zahl der Features, View-Projektion, Auflösung und Zentrum nach
der Animation. Ohne den Parameter gibt es keine Ausgabe. Die Start-View
(vor der ersten Wahl) erzeugt kein Ereignis; ihr Extent steht in der Konsole
unter `mapCollection.getMap("2D").getView().get("extent")` (erwartet: der
Deutschland-Extent aus `mapView.extent`).

| Ereignis | Inhalt |
|---|---|
| `selection` | `signature` |
| `focus` | `slug`, `projection`, `mode` (`p2d2Fit`), `source` (`extent` oder `zoom`), `zoom`, `zoomResolution` (Zoom-Regel vor dem Einrasten), `fitResolution` (passende Auflösung bei `extent`), `stage`, `resolution`, `center`, `padding`, `size` |
| `view` | nach der Animation: `projection`, `resolution`, `center`, `extent` der View (View-Property, ohne Extent `null`; nach jeder Kommunenwahl `null`, ein Wert verletzt die Extent-Regel) |
| `load` | `signature`, `url`, `cql` |
| `request` / `response` / `features` | URL und Projektion des Loader-Aufrufs, HTTP-Status, Zahl der Features |

#### Grenzen

- **Unsichtbarer Layer:** Ein ausgeblendeter Layer lädt nicht; der Status
  bleibt `loading`, bis er wieder sichtbar ist.
- **Fehler-Request des Masterportals:** Auf `featuresloaderror` fragt
  `Layer2d.addErrorListener` `<url>&service=…&request=describeFeatureType` ab.
  Ohne `url` geht diese Anfrage an `undefined&service=GeoJSON…` relativ zum
  Portal (Antwort 404, keine Anzeige).
- **3D:** Im 3D-Modus lädt das Masterportal leere GeoJSON-Layer per
  `loadFeaturesManually` über `url` nach; ohne `url` ist das ein Request auf
  `undefined`. Die Kommunenwahl ist nur in 2D möglich (`swapView`).
- **Feature-IDs:** `afterLoading` des Masterportals vergibt IDs nur beim
  ersten Laden; GeoServer liefert eigene IDs (im Browser zu prüfen).
- **Basiskarte:** in EPSG:25833, 32610 und 32650 erst mit der MapProxy-Konfiguration
  aus `civitas_einrichtung` `d20ada5` (vorher WMS nur 25832/3857/4326).

#### Tests

- `src/tests/masterportal-selector-request.test.ts`: CQL, URL gegen
  `buildWFSURL` und die frühere statische Layer-URL, Stage-Werte.
- `src/tests/masterportal-selector-zoom.test.ts`: Prüfwert, Vertrag mit der
  OpenLayers-View, Tabelle D, `snapResolution`.
- `src/tests/masterportal-selector-layer.test.ts`: Loader mit echter
  `VectorSource`, Wettlauf mit zurückgehaltenen Antworten, Abwahl, Fehler.
- `src/tests/masterportal-selector-fit.test.ts`: Modi gegen `ol/View#fit`,
  Zentrum in der sichtbaren Mitte, Menü-Padding, Sollwert Köln, Kronshagen.
- `src/tests/masterportal-selector-actions.test.ts`: Reihenfolge der Commits
  und Dispatches in `applySelection`/`focusKommune`, Extent- und Zoom-Pfad,
  Status, Alerting, Debug.
- `src/tests/masterportal-focus-extent.test.ts`: echte View, alle Kommunen mit
  Extent in allen Modi, Einrasten von `exact` beim Verschieben.
- `src/tests/masterportal-selection-generator.test.ts`: `map.extent`,
  Bildregel gegen die Standalone-Komponenten, Generator mit temporärer
  Collection (neuer Eintrag, `--check`, verwaiste Dateien).
- `src/tests/masterportal-selector-selection.test.ts`,
  `masterportal-selector-store.test.ts`, `masterportal-selector-supplement.test.ts`:
  Auswahl-Datei, Kacheln, Store, Registrierung und Isolation.

## Stage de1: Inhalte

- Hintergrundkarte: MapProxy-Layer `p2d2_osm` (WMS
  `MAPSERVER-URL/service`, Abschnitt „Hostnamen“), Karte in EPSG:25832.
- Fachlayer: ein GeoJSON-Layer `p2d2-geo-containers` („Auswahl“) **ohne
  `url`**. Die masterportalapi legt dafür eine leere Quelle an
  (`layer/vector.js` `createVectorSource`); den Inhalt lädt das Add-on
  `p2d2Selector` je Auswahl von Kommune und Kategorie über den Stage-Proxy
  `/api/wfs-proxy?url=<kodierte WFS-URL>` (GeoServer-Workspace `de1`,
  `typeName=geo-containers`, Daten in EPSG:4326, Umprojektion im Client).
  Style `p2d2_friedhof` in `style_v3.json`, GFI aus (Klicks behandelt der
  `p2d2FeatureEditor`). In `layerConfig` ist der Layer sichtbar, sonst entsteht
  kein OL-Layer; `isNeverVisibleInTree: true` blendet ihn im Themenbaum und in
  der Pillenleiste aus (`LayerComponent.vue`, `LayerPills.vue`). Legende und
  Suche (`visibleVector`) werten das Feld nicht aus.
- Kartenausschnitt: `startCenter` Kölner Dom auf Stufe 3, `extent`
  `[222000, 5179000, 1000000, 6177000]` (EPSG:25832, Deutschland mit Rand).
  - Herleitung: Rechteck der Extrempunkte Deutschlands in WGS84
    (5,8663–15,0419° E, 47,2701–55,0581° N) mit 0,5° Rand, der Rand mit je
    200 Punkten nach EPSG:25832 transformiert, Umgebungsrechteck auf volle
    Kilometer nach außen gerundet.
  - Der Extent gilt nur für die Start-View: Er hält das Zentrum über
    Deutschland und ersetzt den Standard-Extent der masterportalapi (Raum
    Hamburg). Ein Extent begrenzt in OpenLayers das Kartenzentrum; mit dem
    früheren Köln-Extent landeten alle anderen Kommunen an dessen Rand
    (Report 017 E).
  - Nach der Kommunenwahl und nach `toggle` hat die View keinen Extent und
    lässt sich wie im Standalone frei verschieben (Extent-Regel unter
    „p2d2Crs“).
  - Auch `addWMS` liest `mapViewSettings.extent`: Es prüft, ob ein externer
    WMS den Ausschnitt abdeckt (`AddWMS.vue:138`).
- Kommunenwahl: `map.extent` für Köln, Bonn, Dortmund, Kiel, Berlin, Hamburg
  (Hauptgebiet ohne Neuwerk), San Francisco (ohne Farallon-Inseln), Bornheim
  und Kronshagen; Flensburg und Hangzhou ohne Extent (Zoom-Regel).
