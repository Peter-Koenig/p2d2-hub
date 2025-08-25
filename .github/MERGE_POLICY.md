# Merge- und Branch-Policy für p2d2
: Hinweis: Nach Vorgabe KI-generiert, detaillierter Review und Implementierung aussetehend (25.8.2025)

## Visuell

```
flowchart LR
  subgraph Feature Entwicklung
    A[feature/something]
    A -->|PR & Review| B(develop)
  end
  B -->|Release vorbereiten| C(release/vX.Y.Z)
  C -->|Staging Test, PR & Review| D(main)
  B -->|Automatisches Deployment| DEV[dev.data-dna.eu]
  C -->|Deployment| STAGING[staging.data-dna.eu]
  D -->|Deployment + Tag| PROD[www.data-dna.eu]

  style B fill:#B2FFD6,stroke:#222
  style D fill:#ffd1b2,stroke:#222
  style PROD fill:#ffe9a2,stroke:#222
  style DEV fill:#a2e0ff,stroke:#222
  style STAGING fill:#ffa2bd,stroke:#222
```

## Deutsch

### Allgemeine Grundsätze

- Alle Änderungen erfolgen über Pull Requests.
- Code Reviews sind vor dem Merge verpflichtend.
- Der Hauptbranch (main) muss jederzeit deploybar sein.
- Für Releases gilt Semantische Versionierung.

### Anforderungen an Pull Requests

#### Vor dem Einreichen

- [ ] Branch ist auf dem aktuellen Stand zum Ziel-Branch.
- [ ] Code hält sich an Projektkonventionen.
- [ ] Tests sind enthalten und bestanden.
- [ ] Dokumentation ist bei Bedarf aktualisiert.
- [ ] Änderungen sind fokussiert und atomar.

#### Review-Prozess

- Mindestens eine genehmigte Review erforderlich.
- Alle CI-Prüfungen müssen bestanden sein.
- Bei sensiblen Bereichen ist ein Code-Owner-Review nötig.
- Alle Review-Kommentare müssen adressiert werden, bevor gemerged wird.

### Merge-Methoden

- **Bevorzugt: Squash and Merge**: Für Feature-Branches—sorgt für eine
  saubere Commit-History.
- **Erlaubt: Rebase and Merge**: Für lineare History, vorsichtig und
  selten nutzen.
- **Nicht erlaubt: Merge Commit**: Nur in Ausnahmefällen.

### Branch-Spezifische Richtlinien

- **Feature Branches → develop**: Squash & Merge bevorzugt; bei
  Konflikten vorher rebasen.
- **Bugfix Branches → develop**: Wie Feature-Branches. Hotfixes ggf.
  direkt nach main.
- **develop → main**: Nur via getaggte Releases. Ausgiebig testen und
  Release Notes beilegen.

### Konfliktlösung

- Autor:innen lösen Konflikte, rebasen ggf. auf Zielbranch.
- Bei komplexen Konflikten kann Unterstützung geholt werden.

### Ausnahmeverfahren

- Bei kritischen Fehlern kann ein Admin den Prozess umgehen — mit Dokumentation und nachfolgendem Review.

### Branch Protection Regeln

#### Geschützte Branches

Branch **main**:

- Pull-Request Reviews verpflichtend
- Status Checks vor Merge erforderlich (Linting, Unit-Tests, Build, Security)
- Auflösung von Diskussionen obligatorisch
- Admins eingeschlossen, kein Force Push
- Löschen oder direkte Pushes nicht erlaubt

Branch **develop**:

- Wie main

#### Review-Anforderungen

- Mindestens 1 Reviewer
- Code Owner Review ggf. verpflichtend
- Widerruf bei veralteter Freigabe nach neuem Commit

#### Ausnahme-Handling

- Im Notfall können Admins temporär Regeln außer Kraft setzen (mit Dokumentation).

------------------------------------------------------------------------

## English

### General Principles

- All changes must go through pull requests.
- Code reviews are mandatory before merging.
- The main branch should always be deployable.
- Follow semantic versioning for releases.

### Pull Request Requirements

#### Before Submission

- [ ] Branch is up to date with target branch
- [ ] Code follows project conventions
- [ ] Tests are included and passing
- [ ] Documentation updated if needed
- [ ] Changes are focused and atomic

#### Review Process

- Minimum of 1 approved review required
- All CI checks must pass
- Code owner review required for sensitive areas
- Address all review comments before merging

### Merge Methods

- **Preferred: Squash and Merge**: For feature branches; provides a single commit on target branch.
- **Allowed: Rebase and Merge**: For linear history, used sparingly.
- **Not Allowed: Merge Commit**: Merge commits clutter history and are only permitted in special cases.

### Branch Specific Policies

- **Feature Branches → develop**: Squash and merge preferred; rebase before merging if conflicts exist
- **Bugfix Branches → develop**: Like feature branches. Hotfixes may go directly to main if urgent
- **develop → main**: Only through tagged releases, requires thorough testing and release notes

### Conflict Resolution

- Authors are responsible for resolving conflicts, rebase onto target branch if needed
- Seek help if conflicts are complex

### Emergency Procedures

- Administrators may bypass normal procedures with documentation and follow-up review for critical fixes

### Branch Protection Rules

#### Protected Branches

Branch **main**:

- Require pull request reviews before merging
- Require status checks to pass before merging (linting, unit tests, build, security)
- Require conversation resolution before merging
- Include administrators; no force pushes allowed
- Deletions or direct pushes are not allowed

Branch **develop**:

- Same as main

#### Review Requirements

- Minimum of 1 reviewer required
- Dismiss stale pull request approvals when new commits are pushed
- Require review from Code Owners

#### Exception Handling

- In emergencies, administrators can temporarily override protections with proper documentation.
