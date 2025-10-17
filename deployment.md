# p2d2 Deployment-Dokumentation

## Aktuelles System (Stand: Oktober 2025)

### Architektur-Übersicht

Das p2d2-Projekt verwendet ein webhook-basiertes Continuous Deployment-System, das automatisch bei Push-Ereignissen auf den `main`-Branch deployed.

#### Repository-Struktur

- **Origin**: `https://gitlab.opencode.de/OC000028072444/p2d2.git`
- **Mirror**: `git@gitlab.opencode.de:unbox-cologne/p2d2/p2d2-mirror.git`
- **Hub**: `git@github.com:Peter-Koenig/p2d2-hub.git`

#### Branch-Struktur

```
release/va.b.c    # Archivierte Releases (Tagged Versions)
main              # Produktions-Branch
develop           # Integrations-Branch
feature/team-de1/* # Feature-Branches Team DE1
feature/team-de2/* # Feature-Branches Team DE2
feature/team-fv/*  # Feature-Branches Team FV
bugfix/issue-*    # Bugfix-Branches
```

### Deployment-Komponenten

#### 1. Webhook-Server (`/home/astro/webhook-server/index.js`)

Node.js-basierter Server, der auf Port 9321 lauscht und GitLab-Webhooks empfängt.

**Funktion:**
- Empfängt POST-Requests von GitLab bei Push-Ereignissen
- Validiert den Secret-Token aus `.env`
- Triggert das Deployment-Skript

**Konfiguration:**
- `.env`-Datei: `/home/astro/webhook-server/.env`
- Enthält: `SECRET_TOKEN=<token>`
- **Sicherheitshinweis**: Berechtigungen sollten auf `600` und Eigentümer auf `astro:astro` gesetzt werden

```
// Aktueller Code
require('dotenv').config({ path: '/home/astro/webhook-server/.env' });
const SECRET_TOKEN = process.env.SECRET_TOKEN;
const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const incomingToken = req.headers['x-gitlab-token'];
  if (!incomingToken || incomingToken !== SECRET_TOKEN) {
    res.status(403).send('Zugriff verweigert: Ungültiger Token.');
    return;
  }

  res.send('Webhook empfangen, Deployment wird gestartet.');

  exec('/var/www/astro/opn-data-dna/deploy.sh', (error, stdout, stderr) => {
    if (error) {
      console.error(`Fehler beim Deployment: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
});

app.listen(9321, () => {
  console.log('Webhook-Server läuft auf Port 9321');
});
```

#### 2. Deployment-Skript (`/var/www/astro/opn-data-dna/deploy.sh`)

Bash-Skript für zero-downtime Deployments mit Symlink-Strategie.

**Ablauf:**
1. Erstellt timestamped Deployment-Verzeichnis
2. Klont `main`-Branch aus Origin-Repository
3. Linkt `.env.production` ins Build-Verzeichnis
4. Führt `npm ci` und `npm run build` aus
5. Stoppt Astro-Service kurzzeitig
6. Aktualisiert Symlink auf neues Deployment
7. Startet Astro-Service neu
8. Räumt alte Deployments auf (behält nur 5 neueste)

```
#!/bin/bash

set -x
set -e

# Variablen
APP_USER=astro
REPO="https://gitlab.opencode.de/OC000028072444/p2d2.git"
DEPLOYMENTS_DIR=/var/www/astro/opn-data-dna_deploys
LIVE_LINK=/var/www/astro/opn-data-dna_live
TIMESTAMP=$(date +%Y%m%d%H%M%S)
NEW_DEPLOY_DIR=$DEPLOYMENTS_DIR/$TIMESTAMP
ENV_FILE=/home/astro/.env.production

# 1. Neues Verzeichnis für den Build anlegen
mkdir -p "$NEW_DEPLOY_DIR"

# 2. Code in das neue Verzeichnis klonen
git clone --depth 1 --branch main "$REPO" "$NEW_DEPLOY_DIR"

# 3. Environment-Datei symlinken
if [ -f "$ENV_FILE" ]; then
    ln -sf "$ENV_FILE" "$NEW_DEPLOY_DIR/.env.production"
else
    echo "WARNUNG: $ENV_FILE nicht gefunden!"
    exit 1
fi

# 4. Build im neuen Verzeichnis durchführen
cd "$NEW_DEPLOY_DIR"
npm ci --omit=dev
npm run build

# 5. Server stoppen (nur ganz kurz)
sudo systemctl stop astro-app

# 6. Symlink umstellen
ln -sfn "$NEW_DEPLOY_DIR" "$LIVE_LINK"

# 7. Server wieder starten
sudo systemctl start astro-app

# 8. Alte Deployments aufräumen (nur die 5 neuesten behalten)
cd "$DEPLOYMENTS_DIR"
ls -dt */ | tail -n +6 | xargs rm -rf

echo "Deployment erfolgreich abgeschlossen."
```

#### 3. Verzeichnisstruktur

```
/var/www/astro/
├── opn-data-dna_deploys/       # Alle Deployments mit Timestamp
│   ├── 20251016120000/
│   ├── 20251016130000/
│   └── 20251016140000/
├── opn-data-dna_live -> opn-data-dna_deploys/20251016140000/  # Symlink auf aktives Deployment
└── opn-data-dna/
    └── deploy.sh

/home/astro/
├── .env.production              # Environment-Variablen
└── webhook-server/
    ├── index.js
    ├── .env                     # Webhook-Secret
    └── node_modules/
```

### GitLab Webhook-Konfiguration

**URL**: `http://<server-ip>:9321/webhook`
**Secret Token**: Definiert in `/home/astro/webhook-server/.env`
**Trigger**: Push events auf `main`-Branch

### Systemd-Service

Der Astro-Service läuft als systemd-Unit und zeigt auf den Symlink:

```
[Unit]
Description=Astro p2d2 Application
After=network.target

[Service]
Type=simple
User=astro
WorkingDirectory=/var/www/astro/opn-data-dna_live
ExecStart=/usr/bin/node /var/www/astro/opn-data-dna_live/dist/server/entry.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Aktuelle Domain

- **Produktions-URL**: `https://opn.data-dna.eu`
- Wird von `main`-Branch bedient

### Branch-Semantik

- **release/va.b.c**: Tagged Releases, archiviert (nicht automatisch deployed)
- **main**: Stabiler Produktions-Code
- **develop**: Integrationsbranch für getestete Features
- **feature/team-*/**: Aktive Feature-Entwicklung
- **bugfix/issue-***: Bugfixes vor Merge nach develop/main

### Externe Markdown-Inhalte

Das System ist so konzipiert, dass Markdown-Dateien von externen Quellen bereitgestellt werden können, was für zukünftige Content-Management-Szenarien wichtig sein kann.

---

## Sicherheitshinweise

1. **`.env`-Dateien**: Sollten `600` Berechtigungen und korrekten Eigentümer haben
2. **Webhook-Secret**: Muss zwischen GitLab und Server übereinstimmen
3. **Sudo-Rechte**: Deploy-User benötigt sudo-Rechte für systemctl ohne Passwort

## Monitoring & Logs

- Webhook-Server-Logs: `journalctl -u webhook-server -f`
- Astro-Service-Logs: `journalctl -u astro-app -f`
- Deployment-Logs: Werden in stdout/stderr des Webhook-Servers ausgegeben
```
