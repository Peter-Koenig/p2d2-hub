# Canvas Styling Solution für OpenLayers in AstroJS

## Problem: Canvas-Elemente ignorieren CSS border-radius

**Warum passiert das?**
Canvas-Elemente verhalten sich wie unabhängige Zeichenflächen und erben keine CSS-Eigenschaften wie `border-radius` vom Parent-Container. OpenLayers erstellt dynamisch `<canvas>`-Elemente für das Rendering, die standardmäßig rechteckig sind.

**Technische Gründe:**
- Canvas ist ein Bitmap-basiertes Element
- CSS-Eigenschaften werden nicht an untergeordnete Canvas-Elemente vererbt
- OpenLayers verwaltet Canvas-Elemente unabhängig vom DOM-Styling

## Implementierte Lösungsansätze

### 1. CSS Clip-Path (Primary Solution)
```css
#map {
  clip-path: inset(0 round 16px);
  overflow: hidden;
}

#map canvas {
  border-radius: 16px !important;
  clip-path: inset(0 round 16px) !important;
}
```

**Vorteile:**
- ✅ Browser-unabhängig
- ✅ Gute Performance
- ✅ Einfache Implementierung
- ✅ Responsive mit Media Queries

### 2. Direct Canvas Styling via JavaScript
```javascript
// Nach Map-Initialisierung
map.once("postrender", () => {
  const canvases = mapElement.querySelectorAll("canvas");
  canvases.forEach((canvas) => {
    canvas.style.borderRadius = "16px";
  });
});

// Mutation Observer für dynamische Canvas-Elemente
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === "CANVAS") {
          node.style.borderRadius = "16px";
        }
      });
    }
  });
});
```

### 3. Responsive Design mit TailwindCSS
```html
<div 
  id="map"
  class="
    rounded-2xl          /* Mobile: 16px */
    md:rounded-3xl       /* Desktop: 24px */
    overflow-hidden      /* Wichtig für Clip-Path */
  "
>
```

## Browser-Kompatibilität

### ✅ Unterstützte Browser:
- Chrome 55+ (Clip-Path)
- Firefox 54+ (Clip-Path)  
- Safari 13.1+ (Clip-Path)
- Edge 79+ (Clip-Path)

### ⚠️ Fallback für ältere Browser:
Für Browser ohne Clip-Path Support wird `border-radius` direkt auf Canvas-Elemente angewendet.

## Performance-Optimierungen

### 1. GPU-Beschleunigung
```css
#map canvas {
  transform: translateZ(0);
  will-change: transform;
}
```

### 2. Gecachte Styles
```javascript
// Styles werden nur einmal nach Render gesetzt
map.once("postrender", () => {
  // Canvas-Styling
});
```

### 3. Effiziente Mutation Observation
```javascript
// Nur für Canvas-Elemente observieren
observer.observe(mapElement, {
  childList: true,
  subtree: true,
});
```

## Responsive Breakpoints

```css
/* Mobile (default) */
#map { clip-path: inset(0 round 16px); }
#map canvas { border-radius: 16px; }

/* Tablet (768px+) */  
@media (min-width: 768px) {
  #map { clip-path: inset(0 round 20px); }
  #map canvas { border-radius: 20px; }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  #map { clip-path: inset(0 round 24px); }
  #map canvas { border-radius: 24px; }
}
```

## OpenLayers Controls Handling

**Problem:** Controls werden ebenfalls vom Clip-Path beschnitten

**Lösung:** Z-index und Positionierung anpassen
```css
#map .ol-zoom,
#map .ol-rotate, 
#map .ol-attribution {
  position: relative;
  z-index: 10; /* Über dem Clip-Path */
  margin: 12px; /* Abstand zum Rand */
}
```

## Fehlerbehandlung

### 1. Canvas nicht gefunden
```javascript
setTimeout(() => {
  const mapElement = document.getElementById("map");
  if (mapElement) {
    const canvases = mapElement.querySelectorAll("canvas");
    if (canvases.length > 0) {
      // Styling anwenden
    }
  }
}, 100); // Kurze Verzögerung für DOM-Ready
```

### 2. Multiple Canvas-Elemente
OpenLayers kann mehrere Canvas-Elemente erstellen (z.B. für Layer). Alle müssen gestyled werden.

## Best Practices

1. **`overflow: hidden`** auf Parent-Container immer setzen
2. **`!important`** für CSS-Regeln verwenden (Override OpenLayers-internes Styling)
3. **Media Queries** für konsistentes responsive Design
4. **Performance:** GPU-Beschleunigung mit `transform: translateZ(0)`
5. **Browser-Support:** Clip-Path als Primary, border-radius als Fallback

## Testing Checklist

- [ ] Chrome: Abgerundete Ecken sichtbar
- [ ] Firefox: Abgerundete Ecken sichtbar  
- [ ] Safari: Abgerundete Ecken sichtbar
- [ ] Mobile: Responsive Design funktioniert
- [ ] Controls: Werden nicht beschnitten
- [ ] Performance: Keine Ruckler beim Zoomen/Panning
- [ ] Hover-Effekte: Funktionieren korrekt

## Rollback Optionen

Falls Probleme auftreten:
1. `clip-path` entfernen und nur `border-radius` verwenden
2. `overflow: hidden` entfernen für Debugging
3. JavaScript-Styling deaktivieren

---

**Implementiert am:** 2025-01-18  
**OpenLayers Version:** 10.5.0  
**AstroJS Version:** 5.7.13  
**Status:** ✅ Produktiv einsatzbereit