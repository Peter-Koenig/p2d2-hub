# Merge Policy

This document defines the merge policy for the p2d2 repository.

## General Principles

- All changes must go through pull requests
- Code reviews are mandatory before merging
- Main branch should always be deployable
- Follow semantic versioning for releases

## Pull Request Requirements

### Before Submission
- [ ] Branch is up to date with target branch
- [ ] Code follows project conventions
- [ ] Tests are included and passing
- [ ] Documentation is updated if needed
- [ ] Changes are focused and atomic

### Review Process
- Minimum of 1 approved review required
- All CI checks must pass
- Code owner review required for sensitive areas
- Address all review comments before merging

## Merge Methods

### Preferred: Squash and Merge
- Use for feature branches
- Creates a single commit on target branch
- Clean commit history
- Commit message should follow conventional commits format

### Allowed: Rebase and Merge
- Use for keeping linear history
- Requires clean commit history
- Should be used sparingly

### Not Allowed: Merge Commit
- Creates merge commits that clutter history
- Not permitted except for special circumstances

## Branch Specific Policies

### Feature Branches → develop
- Squash and merge preferred
- Must be rebased before merging if conflicts exist

### Bugfix Branches → develop
- Same as feature branches
- Hotfixes may go directly to main if urgent

### develop → main
- Only through tagged releases
- Requires thorough testing
- Release notes must be provided

## Conflict Resolution

- Authors are responsible for resolving conflicts
- Rebase onto target branch to resolve
- Seek help if conflicts are complex

## Emergency Procedures

For critical fixes, administrators may bypass normal procedures with proper documentation and follow-up review.

## Deployment-Strategie (DE)

### Branch-Modell und Environment-Mapping
- **main** → Produktionsumgebung (www.data-dna.eu)
- **develop** → Entwicklungsumgebung (dev.data-dna.eu)
- **feature/\*** → Feature-Preview-Umgebungen (feature-x.dev.data-dna.eu)
- **release/\*** → Release-Testumgebungen (release-x.dev.data-dna.eu)
- **hotfix/\*** → Hotfix-Testumgebungen (hotfix-x.dev.data-dna.eu)

### CI/CD Best Practices und Release-Ablauf
- Automatische Deployments nur nach erfolgreichen Merge-Prozessen
- Deployment-Trigger durch erfolgreiche Pipeline-Läufe nach Merges
- Manuelle Bestätigung für Produktionsdeployments erforderlich
- Environment-spezifische Konfiguration über Git-Branches

### Sicherheitsrichtlinien für Deployments
- Deployments ausschließlich von geprüften und gemergten Branches
- Code-Review-Pflicht vor jedem Merge und Deployment
- Semantisches Tagging für Versionierung und Nachverfolgbarkeit
- Audit-Logs für alle Merge- und Deployment-Aktivitäten

## Deployment Strategy (EN)

### Branch Model and Environment Mapping
- **main** → Production environment (www.data-dna.eu)
- **develop** → Development environment (dev.data-dna.eu)
- **feature/\*** → Feature preview environments (feature-x.dev.data-dna.eu)
- **release/\*** → Release testing environments (release-x.dev.data-dna.eu)
- **hotfix/\*** → Hotfix testing environments (hotfix-x.dev.data-dna.eu)

### CI/CD Best Practices and Release Workflow
- Automatic deployments only after successful merge processes
- Deployment triggers based on successful pipeline runs after merges
- Manual approval required for production deployments
- Environment-specific configuration via Git branches

### Security Policies for Deployments
- Deployments exclusively from reviewed and merged branches
- Mandatory code review before any merge and deployment
- Semantic tagging for versioning and traceability
- Audit logs for all merge and deployment activities
