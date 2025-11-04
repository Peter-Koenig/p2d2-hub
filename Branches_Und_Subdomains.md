Hier ist die **technische Dokumentation** und das **Setup-Guide**:[11]

## TECHNICAL DOCUMENTATION

```markdown
# p2d2 Multi-Branch Deployment – Technische Dokumentation

**Status:** Produktiv  
**Deployment-Modell:** Multi-Branch mit automatischen Webhooks  
**Gültig ab:** November 2025

---

## 1. Architektur-Übersicht

### 1.1 Multi-Branch-System

Das p2d2-Projekt nutzt ein Multi-Branch-Deployment-System mit 5 gleichzeitig aktiven Umgebungen:

| Branch | Domain | Port | Service | Speicher | Zweck |
|--------|--------|------|---------|----------|-------|
| `main` | `www.data-dna.eu` | 3000 | `astro-main` | 10.2M | Produktion |
| `develop` | `dev.data-dna.eu` | 3001 | `astro-develop` | 9.3M | Test/Integration |
| `feature/team-de1/setup` | `f-de1.data-dna.eu` | 3002 | `astro-feature-team-de1` | 22.0M | Team DE1 |
| `feature/team-de2/setup` | `f-de2.data-dna.eu` | 3003 | `astro-feature-team-de2` | 24.8M | Team DE2 |
| `feature/team-fv/setup` | `f-fv.data-dna.eu` | 3004 | `astro-feature-team-fv` | 24.6M | Team FV |

**Gesamt RAM:** ~91MB (von 64GB verfügbar)

### 1.2 Infrastructure Stack

```
GitLab Repository
    ↓ (Push)
GitLab Webhook
    ↓
Webhook-Server (Port 9321)
    ↓
deploy-branch.sh
    ├─ Git Clone Branch
    ├─ Komunnen-Collection Symlink
    ├─ npm ci + build
    ├─ Service Stop/Start
    └─ Cleanup alte Deployments
    ↓
systemd Services (astro-*)
    ├─ astro-main (Port 3000)
    ├─ astro-develop (Port 3001)
    ├─ astro-feature-team-de1 (Port 3002)
    ├─ astro-feature-team-de2 (Port 3003)
    └─ astro-feature-team-fv (Port 3004)
    ↓
Caddy Reverse Proxy (OPNSense)
    ├─ www.data-dna.eu → localhost:3000
    ├─ dev.data-dna.eu → localhost:3001
    ├─ f-de1.data-dna.eu → localhost:3002
    ├─ f-de2.data-dna.eu → localhost:3003
    └─ f-fv.data-dna.eu → localhost:3004
    ↓
HTTPS (Let's Encrypt via Caddy)
```

---

## 2. Komponenten

### 2.1 Webhook-Server (`/home/astro/webhook-server/index.js`)

- **Port:** 9321
- **Funktion:** Empfängt GitLab-Push-Events und triggert Deployments
- **Konfiguration:** Branch → Deploy-Path & Port Mapping
- **Logs:** `journalctl -u webhook-server -f`

```
const branchConfig = {
  'main': { deployPath: '/var/www/astro/deployments/main', port: 3000 },
  'develop': { deployPath: '/var/www/astro/deployments/develop', port: 3001 },
  // ... etc
}
```

### 2.2 Deploy-Skript (`/var/www/astro/scripts/deploy-branch.sh`)

**Ablauf:**
1. Verzeichnis anlegen
2. Git Clone Branch
3. Kommunen-Collection als Symlink → `/var/www/astro/shared/src/content/kommunen`
4. `.env.production` verlinken + PORT überschreiben
5. `npm ci --omit=dev` + `npm run build`
6. Service Stop/Restart
7. Live-Symlink umschalten
8. Alte Deployments aufräumen (nur 5 neueste behalten)

**Aufrufe:**
```
sudo -u astro /var/www/astro/scripts/deploy-branch.sh main /var/www/astro/deployments/main 3000
sudo -u astro /var/www/astro/scripts/deploy-branch.sh develop /var/www/astro/deployments/develop 3001
sudo -u astro /var/www/astro/scripts/deploy-branch.sh feature/team-de1/setup /var/www/astro/deployments/feature-de1 3002
```

### 2.3 Systemd Services

Lokation: `/etc/systemd/system/astro-*.service`

**Beispiel astro-main.service:**
```
[Unit]
Description=Astro p2d2 - main branch
After=network.target

[Service]
Type=simple
User=astro
Group=astro
WorkingDirectory=/var/www/astro/deployments/main/live
Environment="PORT=3000"
ExecStart=/usr/bin/node /var/www/astro/deployments/main/live/dist/server/entry.mjs
Restart=on-failure
RestartSec=10
```

### 2.4 Caddy Reverse Proxy (OPNSense)

**Konfiguration in OPNSense → Dienste → Caddy → Reverse Proxy:**

| Domain | Handler | Upstream |
|--------|---------|----------|
| `https://www.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3000` |
| `https://dev.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3001` |
| `https://f-de1.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3002` |
| `https://f-de2.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3003` |
| `https://f-fv.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3004` |
| `https://opn.data-dna.eu` | redir | `https://www.data-dna.eu{uri}` (301) |

---

## 3. Externe Ressourcen

### 3.1 Kommunen-Collection

**Zentrale Quelle:** `/var/www/astro/shared/src/content/kommunen/`

**Verwendung:** Jedes Deployment linkt hierher (Symlink)

```
/var/www/astro/deployments/main/live/src/content/kommunen → /var/www/astro/shared/src/content/kommunen
/var/www/astro/deployments/develop/live/src/content/kommunen → /var/www/astro/shared/src/content/kommunen
// ... etc
```

**Vorteil:** Content-Updates ohne Deployment möglich!

---

## 4. Deployment-Verzeichnisstruktur

```
/var/www/astro/
├── deployments/
│   ├── main/
│   │   ├── deploys/
│   │   │   ├── 20251104003111/  ← Clone + Build
│   │   │   ├── 20251104002000/
│   │   │   └── ...
│   │   └── live → deploys/20251104003111/  ← Active
│   ├── develop/
│   │   ├── deploys/
│   │   └── live → ...
│   ├── feature-de1/
│   ├── feature-de2/
│   ├── feature-fv/
│   └── logs/  ← Build-Logs
└── shared/
    └── src/
        └── content/
            └── kommunen/  ← Externe Collection
```

---

## 5. Workflow: Push → Deployment

1. **Developer pusht zu GitLab Branch**
   ```
   git push origin develop
   ```

2. **GitLab triggert Webhook**
   ```
   POST http://192.168.122.120:9321/webhook
   Header: x-gitlab-token: <SECRET>
   Payload: { "ref": "refs/heads/develop", ... }
   ```

3. **Webhook-Server**
   - Extrahiert Branch-Name: `develop`
   - Schlägt `branchConfig` nach → findet `astro-develop` Service
   - Triggert: `deploy-branch.sh develop /var/www/astro/deployments/develop 3001`

4. **Deploy-Skript**
   - Erstellt Verzeichnis `20251104HHMMSS`
   - Klont `develop`-Branch
   - Linkt Kommunen-Collection
   - Buildet Astro-App
   - Stoppt `astro-develop` Service
   - Switcht Symlink
   - Startet `astro-develop` Service

5. **Service startet neuen Build**
   - Node.js lädt neue Version
   - App läuft auf Port 3001

6. **Caddy routet Traffic**
   - `dev.data-dna.eu` → `localhost:3001`
   - Neue Version live!

---

## 6. Sicherheit

### 6.1 Webhook-Token

```
# Token in .env.production
cat /home/astro/.env.production | grep SECRET_TOKEN
```

- Muss zwischen GitLab und Server identisch sein
- Sollte regelmäßig rotiert werden

### 6.2 Sudo-Berechtigungen

**sudoers Konfiguration** (`/etc/sudoers.d/astro-systemctl`):
```
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl start astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart astro-*
```

### 6.3 SSL/TLS

- **Automatisch via Let's Encrypt** durch Caddy
- Wildcard-Zertifikat für `*.data-dna.eu` (wird automatisch aktualisiert)

---

## 7. Monitoring & Troubleshooting

### 7.1 Service-Status

```
# Alle Services
sudo systemctl status astro-*

# Einzeln
sudo systemctl status astro-main
sudo systemctl status astro-develop
```

### 7.2 Logs

```
# Service-Logs
sudo journalctl -u astro-main -f          # main branch
sudo journalctl -u astro-develop -f       # develop branch
sudo journalctl -u webhook-server -f      # Webhook

# Build-Logs
cat /var/www/astro/deployments/develop/logs/npm-build-*.log
cat /var/www/astro/deployments/develop/logs/clone-*.log
```

### 7.3 Build-Status prüfen

```
# Letzter Build
ls -lt /var/www/astro/deployments/develop/deploys/ | head -1

# Symlink überprüfen
ls -la /var/www/astro/deployments/develop/live

# App antwortet?
curl -I http://localhost:3001
```

### 7.4 Häufige Probleme

**Problem:** Service geht down nach Deployment
```
# Logs schauen
sudo journalctl -u astro-main -n 50

# Working Directory existiert?
ls -la /var/www/astro/deployments/main/live/dist/server/

# Port kann gebunden werden?
sudo lsof -i :3000
```

**Problem:** Webhook triggert nicht
```
# Webhook-Server läuft?
sudo systemctl status webhook-server

# Port antwortet?
curl http://localhost:9321

# Token korrekt?
cat /home/astro/.env.production | grep SECRET_TOKEN
```

---

## 8. Speicherverwaltung

- **VM-Disk:** 25GB
- **Pro Deployment:** ~500MB
- **Aufbewahrung:** 5 neueste pro Branch
- **Berechnet:** 5 Branches × 5 Deployments × 500MB = 12.5GB (OK mit Reserve)

### Cleanup manuell

```
# Alte Deployments für develop
cd /var/www/astro/deployments/develop/deploys
ls -dt */ | tail -n +4 | xargs rm -rf

# Für alle Branches
for branch in main develop feature-de1 feature-de2 feature-fv; do
  cd /var/www/astro/deployments/$branch/deploys
  ls -dt */ | tail -n +4 | xargs rm -rf 2>/dev/null
done

# Diskplatz prüfen
df -h /
```

---

## 9. Wartung & Updates

### 9.1 Regelmäßig

- [ ] Logs archivieren (wöchentlich)
- [ ] Alte Deployments aufräumen
- [ ] Webhook-Token rotieren (vierteljährlich)
- [ ] Zertifikate überprüfen

### 9.2 Bei Problemen

1. Logs überprüfen
2. Service neustarten
3. Manuelles Deployment testen
4. System-Ressourcen prüfen (RAM, Disk)

---

## 10. Referenzen

- **AstroJS:** https://docs.astro.build/en/guides/deploy/
- **Caddy:** https://caddyserver.com/docs/quick-start
- **GitLab Webhooks:** https://docs.gitlab.com/user/project/integrations/webhooks/
- **systemd:** https://www.freedesktop.org/software/systemd/man/systemd.service.html
```

***

## SETUP GUIDE FOR CONTRIBUTORS

```markdown
# p2d2 Multi-Branch Deployment – Setup-Anleitung für Partner & Contributor:innen

**Zielgruppe:** Frontend-VM Administratoren, DevOps, Contributors  
**Dauer:** ~30 Minuten für komplettes Setup  
**Voraussetzungen:** SSH-Zugriff, sudo-Rechte, Git-Kenntnisse

---

## 1. Schnellstart (für Testing)

Falls du schnell einen Branch deployen möchtest:

```
# SSH in Frontend-VM
ssh root@192.168.122.120

# Manuelles Deployment (z.B. develop)
sudo -u astro /var/www/astro/scripts/deploy-branch.sh develop \
  /var/www/astro/deployments/develop 3001

# Service starten
sudo systemctl start astro-develop

# Status überprüfen
sudo systemctl status astro-develop
```

Das wars! Der Branch läuft jetzt auf Port 3001.

---

## 2. Setup von Grund auf (neuer Server)

### 2.1 Voraussetzungen prüfen

```
# Benötigte Software
which git
which node
which npm
which systemctl

# Versionen
node --version    # sollte ≥ 18 sein
npm --version     # sollte ≥ 9 sein
```

Falls fehlt: Installation nötig (siehe Abschnitt 9)

### 2.2 Benutzer erstellen

```
sudo useradd -m -s /bin/bash astro
sudo passwd astro
# Passwort setzen (oder SSH-Key)
```

### 2.3 Verzeichnisstruktur anlegen

```
# Phase 1: Infrastruktur
sudo mkdir -p /var/www/astro/deployments/{main,develop,feature-de1,feature-de2,feature-fv}/{deploys,logs}
sudo mkdir -p /var/www/astro/scripts
sudo mkdir -p /var/www/astro/shared/src/content/kommunen
sudo chown -R astro:astro /var/www/astro
sudo chmod -R 755 /var/www/astro
```

### 2.4 Webhook-Server Setup

```
# Phase 2: Webhook vorbereiten
sudo mkdir -p /home/astro/webhook-server
cd /home/astro/webhook-server

# Node.js Projekt initialisieren
npm init -y
npm install express dotenv body-parser

# .env Datei mit Secret
echo "SECRET_TOKEN=dein_super_geheimes_token_hier" > .env
sudo chown astro:astro .env
sudo chmod 600 .env

# index.js (siehe Technische Doku oder kopieren)
# ... Code einfügen ...

# Service für Webhook
sudo tee /etc/systemd/system/webhook-server.service > /dev/null << 'EOF'
[Unit]
Description=p2d2 Webhook Server
After=network.target

[Service]
Type=simple
User=astro
WorkingDirectory=/home/astro/webhook-server
ExecStart=/usr/bin/node /home/astro/webhook-server/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable webhook-server
sudo systemctl start webhook-server
```

### 2.5 Deploy-Skript

```
# Phase 3: Deploy-Skript
sudo tee /var/www/astro/scripts/deploy-branch.sh > /dev/null << 'EOF'
#!/bin/bash
set -e
# ... Deploy-Skript Code (siehe Technische Doku)
EOF

sudo chown astro:astro /var/www/astro/scripts/deploy-branch.sh
sudo chmod 755 /var/www/astro/scripts/deploy-branch.sh
```

### 2.6 Systemd Services

```
# Phase 4: Services für alle Branches
for service in main develop feature-team-de1 feature-team-de2 feature-team-fv; do
  case $service in
    main) port=3000 dir=main ;;
    develop) port=3001 dir=develop ;;
    feature-team-de1) port=3002 dir=feature-de1 ;;
    feature-team-de2) port=3003 dir=feature-de2 ;;
    feature-team-fv) port=3004 dir=feature-fv ;;
  esac
  
  sudo tee /etc/systemd/system/astro-$service.service > /dev/null << EOF
[Unit]
Description=Astro p2d2 - $service branch
After=network.target

[Service]
Type=simple
User=astro
Group=astro
WorkingDirectory=/var/www/astro/deployments/$dir/live
Environment="PORT=$port"
Environment="HOST=0.0.0.0"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /var/www/astro/deployments/$dir/live/dist/server/entry.mjs
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
done

sudo systemctl daemon-reload
sudo systemctl enable astro-{main,develop,feature-team-de1,feature-team-de2,feature-team-fv}
```

### 2.7 Sudo-Berechtigungen

```
# astro darf systemctl starten/stoppen ohne Passwort
sudo tee /etc/sudoers.d/astro-systemctl > /dev/null << 'EOF'
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl start astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl status astro-*
astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload astro-*
EOF

sudo chmod 0440 /etc/sudoers.d/astro-systemctl
```

### 2.8 Caddy Reverse Proxy (OPNSense)

In der OPNSense WebGUI:
1. **Dienste → Caddy → Reverse Proxy**
2. Für jeden Branch einen Handler hinzufügen:

| Domain | Handler-Typ | Upstream |
|--------|-------------|----------|
| `https://www.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3000` |
| `https://dev.data-dna.eu` | Reverse Proxy | `http://192.168.122.120:3001` |
| ... | ... | ... |

3. **Speichern → Caddy neustarten**

---

## 3. Erstes Deployment

### 3.1 Manuell testen (develop)

```
ssh root@192.168.122.120

# Deploy
sudo -u astro /var/www/astro/scripts/deploy-branch.sh develop \
  /var/www/astro/deployments/develop 3001

# Service starten
sudo systemctl start astro-develop

# Status
sudo systemctl status astro-develop

# Test
curl -I http://localhost:3001
# Sollte: HTTP/1.1 200 OK
```

### 3.2 Webhook testen

```
# Token holen
cat /home/astro/.env.production | grep SECRET_TOKEN

# Webhook manuell triggern
curl -X POST http://localhost:9321/webhook \
  -H "x-gitlab-token: <DEIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "refs/heads/develop",
    "project": { "name": "p2d2" }
  }'

# Logs anschauen
sudo journalctl -u webhook-server -f
```

### 3.3 Im Browser testen

```
# dev.data-dna.eu sollte jetzt funktionieren
curl -I https://dev.data-dna.eu/
# HTTP/2 200
```

---

## 4. GitLab Webhook konfigurieren

1. **GitLab → Repository → Settings → Integrations → Webhooks**
2. **URL:** `http://192.168.122.120:9321/webhook`
3. **Secret Token:** Derselbe Token aus `/home/astro/.env.production`
4. **Trigger:** ✅ Push events
5. **Branch filter:** (leer – alle Branches)
6. **SSL verification:** Nach Bedarf

---

## 5. Branches deployen

### 5.1 Alle Branches initial deployen

```
ssh root@192.168.122.120

# main
sudo -u astro /var/www/astro/scripts/deploy-branch.sh main \
  /var/www/astro/deployments/main 3000

# develop (bereits oben)
sudo -u astro /var/www/astro/scripts/deploy-branch.sh develop \
  /var/www/astro/deployments/develop 3001

# feature/team-de1/setup
sudo -u astro /var/www/astro/scripts/deploy-branch.sh feature/team-de1/setup \
  /var/www/astro/deployments/feature-de1 3002

# feature/team-de2/setup
sudo -u astro /var/www/astro/scripts/deploy-branch.sh feature/team-de2/setup \
  /var/www/astro/deployments/feature-de2 3003

# feature/team-fv/setup (wenn Branch umbenennt, sonst feature/team-fv1/setup)
sudo -u astro /var/www/astro/scripts/deploy-branch.sh feature/team-fv/setup \
  /var/www/astro/deployments/feature-fv 3004
```

### 5.2 Services starten

```
sudo systemctl start astro-{main,develop,feature-team-de1,feature-team-de2,feature-team-fv}

# Status überprüfen
sudo systemctl status astro-*
```

---

## 6. Externe Ressourcen nutzen

### 6.1 Kommunen-Collection aktualisieren

Die Kommunen-Collection ist **extern verwaltbar**, ohne Deployment!

```
# SSH ins System
ssh root@192.168.122.120

# Kommunen-Verzeichnis
cd /var/www/astro/shared/src/content/kommunen

# Neue .md-Datei hinzufügen
cat > neuestadt.md << 'EOF'
***
name: "Neue Stadt"
***

Beschreibung...
EOF

# Alle Deployments nutzen sofort diese Collection!
# Kein Deployment nötig!
```

---

## 7. Tägliche Wartung

### 7.1 Logs überprüfen

```
# Fehler in letzter Stunde?
sudo journalctl -u astro-main --since "1 hour ago" | grep -i error

# Webhook-Probleme?
sudo journalctl -u webhook-server --since "1 hour ago"
```

### 7.2 Speicher aufräumen (monatlich)

```
# Alte Deployments löschen
for branch in main develop feature-de1 feature-de2 feature-fv; do
  cd /var/www/astro/deployments/$branch/deploys
  ls -dt */ | tail -n +4 | xargs rm -rf 2>/dev/null
done

# Diskplatz anschauen
df -h /
```

### 7.3 Services neustarten (bei Problemen)

```
# Einzeln
sudo systemctl restart astro-main

# Alle
sudo systemctl restart astro-*
```

---

## 8. Troubleshooting

### Problem: Deploy-Skript fragt nach Passwort

**Symptom:**
```
[sudo] password for astro:
```

**Lösung:** Sudo-Berechtigungen überprüfen
```
sudo visudo
# Überprüfen: astro ALL=(ALL) NOPASSWD: /usr/bin/systemctl ...
```

### Problem: Service läuft nicht

**Diagnose:**
```
sudo systemctl status astro-main
sudo journalctl -u astro-main -n 50
```

**Häufige Gründe:**
- Working Directory existiert nicht → Manuelles Deployment durchführen
- Node.js nicht gefunden → `which node` überprüfen
- Port gebunden → `sudo lsof -i :3000`

### Problem: Webhook triggert nicht

**Testen:**
```
# Server läuft?
sudo systemctl status webhook-server

# Port antwortet?
telnet localhost 9321

# Token korrekt?
grep SECRET_TOKEN /home/astro/.env.production
```

### Problem: Build schlägt fehl

**Logs anschauen:**
```
tail -f /var/www/astro/deployments/develop/logs/npm-build-*.log
```

---

## 9. Zusätzliche Installation (falls nötig)

### Node.js installieren

```
# Arch Linux
sudo pacman -S nodejs npm

# Debian/Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Git installieren

```
# Arch
sudo pacman -S git

# Debian
sudo apt install git
```

---

## 10. Quick Commands

```
# Status aller Services
sudo systemctl status astro-*

# Logs live
sudo journalctl -u astro-main -f

# Disk-Platz
df -h /

# Services neustarten
sudo systemctl restart astro-*

# Webhook testen
curl -X POST http://localhost:9321/webhook \
  -H "x-gitlab-token: $(grep SECRET_TOKEN /home/astro/.env.production | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/develop","project":{"name":"p2d2"}}'

# Einzelnes Deployment
sudo -u astro /var/www/astro/scripts/deploy-branch.sh develop /var/www/astro/deployments/develop 3001

# Service starten/stoppen
sudo systemctl start/stop astro-main
```

---

## 11. Support & Kontakt

- **GitLab Issues:** p2d2 Repository
- **Logs:** `journalctl` oder `/var/www/astro/deployments/*/logs/`
- **Admin-Zugriff:** Frontend-VM root
```
```

[1](https://www.codecademy.com/resources/docs/markdown/code-blocks)
[2](https://www.markdownguide.org/extended-syntax/)
[3](https://markdown.land/markdown-code-block)
[4](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks)
[5](https://www.glukhov.org/post/2025/07/markdown-codeblocks/)
[6](https://gitbook.gitbook.io/learn-markdown/code)
[7](https://www.markdownguide.org/basic-syntax/)
[8](https://learn.microsoft.com/en-us/azure/devops/project/wiki/markdown-guidance?view=azure-devops-2022)
[9](https://github.com/adam-p/markdown-here/wiki/markdown-cheatsheet)
[10](https://commonmark.org/help/tutorial/09-code.html)
[11](https://opn.data-dna.eu)
