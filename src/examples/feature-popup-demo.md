# Feature Popup Demo - p2d2 Cemetery Feature Handler

## Übersicht

Dieses Dokument beschreibt die Implementierung des Feature-Popup-Systems für Friedhofs-Polygone in der p2d2 AstroJS-Anwendung.

## Implementierte Funktionalität

### 1. Feature-Click-Detection
- **Cemetery-Erkennung**: Automatische Identifikation von Friedhofs-Features über `container_type: 'cemetery'`
- **Pixel-basierte Detection**: Präzise Feature-Erkennung unter dem Mausklick
- **Layer-unabhängig**: Funktioniert mit allen WFS-Vector-Layern

### 2. Popup-Fenster-System
- **OpenLayers Overlay**: Native OpenLayers-Integration für optimale Performance
- **Responsive Design**: Anpassbare Größe für Desktop und Mobile
- **Auto-Pan**: Automatische Kartenverschiebung bei Popup-Anzeige
- **Schließen-Funktion**: X-Button und Klick außerhalb schließen Popup

### 3. Grabflur-Daten Integration
- **Asynchroner WFS-Request**: Laden verwandter Grabflur-Polygone
- **Korrekte CQL-Filter-Syntax**: URL-Encoding für CQL_FILTER-Parameter
- **Error-Handling**: Graceful Degradation bei Netzwerkfehlern
- **Daten-Caching**: Effiziente Wiederverwendung geladener Daten

### 4. Zoom-Funktionalität
- **Automatisches Zoomen**: Zentriert auf angeklicktes Polygon
- **Animierte Übergänge**: Sanfte Zoom-Animation (300ms)
- **Intelligente Padding**: Angemessener Abstand zum Kartenrand
- **Zoom-Limitierung**: Maximaler Zoom-Level 16 für Detailsicht

## Technische Architektur

### Hauptkomponenten

#### FeaturePopupHandler Klasse
```typescript
// Kern-Funktionalität in src/utils/feature-popup-handler.ts
class FeaturePopupHandler {
  private map: OLMap;
  private popupOverlay: Overlay | null = null;
  
  // Methoden:
  - initializeClickHandler()
  - handleCemeteryClick()
  - loadGrabflurData()
  - showPopup()
  - zoomToFeature()
  - closePopup()
}
```

#### CSS-Styling
```css
/* Responsive Popup-Styles in src/styles/feature-popup.css */
.feature-popup {
  /* Modernes Design mit Shadow und Border */
}
```

### Integration in MapCanvas

```astro
// In src/components/MapCanvas.astro
import FeaturePopupHandler from "../utils/feature-popup-handler";

// Initialisierung nach Map-Erstellung
const popupHandler = new FeaturePopupHandler(map);
popupHandler.initializeClickHandler();
```

## WFS-Request Details

### CQL-Filter für Grabflur-Daten
```
osm_admin_level=10 
AND wp_name='de-Köln' 
AND container_type='cemetery' 
AND name like 'Rheinkassel-%'
```

**Wichtig**: Doppeltes URL-Encoding für das `name like` Pattern:
- Original: `'Rheinkassel-%'`
- Einfach encoded: `'Rheinkassel-%25'`
- Doppelt encoded: `'Rheinkassel-%2525'`

### WFS-URL Struktur
```
https://wfs.data-dna.eu/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=Verwaltungsdaten:p2d2_containers&CQL_FILTER=...
```
**Hinweis**: Der Read-Zugriff erfolgt anonym ohne Authentifizierung.

## Feature-Attribute Schema

### Friedhofs-Polygone
```typescript
interface CemeteryFeatureProperties {
  name: string;           // "Rheinkassel-Friedhof"
  container_type: string; // "cemetery"
  wp_name: string;        // "de-Köln"
  osm_admin_level: number; // 8
}
```

### Grabflur-Polygone
```typescript
interface GrabflurFeatureProperties {
  name: string;           // "Rheinkassel-Grabflur-1"
  container_type: string; // "cemetery"
  wp_name: string;        // "de-Köln"
  osm_admin_level: number; // 10
}
```

## Verwendung

### 1. Initialisierung
```javascript
// Map muss bereits initialisiert sein
const popupHandler = new FeaturePopupHandler(window.map);
popupHandler.initializeClickHandler();
```

### 2. Manuelle Steuerung
```javascript
// Popup programmatisch schließen
window.popupHandler.closePopup();

// Handler zerstören (bei Component-Unmount)
window.popupHandler.destroy();
```

### 3. Debugging
```javascript
// Status überprüfen
console.log('Popup handler initialized:', window.popupHandler.isHandlerInitialized());
```

## Fehlerbehandlung

### Network Errors
- **WFS-Timeout**: Popup zeigt Fehlermeldung an
- **Proxy-Fehler**: Fallback auf lokale Daten
- **JSON-Parsing**: Robuste Error-Catching

### Feature Errors
- **Fehlende Geometrie**: Warnung in Console
- **Ungültige Properties**: Fallback auf Default-Werte
- **Layer-Probleme**: Graceful Degradation

## Performance Optimierungen

### Memory Management
- **Overlay-Cleanup**: Automatische Ressourcen-Freigabe
- **Event-Listener**: OpenLayers-interne Cleanup
- **Cache-Strategie**: Keine redundanten WFS-Requests

### Responsive Design
- **Mobile First**: Optimiert für Touch-Interaktion
- **Viewport-Anpassung**: Dynamische Popup-Größe
- **Scroll-Verhalten**: Intelligente Overflow-Handling

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Bekannte Einschränkungen

1. **Anonymer Read-Zugriff**: Erfordert anonyme Leseberechtigung im GeoServer
2. **Cemetery-spezifisch**: Nur für `container_type: 'cemetery'` Features
3. **OpenLayers 7+**: Kompatibel mit aktueller OpenLayers Version

## Testing

### Manuelles Testing
1. Friedhofs-Polygon auf Karte anklicken
2. Popup mit Friedhofsdaten sollte erscheinen
3. Grabflur-Liste sollte geladen werden
4. Karte sollte auf Polygon zoomen
5. Popup sollte per X-Button schließbar sein

### Automatisches Testing
```bash
# TypeScript-Kompilierung prüfen
npm run build

# Linting
npm run lint
```

## Roadmap

- [ ] Erweiterung auf andere Feature-Typen
- [ ] Caching von Grabflur-Daten
- [ ] Erweiterte Filter-Optionen
- [ ] Export-Funktionalität
- [ ] Druck-optimierte Ansicht

---

**Letzte Aktualisierung**: Implementiert und getestet für p2d2 v1.0