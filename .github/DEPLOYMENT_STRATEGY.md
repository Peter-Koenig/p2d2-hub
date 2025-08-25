## Deployment-Strategie (DE)

### Deployment-relevante Review-Aspekte
- [ ] Prüfe Environment-Konfigurationen für verschiedene Umgebungen
- [ ] Stelle sicher, dass Build-Skripte für alle Zielumgebungen funktionieren
- [ ] Verifiziere, dass keine hardgecodeten Environment-URLs vorhanden sind
- [ ] Prüfe die Konsistenz von Subdomain-Konventionen (dev.data-dna.eu, www.data-dna.eu)

### Branch-spezifische Anforderungen
- **main**: Nur getaggte Releases für Produktionsdeployments
- **develop**: Automatische Deployments zur Entwicklungsumgebung
- **feature/***: Optional Preview-Deployments für Testing
- **release/***: Test-Deployments vor Produktionsrelease

### Sicherheits-Checkliste für Deployments
- [ ] Keine sensiblen Daten in Version Control
- [ ] Environment-Variablen korrekt konfiguriert
- [ ] Deployment-Berechtigungen restriktiv gesetzt
- [ ] Rollback-Strategien definiert und getestet

## Deployment Strategy (EN)

### Deployment-related Review Aspects
- [ ] Check environment configurations for different deployment targets
- [ ] Ensure build scripts work for all target environments
- [ ] Verify no hardcoded environment URLs are present
- [ ] Check consistency of subdomain conventions (dev.data-dna.eu, www.data-dna.eu)

### Branch-specific Requirements
- **main**: Tagged releases only for production deployments
- **develop**: Automatic deployments to development environment
- **feature/***: Optional preview deployments for testing
- **release/***: Test deployments before production release

### Security Checklist for Deployments
- [ ] No sensitive data in version control
- [ ] Environment variables properly configured
- [ ] Deployment permissions set restrictively
- [ ] Rollback strategies defined and tested
