# p2d2 – Public-Public Data-DNA

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-MVP-orange)]()
[![CI/CD](https://img.shields.io/badge/deployment-main→prod-green)]()

---

## 🌐 Leitgedanke

Das Projekt **p2d2 (Public-Public Data-DNA)** verfolgt das Ziel, die **offenen Daten der öffentlichen Verwaltung**
mit den Daten der Öffentlichkeit (z. B. OpenStreetMap) zu verzahnen.
Damit entstehen **zwei unabhängige, aber synchrone Datenpools** – wie die beiden Stränge einer DNA:

1. Datenpool der Verwaltungen
2. Datenpool der Öffentlichkeit

Beide sollen **gleichwertig, transparent und souverän** miteinander interagieren.
Das fördert **Teilhabe, Vertrauen, Innovation und Kooperation** in der digitalen Infrastruktur von Städten und Kommunen.

---

## ✨ Features

- 🌍 **Integration von OpenStreetMap** als öffentliche Datenbasis
- 🏛️ **Verwaltungsdaten synchronisieren** mit offenen Daten
- 🗺️ Interaktive Karten mit **OpenLayers + GeoServer/WMS**
- 💚 **TailwindCSS + Astro** für schnelle, moderne Weboberfläche
- 📦 Strikte **Open Source-Orientierung (GPLv3)**: Offen, transparent, erweiterbar
- 🚀 Fokus auf **Community-Beiträge** ("Mitmachen statt nur Zuschauen")

---

## 📦 Installation & Nutzung

### Voraussetzungen

- Node.js >= 20
- npm / pnpm / yarn
- Linux oder macOS empfohlen (getestet unter Arch Linux)

### Setup

```


# Repository klonen

git clone https://gitlab.opencode.de/OC000028072444/p2d2.git
cd p2d2

# Abhängigkeiten installieren

npm install

# Entwicklungsumgebung starten

npm run dev

# Live-Zugriff auf lokalen dev-Server

$ firefox http://localhost:4321 ( bzw. Aufruf im Brwoser: http://localhost:4321 )

# Produktion bauen

npm run build

# Produktion lokal testen

npm run preview

# Kollaboration:
Es existieren 3 Feature-Branches

1. feature/team-de1/setup
2. feature/team-de2/setup
2. feature/team-fv/setup

die sich aus Team-Repos einbinden und per Webhook automatisch deployen lassen:

1. https://f-de1.data-dna.eu
2. https://f-de2.data-dna.eu
3. https://f-fv.data-dna.eu

Diese werden nach der QS in den develop- und danach main-Branch gemerged:

develop -> https://dev.data-dna.eu
main    -> https://www.data-dna.eu

```

([Technische Details zum MultiRepo-Multi-Staging](https://gitlab.opencode.de/OC000028072444/p2d2/-/blob/main/MultiRepo-MultiStaging.md))

Die aktuelle Produktivinstanz (Branch `main`) wird also unter
👉 https://www.data-dna.eu bereitgestellt.

---

## 🔀 Repos, Branching & Deployment

Es exisitieren drei synchron gehaltene Repositories:

- **[origin auf OpenCode.de](https://gitlab.opencode.de/OC000028072444/p2d2.git)** → Zentrales Repo, CI/CD
- **[mirror auf OpenCode.de](https://gitlab.opencode.de/unbox-cologne/p2d2/p2d2-mirror.git)** → Spiegel für -erlassung
- **[hub auf GitHub](https://github.com/Peter-Koenig/p2d2-hub.git)** → (internationale) Zusammenarbeit

Folgende Branches wurden angelegt, Webseiten und Prozessimplementierung stehen aus (3.9.2025):

- **develop** → Integration neuer Features, automatisch nach `dev.data-dna.eu`
- **main** → produktionsreifer Code, Deployment auf `www.data-dna.eu`
- **release/** → Staging & finale Tests vor Veröffentlichung
- **feature/team-<name>/** → Neue Features, getrennt nach Teams

Siehe [MERGE_POLICY.md](.github/MERGE_POLICY.md) für Details.

---

## 🤝 Mitmachen

Wir freuen uns über Beiträge jeder Art:

- 🐛 Fehler melden
- ✨ Neue Features vorschlagen oder implementieren
- 📖 Dokumentation verbessern
- 🌐 Daten beitragen oder qualitätssichern
- 🎨 UI/UX-Ideen teilen

👉 Siehe [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📚 Dokumentation

- **Deployment-Regeln:** [.github/DEPLOYMENT_RULES.md](.github/DEPLOYMENT_RULES.md)
- **Code Reviews:** [.github/CODE_REVIEW_GUIDE.md](.github/CODE_REVIEW_GUIDE.md)
- **Branch-/Merge-Policy:** [.github/MERGE_POLICY.md](.github/MERGE_POLICY.md)

---

## 🧾 Lizenz

Dieses Projekt steht unter der
**GNU General Public License Version 3 (GPLv3)**

→ siehe [LICENSE](src/content/legal/lizenzen.md)

---

## 💡 Kontakt & Community

- Website: [opn.data-dna.eu](https://opn.data-dna.eu)
- Mastodon: [@P2D2@nrw.social](https://nrw.social/@P2D2)
- Weitere Kanäle: siehe Footer auf der Website
