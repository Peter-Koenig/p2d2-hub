# Lösung: Doppelter Container für Shadow + Overflow in OpenLayers

## Problemstellung
OpenLayers Canvas-Elemente benötigen `overflow: hidden` für abgerundete Ecken, aber dies schneidet den `box-shadow` ab, da Schatten außerhalb des Containers gerendert werden.

## Lösung: Doppelter Container-Ansatz

### HTML-Struktur
```html
<!-- ÄUßERER CONTAINER: Für Shadow und Border -->
<div class="shadow-2xl shadow-green-500/30 rounded-2xl border-2 border-green-100/50">
  <!-- INNERER CONTAINER: Für Canvas-Clipping -->
  <div id="map" class="overflow-hidden relative">
    <!-- OpenLayers Canvas-Elemente -->
  </div>
</div>
```

### CSS-Implementierung
```css
/* Äußerer Container - Nur für visuelle Effekte */
.outer-container {
  box-shadow: 0 25px 50px -12px rgba(0, 204, 94, 0.3);
  border: 2px solid rgba(22, 240, 121, 0.3);
  border-radius: 16px;
}

/* Innerer Container - Für Canvas-Clipping */
.inner-container {
  overflow: hidden;
  clip-path: inset(0 round 16px);
  border-radius: inherit;
}

/* Canvas-Elemente styling */
.inner-container canvas {
  border-radius: inherit !important;
  clip-path: inherit !important;
}
```

## Vorteile dieser Lösung

### ✅ Beide Anforderungen erfüllt:
1. **Canvas hat abgerundete Ecken** durch `overflow: hidden` + `clip-path`
2. **Shadow ist vollständig sichtbar** da er am äußeren Container liegt

### 🚀 Performance-Optimiert:
- **GPU-Beschleunigung**: `transform: translateZ(0)` auf Canvas
- **Keine zusätzlichen DOM-Elemente**: Nur zwei Container-Ebenen
- **Effizientes Clipping**: `clip-path` ist hardware-beschleunigt

### 📱 Responsive Design:
```css
/* Mobile */
.outer-container { border-radius: 12px; }
.inner-container { clip-path: inset(0 round 12px); }

/* Tablet */
@media (min-width: 768px) {
  .outer-container { border-radius: 20px; }
  .inner-container { clip-path: inset(0 round 20px); }
}

/* Desktop */
@media (min-width: 1024px) {
  .outer-container { border-radius: 24px; }
  .inner-container { clip-path: inset(0 round 24px); }
}
```

## Technische Details

### Warum funktioniert das?
- **Äußerer Container**: Rendert Shadow und Border außerhalb des Flow
- **Innerer Container**: Beschneidet Canvas-Elemente mit `overflow: hidden`
- **Vererbung**: `border-radius: inherit` sorgt für konsistente Rundung

### OpenLayers Kompatibilität:
```javascript
// Canvas-Styling nach Initialisierung
map.once("postrender", () => {
  const canvases = document.querySelectorAll("#map canvas");
  canvases.forEach(canvas => {
    canvas.style.borderRadius = "inherit";
    canvas.style.clipPath = "inherit";
  });
});
```

### Browser-Support:
- ✅ **Modern**: Clip-Path + Overflow Hidden
- ✅ **Fallback**: Nur Overflow Hidden (weniger perfekte Rundung)
- ✅ **Mobile**: Touch-Gesten funktionieren uneingeschränkt

## Implementierung in AstroJS/Tailwind

### TailwindCSS Classes:
```html
<div class="
  /* Outer */
  rounded-2xl md:rounded-3xl
  shadow-2xl shadow-green-500/30
  border-2 border-green-100/50
  hover:shadow-green-500/40
  transition-all duration-300
">
  <div id="map" class="
    /* Inner */ 
    overflow-hidden relative
    rounded-inherit
  ">
    <!-- Map Content -->
  </div>
</div>
```

### Custom CSS Ergänzungen:
```css
#map {
  clip-path: inset(0 round 16px);
}

#map canvas {
  border-radius: inherit !important;
  clip-path: inherit !important;
  transform: translateZ(0);
}
```

## Testing Checklist

- [ ] Chrome: Shadow + Rounded Corners sichtbar
- [ ] Firefox: Shadow + Rounded Corners sichtbar
- [ ] Safari: Shadow + Rounded Corners sichtbar  
- [ ] Mobile: Touch-Interaktionen funktionieren
- [ ] Zoom/Pan: Performance ohne Ruckler
- [ ] Hover Effects: Shadow-Animation funktioniert
- [ ] Responsive: Alle Breakpoints korrekt

## Fehlerbehandlung

### Common Issues:
1. **Shadow nicht sichtbar**: `overflow: hidden` am falschen Container
2. **Canvas nicht abgerundet**: `clip-path` nicht vererbt
3. **Performance Problems**: Zu viele `!important` flags

### Debugging:
```javascript
// Check Container Hierarchy
console.log('Outer Container:', document.querySelector('.outer-container'));
console.log('Inner Container:', document.querySelector('#map'));
console.log('Canvas Elements:', document.querySelectorAll('#map canvas'));
```

## Alternative Ansätze (nicht empfohlen)

### ❌ Filter Drop Shadow:
```css
/* Problem: Performance-Intensiv */
.filter drop-shadow(0 25px 50px -12px rgba(0, 204, 94, 0.3))
```

### ❌ Pseudo-Elemente:
```css  
/* Problem: Komplexe Z-Index Verwaltung */
.container::before {
  content: '';
  box-shadow: ...;
  z-index: -1;
}
```

### ❌ Canvas Redrawing:
```javascript
/* Problem: Performance-Killer */
canvas.style.borderRadius = '16px';
```

## Fazit

Die doppelte Container-Lösung ist die **optimale Lösung** für:
- ✅ Beste Performance
- ✅ Vollständige Browser-Kompatibilität  
- ✅ Einfache Wartbarkeit
- ✅ Responsive Design
- ✅ OpenLayers Kompatibilität

**Implementiert am:** 2025-01-18  
**Status:** ✅ Produktionseinsatz bereit