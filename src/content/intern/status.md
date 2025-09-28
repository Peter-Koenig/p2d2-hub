---
name: Status
url: /ueber/status
title: "Status"
order: 4  
description: "Aktueller Entwicklungsstand und Roadmap"
---

# Wo wir stehen

p2d2 befindet sich in der aktiven Entwicklungsphase mit ersten produktiven Einsätzen. Hier der aktuelle Status unserer Komponenten:

## ✅ Implementiert & Produktiv

### Grundlegende Infrastruktur
- **Geodatenserver**: WFS/WMS-Services über GeoServer verfügbar
- **Kartendarstellung**: OpenLayers-Integration mit Multi-CRS-Support  
- **Content Management**: AstroJS mit Markdown-basierten Inhalten
- **CI/CD Pipeline**: Automatisches Deployment über GitLab

### Datenerfassung
- **WFS-Anbindung**: Live-Daten aus PostGIS-Datenbank
- **Administrative Grenzen**: Automatischer Import von OSM-Daten via Overpass-Turbo
- **Container-System**: Einheitliches Datenmodell für alle Objekttypen

## 🚧 In Entwicklung

### WFS-T Integration
- **Live-Editing**: Direkte Geometrie-Bearbeitung in der Karte
- **Batch-Import**: Massenimport von Geodaten aus verschiedenen Quellen
- **Conflict Resolution**: Behandlung konkurrierender Änderungen

## 📋 Geplant (Q4 2025 - Q1 2026)

### Community-Features  
- **User-Accounts**: Registrierung und Authentifizierung
- **Contribution-Tracking**: Bewertung und Anerkennung von Beiträgen
- **Notification-System**: Updates über Änderungen in interessanten Bereichen

### API-Erweiterungen
- **GraphQL-Endpoint**: Flexible Datenabfragen für Entwickler
- **Webhook-Support**: Event-basierte Benachrichtigungen
- **Rate-Limiting**: Schutz vor Missbrauch der öffentlichen APIs

*Stand heute sind die Grundlagen gelegt – jetzt bauen wir die Community auf!*

