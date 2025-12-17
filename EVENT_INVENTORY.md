# Event-Inventar für p2d2

## Überblick
Dieses Dokument listet alle verfügbaren Event-Typen im p2d2-System auf, kategorisiert sie nach Funktionsbereich, priorisiert sie für die Cross-Window-Kommunikation und gibt Implementierungsempfehlungen.

## Event-Tabelle

| Event-Typ | Kategorie | Beschreibung | Priorität | Cross-Window | Implementiert |
|-----------|-----------|--------------|-----------|--------------|---------------|
| `p2d2:kommunen:focus` | Kommune | Fokus auf eine Kommune (Zoom/Pan) | Mittel | Nein | Ja |
| `p2d2:kommunen:selected` | Kommune | Kommune ausgewählt | Hoch | Ja | Ja |
| `p2d2:map:ready` | Map | Karte initialisiert | Hoch | Ja | **Ja** (neu) |
| `p2d2:map:moveend` | Map | Kartenbewegung abgeschlossen | Niedrig | Nein | Ja |
| `p2d2:map:zoomend` | Map | Zoom-Änderung abgeschlossen | Niedrig | Nein | Ja |
| `p2d2:map:click` | Map | Klick auf Karte | Mittel | Nein | Ja |
| `p2d2:layer:toggle` | Layer | Layer ein-/ausgeschaltet | Mittel | Ja | Ja |
| `p2d2:layer:visibility:change` | Layer | Layer-Sichtbarkeit geändert | Mittel | Ja | Ja |
| `p2d2:wfs:load:start` | WFS | WFS-Ladevorgang gestartet | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:wfs:load:complete` | WFS | WFS-Ladevorgang erfolgreich | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:wfs:load:error` | WFS | WFS-Ladevorgang fehlgeschlagen | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:wfs:feature:created` | WFS | Feature erstellt | Hoch | Ja | Ja |
| `p2d2:wfs:feature:updated` | WFS | Feature aktualisiert | Hoch | Ja | Ja |
| `p2d2:wfs:feature:deleted` | WFS | Feature gelöscht | Hoch | Ja | Ja |
| `p2d2:editor:ready` | Editor | Editor-Fenster initialisiert | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:editor:feature:modified` | Editor | Feature im Editor modifiziert | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:editor:tool:switch` | Editor | Werkzeug gewechselt | Mittel | Ja | Ja |
| `p2d2:editor:mode:change` | Editor | Modus (navigate/edit) geändert | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:editor:feature:selected` | Editor | Feature im Editor ausgewählt | Hoch | **Ja** | **Ja** (neu) |
| `p2d2:editor:save:start` | Editor | Speichervorgang gestartet | Hoch | Ja | Ja |
| `p2d2:editor:save:complete` | Editor | Speichervorgang erfolgreich | Hoch | Ja | Ja |
| `p2d2:editor:save:error` | Editor | Speichervorgang fehlgeschlagen | Hoch | Ja | Ja |
| `p2d2:crs:change` | UI | Koordinatensystem geändert | Mittel | Ja | Ja |
| `p2d2:ui:panel:toggle` | UI | UI-Panel ein-/ausgeklappt | Niedrig | Nein | Ja |

**Legende:**
- **Priorität**: Hoch = Kernfunktionalität, Mittel = nützlich für Debugging, Niedrig = optional
- **Cross-Window**: **Ja** = für Cross-Window-Kommunikation priorisiert
- **Implementiert**: **Ja** (neu) = im Rahmen dieser Implementierung instrumentiert

## Priorisierungsempfehlungen

### Phase 1: Kritische Cross-Window-Events (sofort implementieren)
1. **`EDITOR_READY`** & **`MAP_READY`** – Grundstatus beider Fenster
2. **`EDITOR_FEATURE_MODIFIED`** – Live-Änderungen vom Editor zum Hauptfenster
3. **`WFS_LOAD_START/COMPLETE/ERROR`** – Ladezustände vom Hauptfenster zum Editor
4. **`EDITOR_MODE_CHANGE`** & **`EDITOR_FEATURE_SELECTED`** – Editor-Kontext

### Phase 2: Erweiterte Synchronisation
1. **`WFS_FEATURE_CREATED/UPDATED/DELETED`** – Vollständige Feature-Synchronisation
2. **`LAYER_TOGGLE`** & **`LAYER_VISIBILITY_CHANGE`** – Konsistente Layer-Darstellung
3. **`KOMMUNEN_SELECTED`** – Kommunen-Kontext teilen

### Phase 3: Debugging & Monitoring
1. **`EDITOR_TOOL_SWITCH`** – Werkzeugverfolgung
2. **`CRS_CHANGE`** – Projektionssynchronisation
3. **`MAP_MOVEEND/ZOOMEND`** – Karteninteraktionen

## Architektur der Cross-Window-Kommunikation

```
┌─────────────────────────────────────────────────────────────────┐
│                         HAUPTFENSTER                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Event Console                        │    │
│  │  📡 [p2d2:editor:feature:modified] {featureId: "123"}   │    │
│  │  🏠 [p2d2:map:ready] {projection: "EPSG:3857"}          │    │
│  └─────────────────────────────────────────────────────────┘    │
│              ▲                                       ▲           │
│              │ window.postMessage()                  │           │
│              │ (same-origin)                         │           │
│              │                                       │           │
│  ┌───────────┴───────────────────────────────────────┴─────────┐ │
│  │               Cross-Window Event Bridge                     │ │
│  │  • initializeCrossWindowBridge()                            │ │
│  │  • registerEditorWindow()                                   │ │
│  │  • broadcastToEditorWindows()                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│              │                                       │           │
│              │ window.opener.postMessage()           │           │
│              │ (Child → Parent)                      │           │
│              ▼                                       ▼           │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ window.open()
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                         EDITOR-FENSTER                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Event Console                        │    │
│  │  🪟 [p2d2:wfs:load:start] {layerName: "cemeteries"}     │    │
│  │  📡 [p2d2:editor:ready] {windowId: "p2d2-..."}          │    │
│  └─────────────────────────────────────────────────────────┘    │
│              ▲                                       ▲           │
│              │ window.postMessage()                  │           │
│              │ (same-origin)                         │           │
│              │                                       │           │
│  ┌───────────┴───────────────────────────────────────┴─────────┐ │
│  │               Cross-Window Event Bridge                     │ │
│  │  • initializeCrossWindowBridge()                            │ │
│  │  • dispatchCrossWindowEvent()                               │ │
│  │  • getWindowId()                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

### Datenfluss
1. **Editor → Hauptfenster**: `window.opener.postMessage()` für direkte Kommunikation
2. **Hauptfenster → Editor**: `broadcastToEditorWindows()` an alle registrierten Fenster
3. **Bidirektional**: `window.postMessage()` für gleichberechtigte Kommunikation
4. **Sicherheit**: Same-origin Policy wird strikt eingehalten

### Event-Propagation
1. Lokales Event wird via `dispatchCrossWindowEvent()` gefeuert
2. Event wird lokal im `EventConsole` geloggt
3. Bei aktiviertem Cross-Window-Flag wird Event an andere Fenster gesendet
4. Empfangene Events werden lokal als CustomEvent redispatched
```

## Technische Hinweise

### Event-Details
- **Throttling**: Bestimmte Events (z.B. `MAP_MOVEEND`) sind standardmäßig gedrosselt (200ms)
- **Retry-Mechanismus**: WFS-Events haben einen 3-stufigen Retry-Mechanismus
- **Typsicherheit**: TypeScript-Interfaces für alle Event-Payloads
- **Metadata**: Alle Events enthalten `timestamp` und optional `windowId`, `source`

### Cross-Window-Spezifika
- **Window-Identifikation**: Jedes Fenster erhält eine eindeutige `WINDOW_ID`
- **Quell-Tracking**: Events werden mit `source: 'main'|'editor'` markiert
- **Zustandsmanagement**: Editor-Fenster werden in `editorWindows` Set registriert
- **Cleanup**: Automatische Deregistrierung bei Fensterschließung

### Performance-Optimierungen
1. **Lazy Propagation**: Cross-Window-Kommunikation kann pro Event deaktiviert werden
2. **Batching**: Mehrere Events könnten gebatcht werden (aktuell nicht implementiert)
3. **Filtering**: EventConsole unterstützt clientseitige Filterung
4. **Persistence**: Console-Zustand wird im LocalStorage gespeichert (24h)

## Nächste Schritte

### Kurzfristig (Sprint)
1. ✅ Cross-Window Bridge implementieren
2. ✅ Kritische Events instrumentieren
3. ✅ EventConsole mit Cross-Window-Labels erweitern
4. 🔄 Tests der bidirektionalen Kommunikation

### Mittelfristig
1. **Event-Historisierung**: Server-seitiges Logging für Auditing
2. **Event-Replay**: Wiedergabe von Event-Sequenzen für Debugging
3. **Performance-Monitoring**: Event-Latenz-Metriken
4. **Plugin-System**: Externe Event-Handler registrieren

### Langfristig
1. **Offline-Queue**: Events puffern bei Netzwerkproblemen
2. **Event-Versionierung**: Schema-Evolution unterstützen
3. **Dreidimensionale Events**: Für zukünftige 3D-Funktionalität
4. **Machine-Learning**: Anomale Event-Muster erkennen

## Qualitätssicherung

### Automatisierte Tests
- [ ] Unit-Tests für `cross-window-events.ts`
- [ ] Integrationstests für Fensterkommunikation
- [ ] E2E-Tests mit Cypress/Puppeteer
- [ ] Performance-Tests unter Last

### Manuelle Tests
1. **Basisfunktionalität**: Events erscheinen in beiden Consoles
2. **Cross-Window**: Events werden korrekt propagiert
3. **Fehlerbehandlung**: Netzwerkausfälle, Fensterschließung
4. **Browser-Kompatibilität**: Chrome, Firefox, Safari

### Monitoring
- **Console-Logs**: `[cross-window]` Präfix für einfache Filterung
- **Error-Tracking**: Sentry/Rollback-Integration
- **Performance**: Event-Durchsatz und Latenz messen
- **User-Feedback**: EventConsole als Debugging-Tool für Endnutzer

---

*Letzte Aktualisierung: Im Rahmen der Cross-Window Event Bridge Implementierung*  
*Verantwortlich: Entwicklungsteam p2d2*  
*Dokumentationspfad: `p2d2-docs/de/entwicklungshandbuch/architektur/eventhandling`*