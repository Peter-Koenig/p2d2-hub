# Button Positionierung - Feinjustierung Guide

## Übersicht
Dieser Guide erklärt, wie die Positionierung der Buttons in der OpenLayers-Karte manuell angepasst werden kann.

## Aktuelle Button-Positionierung

### CRS-Toggle Button
```html
<div id="crs-toggle" class="absolute top-2 right-18 z-10">
```

### Fullscreen-Button (OpenLayers Standard)
- Wird automatisch von OpenLayers platziert
- Standardposition: rechts oben
- Z-index: 1000 (OpenLayers Default)

## Problem: Button-Overlap

Der CRS-Toggle Button überlappt mit dem Fullscreen-Button von OpenLayers.

## Lösungsansätze

### 1. CSS-Positionierung anpassen

**Aktuelle Werte:**
- Top: `top-2` (0.5rem = 8px)
- Right: `right-18` (4.5rem = 72px)

**Anpassungsmöglichkeiten:**
```html
<!-- Weitere Links -->
<div id="crs-toggle" class="absolute top-3 right-20 z-10">

<!-- Höher positionieren -->  
<div id="crs-toggle" class="absolute top-4 right-16 z-10">

<!-- Weitere Links und höher -->
<div id="crs-toggle" class="absolute top-4 right-20 z-10">
```

### 2. TailwindCSS Klassen für Positionierung

**Top-Positionierung:**
- `top-1` = 0.25rem (4px)
- `top-2` = 0.5rem (8px) 
- `top-3` = 0.75rem (12px)
- `top-4` = 1rem (16px)
- `top-5` = 1.25rem (20px)

**Right-Positionierung:**
- `right-16` = 4rem (64px)
- `right-18` = 4.5rem (72px)
- `right-20` = 5rem (80px)
- `right-24` = 6rem (96px)

### 3. Pixel-genaue Positionierung (falls nötig)

```css
#crs-toggle {
  position: absolute;
  top: 12px;
  right: 80px;
  z-index: 30;
}
```

## Responsive Anpassungen

**Desktop (default):**
```css
#crs-toggle {
  top: 12px;
  right: 80px;
}
```

**Tablet (768px):**
```css
@media (max-width: 768px) {
  #crs-toggle {
    top: 10px;
    right: 70px;
  }
}
```

**Mobile (480px):**
```css
@media (max-width: 480px) {
  #crs-toggle {
    top: 8px;
    right: 60px;
  }
}
```

## Z-Index Management

**Aktuelle Z-Index Werte:**
- OpenLayers Controls: `z-index: 1000` (default)
- CRS-Toggle Button: `z-index: 30`
- Map Container: `z-index: 0`

**Sicherstellen, dass Buttons über Controls liegen:**
```css
#crs-toggle {
  z-index: 1010; /* Höher als OpenLayers Controls */
}
```

## Debugging-Tools

### Browser DevTools verwenden:
1. **F12** öffnen → Elements Tab
2. **CRS-Toggle Button** inspizieren
3. **Box Model** prüfen (Margin, Padding, Position)
4. **Fullscreen-Button** position prüfen

### Console-Befehle:
```javascript
// CRS-Button Position
console.log('CRS Button:', document.getElementById('crs-toggle').getBoundingClientRect());

// Fullscreen-Button Position  
const fullscreenBtn = document.querySelector('.ol-full-screen');
console.log('Fullscreen Button:', fullscreenBtn?.getBoundingClientRect());
```

## Best Practices

1. **In kleinen Schritten** anpassen (2-4px pro Iteration)
2. **Responsive testen** auf verschiedenen Bildschirmgrößen
3. **Z-Index Konflikte** vermeiden
4. **Touch-Ziele** auf Mobile groß genug halten (min. 44x44px)

## Empfohlene Ausgangswerte

```html
<!-- Guter Startpunkt -->
<div id="crs-toggle" class="absolute top-3 right-20 z-1010">
```

```css
/* Responsive Fallbacks */
#crs-toggle {
  top: 12px;
  right: 80px;
  z-index: 1010;
}

@media (max-width: 768px) {
  #crs-toggle {
    top: 10px;
    right: 70px;
  }
}

@media (max-width: 480px) {
  #crs-toggle {
    top: 8px;
    right: 60px;
  }
}
```

## Fehlerbehandlung

**Häufige Probleme:**
- Button nicht sichtbar → `z-index` zu niedrig
- Falsche Position → Parent Container nicht `relative`
- Überlap bleibt → Right/Wert erhöhen

**Lösungen:**
- `z-index: 1010` für CRS-Button
- Sicherstellen dass Parent `position: relative` hat
- Right-Wert in 4px Schritten erhöhen

---
**Letzte Aktualisierung:** 2025-01-18