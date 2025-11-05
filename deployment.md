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
| `https://www.data-dna.eu` | Reverse Proxy | `http://192.168.xxx.yyy:3000` |
| `https://dev.data-dna.eu` | Reverse Proxy | `http://192.168.xxx.yyy:3001` |
| `https://f-de1.data-dna.eu` | Reverse Proxy | `http://192.168.xxx.yyy:3002` |
| `https://f-de2.data-dna.eu` | Reverse Proxy | `http://192.168.xxx.yyy:3003` |
| `https://f-fv.data-dna.eu` | Reverse Proxy | `http://192.168.xxx.yyy:3004` |
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
   POST http://192.168.xxx.yyy:9321/webhook
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
