# p2d2: Public-Public Data-DNA

> [English version below](#english-version) | [Deutsche Version](#deutsche-version)

***

<a name="deutsche-version"></a>
## Deutsche Version

### Leitgedanke

Das Projekt **p2d2 (Public-Public Data-DNA)** verfolgt das Ziel, die offenen Daten der öffentlichen Verwaltung mit den Daten der Öffentlichkeit (z. B. OpenStreetMap) zu verzahnen. So entstehen zwei unabhängige, aber synchrone Datenpools – wie die beiden Stränge einer DNA:

1. Datenpool der Verwaltungen
2. Datenpool der Öffentlichkeit

Beide sollen gleichwertig, transparent und souverän miteinander interagieren. Dies fördert Teilhabe, Vertrauen, Innovation und Kooperation in der digitalen Infrastruktur von Städten und Kommunen.

***

### Features

- Integration von OpenStreetMap als öffentliche Datenbasis
- Verwaltungsdaten synchronisieren mit offenen Daten
- Interaktive Karten mit OpenLayers + GeoServer/WMS
- TailwindCSS + Astro für schnelle, moderne Weboberfläche
- Strikte Open Source-Orientierung (GPLv3) – Offen, transparent, erweiterbar
- Fokus auf Community-Beiträge: Mitmachen statt nur Zuschauen

***

### Installation & Nutzung

#### Voraussetzungen

- Node.js ≥ 20
- npm, pnpm oder yarn
- Linux oder macOS empfohlen (getestet unter Arch Linux)

#### Setup

```bash
# Repository klonen
git clone https://gitlab.opencode.de/OC000028072444/p2d2.git
cd p2d2

# Abhängigkeiten installieren
npm install

# Entwicklungsumgebung starten
npm run dev

# Live-Zugriff auf lokalen dev-Server
firefox http://localhost:4321
# bzw. Aufruf im Browser: http://localhost:4321

# Produktion bauen
npm run build

# Produktion lokal testen
npm run preview
```


#### Kollaboration

Es existieren 3 Feature-Branches:

1. `feature/team-de1/setup`
2. `feature/team-de2/setup`
3. `feature/team-fv/setup`

Diese lassen sich aus Team-Repos einbinden und per Webhook automatisch deployen lassen:

1. https://f-de1.data-dna.eu
2. https://f-de2.data-dna.eu
3. https://f-fv.data-dna.eu

Sie werden nach der QS in den `develop-` und danach `main`-Branch gemerged:

- https://dev.data-dna.eu
- https://www.data-dna.eu

Technische Details zum Multi-Repo-Multi-Staging siehe `MultiRepo-MultiStaging.md`.

Die aktuelle Produktivinstanz (Branch `main`) wird also unter **https://www.data-dna.eu** bereitgestellt.

---

### Repos, Branching \& Deployment

Es existieren drei synchron gehaltene Repositories:

- **[origin](https://gitlab.opencode.de/OC000028072444/p2d2.git)** auf OpenCode.de: Zentrales Repo, CI/CD - 
- **[mirror](https://gitlab.opencode.de/unbox-cologne/p2d2/p2d2-mirror.git)** auf OpenCode.de: Spiegel für Versionsverwaltung
- **[hub](https://github.com/Peter-Koenig/p2d2-hub.git)** auf GitHub: Internationale Zusammenarbeit

Folgende Branches wurden angelegt, Webseiten und Prozessimplementierung stehen aus (Stand 3.9.2025):

- **develop**: Integration neuer Features, automatisch nach `dev.data-dna.eu`
- **main**: produktionsreifer Code, Deployment auf `www.data-dna.eu`
- **release**: Staging \& finale Tests vor Veröffentlichung
- **feature/team-name**: Neue Features, getrennt nach Teams

Siehe `MERGEPOLICY.md` für Details.

---

### Mitmachen

Wir freuen uns über Beiträge jeder Art:

- Fehler melden
- Neue Features vorschlagen oder implementieren
- Dokumentation verbessern
- Daten beitragen oder qualitätssichern
- UI/UX-Ideen teilen

Siehe `CONTRIBUTING.md`.

---

### Dokumentation (Doku-Server im Aufbau)

- [Zentrale Dokumentation](https://doc.data-dna.eu): doc.data-dna.eu
- Deployment-Regeln: `.github/DEPLOYMENTRULES.md`
- Code Reviews: `.github/CODEREVIEWGUIDE.md`
- Branch-Merge-Policy: `.github/MERGEPOLICY.md`

---

### Lizenz

Dieses Projekt steht unter der **General Public License Version 3 (GPLv3)** – siehe `LICENSE`.

---

### Kontakt \& Community

- Website: [www.data-dna.eu](https://www.data-dna.eu)
- Mastodon: [@P2D2@nrw.social](https://nrw.social/@P2D2)
- Weitere Kanäle siehe Footer auf der Website

---

<a name="english-version"></a>

## English Version

### Core Idea

The **p2d2 (Public-Public Data-DNA)** project aims to interlink open data from public administrations with data from the public (e.g., OpenStreetMap). This creates two independent yet synchronized data pools – like the two strands of DNA:

1. Administration data pool
2. Public data pool

Both should interact equally, transparently, and sovereignly. This promotes participation, trust, innovation, and cooperation in the digital infrastructure of cities and municipalities.

---

### Features

- Integration of OpenStreetMap as a public data foundation
- Synchronization of administrative data with open data
- Interactive maps using OpenLayers + GeoServer/WMS
- TailwindCSS + Astro for fast, modern web interfaces
- Strict open source orientation (GPLv3) – Open, transparent, extensible
- Focus on community contributions: Participate instead of just watching

---

### Installation \& Usage

#### Prerequisites

- Node.js ≥ 20
- npm, pnpm or yarn
- Linux or macOS recommended (tested on Arch Linux)


#### Setup

```
# Clone repository
git clone https://gitlab.opencode.de/OC000028072444/p2d2.git
cd p2d2

# Install dependencies
npm install

# Start development environment
npm run dev

# Live access to local dev server
firefox http://localhost:4321
# or open in browser: http://localhost:4321

# Build for production
npm run build

# Test production build locally
npm run preview
```


#### Collaboration

There are 3 feature branches:

1. `feature/team-de1/setup`
2. `feature/team-de2/setup`
3. `feature/team-fv/setup`

These can be integrated from team repos and automatically deployed via webhook:

1. https://f-de1.data-dna.eu
2. https://f-de2.data-dna.eu
3. https://f-fv.data-dna.eu

After QA, they are merged into the `develop` branch and then into `main`:

- https://dev.data-dna.eu
- https://www.data-dna.eu

For technical details on multi-repo multi-staging, see `MultiRepo-MultiStaging.md`.

The current production instance (branch `main`) is available at **https://www.data-dna.eu**.

### Repos, Branching \& Deployment

There are three synchronized repositories:

- **origin** on OpenCode.de: Central repo, CI/CD - https://gitlab.opencode.de/OC000028072444/p2d2.git
- **mirror** on OpenCode.de: Mirror for version control - https://gitlab.opencode.de/unbox-cologne/p2d2/p2d2-mirror.git
- **hub** on GitHub: International collaboration - https://github.com/Peter-Koenig/p2d2-hub.git

The following branches were created, websites and process implementation are pending (as of 3.9.2025):

- **develop**: Integration of new features, automatically to `dev.data-dna.eu`
- **main**: production-ready code, deployment to `www.data-dna.eu`
- **release**: Staging \& final tests before release
- **feature/team-name**: New features, separated by teams

See `MERGEPOLICY.md` for details.

***

### Contributing

We welcome contributions of all kinds:

- Report bugs
- Suggest or implement new features
- Improve documentation
- Contribute or quality-check data
- Share UI/UX ideas

See `CONTRIBUTING.md`.

### Documentation

- Central documentation: https://doc.data-dna.eu
- Deployment rules: `.github/DEPLOYMENTRULES.md`
- Code reviews: `.github/CODEREVIEWGUIDE.md`
- Branch merge policy: `.github/MERGEPOLICY.md`

***

### License

This project is licensed under the **General Public License Version 3 (GPLv3)** – see `LICENSE`.

***

### Contact \& Community

- Website: [www.data-dna.eu](https://www.data-dna.eu)
- Mastodon: [@P2D2@nrw.social](https://nrw.social/@P2D2)
- More channels see footer on the website

```
