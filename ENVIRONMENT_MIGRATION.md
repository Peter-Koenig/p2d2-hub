# Environment Variable Migration - P2D2 Projekt

## Überblick

Diese Migration löst das Deployment-Problem, bei dem `dotenv` nicht im Production-Build verfügbar war und zu Build-Fehlern führte.

## Problem

**Fehlermeldung:**
```
[vite]: Rollup failed to resolve import "dotenv" from "/var/www/astro/opn-data-dna_deploys/20250918005932/src/utils/env-config.ts"
```

**Ursache:**
- `dotenv` war nur als `devDependency` installiert
- `env-config.ts` versuchte `dotenv` dynamisch zu importen
- Dies führte zu Build-Fehlern im Production-Server

## Lösung

### 1. Entfernte Dateien

**`src/utils/env-config.ts`** - Komplett entfernt
- Enthielt dotenv-Importe und dynamische Environment-Loading-Logik
- War nur für Server-Skripte gedacht, verursachte aber Build-Probleme

### 2. Migrierte Dateien

**`src/utils/wfs-config.ts`** - Auf `import.meta.env` migriert
```typescript
// Vorher (gemischt):
endpoint: process.env.WFST_ENDPOINT || import.meta.env.WFST_ENDPOINT,

// Nachher (nur import.meta.env):
endpoint: import.meta.env.WFST_ENDPOINT,
```

**`src/utils/wfs-auth.ts`** - `createWFSTClient()` synchron gemacht
- Entfernt: `import { loadEnvironment } from "./env-config";`
- `createWFSTClient()` ist jetzt synchron und verwendet `import.meta.env`
- WFST-Credentials werden direkt aus Environment-Variablen gelesen

**`src/utils/admin-polygon-sync.ts`** - An synchronen Client angepasst
- `getWFSTClient()` ist jetzt synchron
- `await` Aufrufe bei `getWFSTClient()` entfernt

**`src/scripts/manual-sync.ts`** - Eigene dotenv-Logik entfernt
- Entfernt: Custom `.env` File Loading
- Verwendet jetzt nur noch `process.env` für CLI-Skripte
- Gibt klare Hinweise zur Verwendung von Environment-Variablen

### 3. Wichtige Unterscheidung

**WFS (Read-only) vs. WFST (Write) Credentials:**

| Typ | Benutzer | Quelle | Status |
|-----|----------|--------|--------|
| **WFS** | `p2d2_wfs_user` | Hardcoded | Read-only Workaround |
| **WFST** | `p2d2_wfst_user` | Environment-Vars | Write-Berechtigung |

Die WFS-Credentials bleiben hardcodiert als temporärer Workaround (Issue #1), bis anonym GeoServer-Zugriff konfiguriert ist.

## Environment Variablen

### Für Production Deployment

**`.env.production`** (als Symlink):
```
WFST_WORKSPACE=Verwaltungsdaten
WFST_ENDPOINT=https://wfs.data-dna.eu/geoserver/Verwaltungsdaten/ows
WFST_USERNAME=p2d2_wfst_user
WFST_PASSWORD=*******************
WFST_NAMESPACE=urn:data-dna:govdata
```

### Für Development

**`.env.development`**:
```
WFST_WORKSPACE=Verwaltungsdaten
WFST_ENDPOINT=https://wfs.data-dna.eu/geoserver/ows
WFST_USERNAME=p2d2_wfst_user
WFST_PASSWORD=your_development_password
WFST_NAMESPACE=urn:data-dna:govdata
```

## Build & Deployment

### Vite/Astro Build Process
- Environment-Variablen werden zur **Build-Zeit** injiziert
- `import.meta.env.*` Werte werden statisch ersetzt
- Keine Laufzeit-Environment-Loading mehr nötig

### CLI Skripte
```bash
# Environment-Variablen setzen
WFST_USERNAME=p2d2_wfst_user WFST_PASSWORD=your_password npm run manual-sync

# Oder dauerhaft exportieren
export WFST_USERNAME=p2d2_wfst_user
export WFST_PASSWORD=your_password
npm run manual-sync
```

## Sicherheit

✅ **Keine PUBLIC_ Prefixe** - WFST-Variablen sind sicherheitskritisch  
✅ **Build-time Injection** - Credentials nicht im Frontend-Bundle  
✅ **Server-side only** - Sensitive Daten nur in API-Routes und Backend  
✅ **Symlink Deployment** - `.env.production` wird sicher eingebunden  

## Testing

1. **Development Test**: 
   ```bash
   npm run dev
   ```

2. **Production Build Test**:
   ```bash
   npm run build
   ```

3. **CLI Script Test**:
   ```bash
   WFST_USERNAME=test WFST_PASSWORD=test npm run manual-sync help
   ```

## Rollback

Falls notwendig, können die Änderungen durch Wiederherstellung der originalen Dateien rückgängig gemacht werden. Die dotenv-Abhängigkeit müsste dann jedoch wieder zu `dependencies` verschoben werden.

---
**Migration durchgeführt am:** 2025-01-18  
**Betroffene Issue:** Deployment-Fehler durch dotenv nicht verfügbar  
**Status:** ✅ Erfolgreich abgeschlossen