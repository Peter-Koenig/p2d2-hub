# Dependency Update Workflow – p2d2 Projekt

## Überblick

Dieser Prozess beschreibt das Vorgehen für Updates von Abhängigkeiten (z.B. AstroJS) im p2d2-Projekt mit verteilten Teams und Multi-Repo-Setup.

## Rollen

- **Tech Lead (TL)**: Verantwortlich für Updates und Koordination
- **Team-Mitglieder**: Testen Updates in ihren Feature-Branches

## Workflow

### Phase 1: Update durch Tech Lead

1. **Feature-Branch erstellen**
   ```
   git checkout develop
   git pull hub develop
   git checkout -b feature/dependency-update-YYYY-MM-DD
   ```

2. **Dependencies aktualisieren**
   ```
   # Option A: Automatisch (empfohlen für Astro)
   npx @astrojs/upgrade
   
   # Option B: Manuell
   npm update
   # oder spezifisch:
   npm install astro@latest
   ```

3. **Installation und Test**
   ```
   npm install
   rm -rf .astro/ node_modules/.astro node_modules/.vite
   DEBUG=astro:* npm run dev -- --host 0.0.0.0
   ```

4. **Commit und Merge**
   ```
   git add package.json package-lock.json
   git commit -m "chore: Update dependencies (Astro X.Y.Z)"
   git checkout develop
   git merge feature/dependency-update-YYYY-MM-DD
   git push all develop
   ```

### Phase 2: Deployment auf Dev-Umgebung

5. **Automatisches Deployment**
   - CI/CD deployt `develop` automatisch nach `dev.data-dna.eu`
   
6. **Test auf Dev-Umgebung**
   - TL testet alle Hauptfunktionen auf dev.data-dna.eu
   - Bei Problemen: Bugfix in `develop` oder Rollback

### Phase 3: Team-Testing

7. **Team-Benachrichtigung**
   - TL informiert Teams per Issue/Mail/Chat:
     ```
     Update verfügbar in develop:
     - Astro X.Y.Z
     - [weitere Updates]
     
     Bitte pullen, npm install ausführen und testen.
     Feedback bis [Datum] in Issue #XYZ
     ```

8. **Team-Members führen lokal aus**
   ```
   git checkout develop
   git pull hub develop
   npm install
   rm -rf .astro/ node_modules/.astro node_modules/.vite
   DEBUG=astro:* npm run dev -- --host 0.0.0.0
   ```

9. **Feedback-Sammlung**
   - Teams melden Issues oder geben OK
   - TL behebt kritische Issues in `develop`

### Phase 4: Production Release

10. **Merge nach Main**
    ```
    git checkout main
    git pull hub main
    git merge develop
    git push all main
    ```

11. **Deployment auf Production**
    - CI/CD deployt automatisch nach `www.data-dna.eu`
    - TL führt Smoke-Tests durch

12. **Dokumentation**
    - Update im CHANGELOG.md dokumentieren
    - Release-Notes erstellen (optional)

## Wichtige Hinweise

### Für Tech Lead

- **package-lock.json IMMER committen** (garantiert identische Versionen)
- Breaking Changes im Commit-Message kennzeichnen
- Bei Major-Updates: ausführliche Tests und Dokumentation
- `git push all` pusht zu allen Remotes (hub, mirror, origin)

### Für Team-Members

- **Nach jedem Pull mit package.json-Änderungen**: `npm install` ausführen
- Bei Build-Problemen: Cache löschen (`.astro/`, `node_modules/.astro`, `node_modules/.vite`)
- Keine Updates in Feature-Branches durchführen (Merge-Konflikte vermeiden)

## Automatisierung (Optional)

GitHub Action für automatische Dependency-Checks:

```
name: Check Dependencies
on:
  schedule:
    - cron: '0 9 * * 1'  # Montags 9:00 Uhr
  workflow_dispatch:

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm outdated || true
      - run: npx @astrojs/upgrade --check
```

## Troubleshooting

### "Module not found" Fehler nach Pull
```
rm -rf node_modules package-lock.json
npm install
```

### Veraltete Remote-Branches
```
git fetch --prune
git remote prune origin
```

### Cache-Probleme
```
rm -rf .astro/ node_modules/.astro node_modules/.vite
npm run dev
```

---

# Dependency Update Workflow – p2d2 Project

## Overview

This process describes the procedure for updating dependencies (e.g., AstroJS) in the p2d2 project with distributed teams and multi-repo setup.

## Roles

- **Tech Lead (TL)**: Responsible for updates and coordination
- **Team Members**: Test updates in their feature branches

## Workflow

### Phase 1: Update by Tech Lead

1. **Create Feature Branch**
   ```
   git checkout develop
   git pull hub develop
   git checkout -b feature/dependency-update-YYYY-MM-DD
   ```

2. **Update Dependencies**
   ```
   # Option A: Automatic (recommended for Astro)
   npx @astrojs/upgrade
   
   # Option B: Manual
   npm update
   # or specific:
   npm install astro@latest
   ```

3. **Install and Test**
   ```
   npm install
   rm -rf .astro/ node_modules/.astro node_modules/.vite
   DEBUG=astro:* npm run dev -- --host 0.0.0.0
   ```

4. **Commit and Merge**
   ```
   git add package.json package-lock.json
   git commit -m "chore: Update dependencies (Astro X.Y.Z)"
   git checkout develop
   git merge feature/dependency-update-YYYY-MM-DD
   git push all develop
   ```

### Phase 2: Deployment to Dev Environment

5. **Automatic Deployment**
   - CI/CD automatically deploys `develop` to `dev.data-dna.eu`
   
6. **Test on Dev Environment**
   - TL tests all main functions on dev.data-dna.eu
   - If issues occur: Bugfix in `develop` or rollback

### Phase 3: Team Testing

7. **Team Notification**
   - TL notifies teams via issue/email/chat:
     ```
     Update available in develop:
     - Astro X.Y.Z
     - [other updates]
     
     Please pull, run npm install and test.
     Feedback until [date] in issue #XYZ
     ```

8. **Team Members Execute Locally**
   ```
   git checkout develop
   git pull hub develop
   npm install
   rm -rf .astro/ node_modules/.astro node_modules/.vite
   DEBUG=astro:* npm run dev -- --host 0.0.0.0
   ```

9. **Collect Feedback**
   - Teams report issues or give OK
   - TL fixes critical issues in `develop`

### Phase 4: Production Release

10. **Merge to Main**
    ```
    git checkout main
    git pull hub main
    git merge develop
    git push all main
    ```

11. **Deploy to Production**
    - CI/CD automatically deploys to `www.data-dna.eu`
    - TL performs smoke tests

12. **Documentation**
    - Document update in CHANGELOG.md
    - Create release notes (optional)

## Important Notes

### For Tech Lead

- **ALWAYS commit package-lock.json** (guarantees identical versions)
- Mark breaking changes in commit message
- For major updates: extensive testing and documentation
- `git push all` pushes to all remotes (hub, mirror, origin)

### For Team Members

- **After every pull with package.json changes**: run `npm install`
- For build issues: clear cache (`.astro/`, `node_modules/.astro`, `node_modules/.vite`)
- Don't perform updates in feature branches (avoid merge conflicts)

## Automation (Optional)

GitHub Action for automatic dependency checks:

```
name: Check Dependencies
on:
  schedule:
    - cron: '0 9 * * 1'  # Mondays 9:00 AM
  workflow_dispatch:

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm outdated || true
      - run: npx @astrojs/upgrade --check
```

## Troubleshooting

### "Module not found" errors after pull
```
rm -rf node_modules package-lock.json
npm install
```

### Outdated remote branches
```
git fetch --prune
git remote prune origin
```

### Cache issues
```
rm -rf .astro/ node_modules/.astro node_modules/.vite
npm run dev
```
