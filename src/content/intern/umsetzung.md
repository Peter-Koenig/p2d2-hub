---
name: Umsetzung
url: /ueber/umsetzung
title: "Umsetzung"  
order: 3
description: "Technische Architektur und Implementierungsstrategie"
---

# Wie wir es umsetzen

Die technische Umsetzung von p2d2 folgt bewährten Open-Source-Prinzipien und modernen Web-Standards. Unsere Architektur ist darauf ausgelegt, skalierbar, wartbar und erweiterbar zu sein.

## Technologie-Stack

### Frontend
- **AstroJS**: Static Site Generation mit optimaler Performance
- **OpenLayers**: Bewährte Open-Source-Kartenbibliothek  
- **TypeScript**: Typisierte Entwicklung für höhere Codequalität
- **Tailwind CSS**: Utility-First CSS für konsistentes Design

### Backend & Daten
- **PostgreSQL/PostGIS**: Räumliche Datenbank mit GIS-Erweiterungen
- **GeoServer**: OGC-konforme Geodatenserver-Lösung
- **WFS-T**: Transaktionale Web Feature Services für Live-Editing
- **Python**: Datenverarbeitung und Automatisierung

## Entwicklungsprozess

### Agile Methodik
Wir arbeiten in zweiwöchigen Sprints mit festen Rollen:

- **Team DE1**: Core-Entwicklung und Infrastruktur
- **Team DE2**: Externe Beauftragungen beim GIS-Partner
- **Team FV1**: Externe Beauftragungen im AstroJS-Umfeld

### Branch-Strategie
```
release/v1.2.3  ← Produktive Releases
main            ← Stabile Entwicklung  
develop         ← Feature-Integration
feature/team-*  ← Aktive Entwicklung
```

### CI/CD Pipeline
- **Develop-Branch** → automatisches Deployment auf `dev.data-dna.eu`
- **Main-Branch** → automatisches Deployment auf `www.data-dna.eu`
- **Release-Tags** → versionierte Releases mit Changelog

## Datenmodell

### Container-Konzept
Alle räumlichen Objekte werden als "Container" mit einheitlichen Eigenschaften erfasst:

```
interface Container {
  id: string;
  containerType: 'cemetery' | 'park' | 'public' | 'administrative';
  name: string;
  municipality: string;
  geometry: Polygon | MultiPolygon;
  createdAt: Date;
  updatedAt: Date;
  contributors: string[];
}
```

### Qualitätssicherung
- **Automatische Validierung** von Geometrien und Attributen
- **Community-Reviews** für kritische Änderungen
- **Historisierung** aller Datenänderungen mit Rollback-Funktion

## Deployment-Infrastruktur

### Hosting
- **Proxmox VE**: Virtualisierte Server-Infrastruktur
- **OPNsense**: Firewall und Netzwerk-Management
- **GitLab CI**: Automatisierte Builds und Tests

### Monitoring
- **Uptime-Monitoring**: 24/7 Überwachung aller Services
- **Performance-Metrics**: Response-Zeiten und Ressourcenverbrauch
- **Error-Tracking**: Automatische Benachrichtigungen bei Problemen

*Durch diese durchdachte technische Basis schaffen wir eine zukunftssichere Plattform für die nächsten Jahre.*

