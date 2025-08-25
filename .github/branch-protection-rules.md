# Branch Protection Rules

This document outlines the branch protection rules for the p2d2 repository.

## Protected Branches

### main Branch
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators
- ✅ Restrict who can push to matching branches
- ✅ Allow force pushes: ❌ Disabled
- ✅ Allow deletions: ❌ Disabled

### develop Branch
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators
- ✅ Allow force pushes: ❌ Disabled
- ✅ Allow deletions: ❌ Disabled

## Status Checks Requirements

Required status checks must pass before merging:
- ✅ Linting checks
- ✅ Unit tests
- ✅ Build verification
- ✅ Security scanning

## Review Requirements

- Minimum number of reviewers: 1
- Dismiss stale pull request approvals when new commits are pushed
- Require review from Code Owners

## Exception Handling

In case of emergencies, administrators can temporarily override protections with proper documentation.

## Deployment-Strategie (DE)

### Branch-Modell und Environment-Mapping
- **main** → Produktionsumgebung (www.data-dna.eu)
- **develop** → Entwicklungsumgebung (dev.data-dna.eu)
- **feature/\*** → Feature-Preview-Umgebungen (feature-x.dev.data-dna.eu)
- **release/\*** → Release-Testumgebungen (release-x.dev.data-dna.eu)
- **hotfix/\*** → Hotfix-Testumgebungen (hotfix-x.dev.data-dna.eu)

### CI/CD Best Practices
- Automatische Deployments nur von geprüften Branches
- Deployment-Trigger durch erfolgreiche Pipeline-Läufe
- Manuelle Bestätigung für Produktionsdeployments erforderlich
- Environment-spezifische Konfiguration über Git-Branches

### Sicherheitsrichtlinien
- Deployments ausschließlich von protected Branches
- Code-Review-Pflicht vor jedem Deployment
- Tagging für Versionierung und Nachverfolgbarkeit
- Audit-Logs für alle Deployment-Aktivitäten

## Deployment Strategy (EN)

### Branch Model and Environment Mapping
- **main** → Production environment (www.data-dna.eu)
- **develop** → Development environment (dev.data-dna.eu)
- **feature/\*** → Feature preview environments (feature-x.dev.data-dna.eu)
- **release/\*** → Release testing environments (release-x.dev.data-dna.eu)
- **hotfix/\*** → Hotfix testing environments (hotfix-x.dev.data-dna.eu)

### CI/CD Best Practices
- Automatic deployments only from reviewed branches
- Deployment triggers based on successful pipeline runs
- Manual approval required for production deployments
- Environment-specific configuration via Git branches

### Security Policies
- Deployments exclusively from protected branches
- Mandatory code review before any deployment
- Tagging for versioning and traceability
- Audit logs for all deployment activities
