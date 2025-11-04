# p2d2 Multi-Repo Deployment – Komplette Dokumentation

<<<<<<< HEAD
## TECHNICAL DOCUMENTATION

# p2d2 Multi-Branch Deployment – Technische Dokumentation

**Status:** Produktiv  
**Deployment-Modell:** Multi-Branch mit automatischen Webhooks  
=======
**Status:** Production Ready  
**Multi-Repo Support:** GitHub + GitLab  
>>>>>>> develop
**Gültig ab:** November 2025

---

## 1. System-Architektur

### 1.1 Übersicht

```
┌──────────────────────────┐
│  GitLab (opencode.de)    │
│  ├─ main                 │
│  └─ develop              │
└────────┬─────────────────┘
         │ GitLab Webhook
         ↓
┌────────────────────────────────┐
│  Frontend VM (9321)            │
│  Webhook-Server                │
│  ├─ Secret-Validierung         │
│  ├─ Repo-Router                │
│  └─ Deploy-Trigger             │
└────┬──────────────┬────────────┘
     │              │
     ↓              ↓
┌─────────┐  ┌───────────────────┐
│ GitLab  │  │ GitHub (3x Team)  │
│ Repos   │  │ ├─ team-de1       │
└─────────┘  │ ├─ team-de2       │
             │ └─ team-fv        │
             └───────────────────┘
             
                ↓
             
┌──────────────────────────────────┐
│  systemd Services                │
│  ├─ astro-main (Port 3000)       │
│  ├─ astro-develop (Port 3001)    │
│  ├─ astro-feature-team-de1 (3002)│
│  ├─ astro-feature-team-de2 (3003)│
│  └─ astro-feature-team-fv (3004) │
└──────────────────────────────────┘
             
                ↓
             
┌──────────────────────────────────┐
│  Caddy Reverse Proxy (OPNSense)  │
│  ├─ www.data-dna.eu → :3000      │
│  ├─ dev.data-dna.eu → :3001      │
│  ├─ f-de1.data-dna.eu → :3002    │
│  ├─ f-de2.data-dna.eu → :3003    │
│  └─ f-fv.data-dna.eu → :3004     │
└──────────────────────────────────┘
```

### 1.2 Deployment-Flows

#### Flow 1: Main/Develop (dein Repo, GitLab)

```
Du: git push origin develop
    ↓
GitLab Webhook → POST http://server:9321/webhook
    ↓
Webhook-Server:
├─ Liest x-gitlab-token Header
├─ Validiert gegen SECRET_DEVELOP
├─ Findet: https://gitlab.opencode.de/.../p2d2.git
├─ Branch: develop
└─ Ruft auf: deploy-branch.sh develop ... https://gitlab...
    ↓
Deploy-Script:
├─ git clone --branch develop
├─ npm ci + npm run build
├─ sudo systemctl restart astro-develop
└─ Live unter dev.data-dna.eu
```

#### Flow 2: Feature Branches (Team-Repos, GitHub)

```
Team: git push origin feature/team-de1/meine-funktion
    ↓
GitHub Webhook → POST http://server:9321/webhook
    ↓
Webhook-Server:
├─ Liest x-hub-signature-256 Header
├─ Kalkuliert HMAC-SHA256 mit SECRET_TEAM_DE1
├─ Validiert Signature
├─ Branch-Pattern Match: /^feature\/team-de1\/.+/ ✓
├─ Findet: https://github.com/team-de1/p2d2-feature.git
└─ Ruft auf: deploy-branch.sh feature/team-de1/meine-funktion ... https://github.com/team-de1/...
    ↓
Deploy-Script:
├─ git clone --branch feature/team-de1/meine-funktion
├─ npm ci + npm run build
├─ sudo systemctl restart astro-feature-team-de1
└─ Live unter f-de1.data-dna.eu
```

---

## 2. Webhook-Server Konfiguration

### 2.1 Secrets Management

```
# /home/astro/webhook-server/.env

# GitLab Secrets (dein Repo)
SECRET_MAIN=dein_secret_main_hier
SECRET_DEVELOP=dein_secret_develop_hier

# GitHub Shared Secrets (Team-Repos)
SECRET_TEAM_DE1=team_de1_secret_hier
SECRET_TEAM_DE2=team_de2_secret_hier
SECRET_TEAM_FV=team_fv_secret_hier
```

**Generieren:**
```
openssl rand -hex 32
```

**Berechtigungen:**
```
sudo chown astro:astro /home/astro/webhook-server/.env
sudo chmod 600 /home/astro/webhook-server/.env
```

### 2.2 Branch-Konfiguration

```
// /home/astro/webhook-server/index.js (Auszug)

const branchConfig = {
  'main': {
    domain: 'www.data-dna.eu',
    deployPath: '/var/www/astro/deployments/main',
    port: 3000,
    repo: 'https://gitlab.opencode.de/OC000028072444/p2d2.git',
    secret: process.env.SECRET_MAIN,
    provider: 'gitlab'
  },
  
  'develop': {
    domain: 'dev.data-dna.eu',
    deployPath: '/var/www/astro/deployments/develop',
    port: 3001,
    repo: 'https://gitlab.opencode.de/OC000028072444/p2d2.git',
    secret: process.env.SECRET_DEVELOP,
    provider: 'gitlab'
  },
  
  'feature/team-de1': {
    domain: 'f-de1.data-dna.eu',
    deployPath: '/var/www/astro/deployments/feature-de1',
    port: 3002,
    repo: 'https://github.com/team-de1/p2d2-feature.git',
    secret: process.env.SECRET_TEAM_DE1,
    provider: 'github',
    matchPattern: /^feature\/team-de1\/.+/
  },
  
  'feature/team-de2': {
    domain: 'f-de2.data-dna.eu',
    deployPath: '/var/www/astro/deployments/feature-de2',
    port: 3003,
    repo: 'https://github.com/team-de2/p2d2-feature.git',
    secret: process.env.SECRET_TEAM_DE2,
    provider: 'github',
    matchPattern: /^feature\/team-de2\/.+/
  },
  
  'feature/team-fv': {
    domain: 'f-fv.data-dna.eu',
    deployPath: '/var/www/astro/deployments/feature-fv',
    port: 3004,
    repo: 'https://github.com/team-fv/p2d2-feature.git',
    secret: process.env.SECRET_TEAM_FV,
    provider: 'github',
    matchPattern: /^feature\/team-fv\/.+/
  }
};
```

---

## 3. Team Onboarding

### 3.1 Schritt 1: Team-Repo erstellen

**Team macht das:**

```
# Option A: Neues Repo
# GitHub.com → New Repository → p2d2-feature
# Clone & Feature-Branch erstellen
git clone https://github.com/team-de1/p2d2-feature.git
cd p2d2-feature
git checkout -b feature/team-de1/setup

# Option B: Fork des Main-Repos
# GitHub.com → fork Peter-Koenig/p2d2-hub
# Clone & Feature-Branch erstellen
git clone https://github.com/team-de1/p2d2-feature.git
cd p2d2-feature
git checkout -b feature/team-de1/meine-funktion
```

### 3.2 Schritt 2: Secret generieren & verteilen

**Du machst das:**

```
# Secret generieren
openssl rand -hex 32
# Ausgabe: a1b2c3d4e5f6g7h8...

# Mit Team teilen (verschlüsselt!)
# Signal, PGP, oder sicherer Kanal

# In .env eintragen
echo "SECRET_TEAM_DE1=a1b2c3d4e5f6g7h8..." >> /home/astro/webhook-server/.env

# Webhook-Server neu starten
sudo systemctl restart webhook-server
```

### 3.3 Schritt 3: GitHub Webhook konfigurieren

**Team macht das:**

1. GitHub → Repository → Settings → Webhooks → Add webhook
2. **Payload URL:** `http://<deine-ip>:9321/webhook`
3. **Content type:** `application/json`
4. **Secret:** Den Secret von dir
5. **Which events:** `Just the push event`
6. **Active:** ✅
7. **Add webhook**

**Test:**
- Recent Deliveries → Klick auf Eintrag → "Redeliver"
- Oder: Team macht Test-Push zu `feature/team-de1/test`

---

## 4. Development Workflow

### 4.1 Feature entwickeln (Team)

```
# Team entwickelt lokal
git checkout feature/team-de1/neue-funktion
# ... Code ändern ...
git add .
git commit -m "Feature: Neue Funktion"
git push origin feature/team-de1/neue-funktion
```

**Was passiert automatisch:**

```
Push → GitHub Webhook
     → Server validiert Secret
     → Deploy-Script triggert
     → f-de1.data-dna.eu updated
     → LIVE in ~2 Minuten
```

### 4.2 Feature testen

Team kann ihre Änderungen live anschauen:

```
# Team testet unter
https://f-de1.data-dna.eu/

# Bei Änderungen: Einfach neuen Push
git add .
git commit -m "Bugfix: xyz"
git push origin feature/team-de1/neue-funktion
# → Automatisch deployed
```

---

## 5. Integration in Main/Develop

### 5.1 Feature Ready → Pull Request

**Team erstellt Pull Request** (in ihrem Repo oder zu deinem):

```
# GitHub: team-de1/p2d2-feature
# PR: feature/team-de1/neue-funktion → develop

# Oder: Zu deinem Main-Repo
# PR: OC000028072444/p2d2
# feature/team-de1/neue-funktion → develop
```

### 5.2 Du reviewst & merged

```
# Du auf deinem Repo
git checkout develop
git pull origin develop

# Feature-Branch mergen
git merge feature/team-de1/neue-funktion
git push origin develop
```

**Was passiert:**

```
Git Push zu develop
     ↓
GitLab Webhook
     ↓
Server deployed zu dev.data-dna.eu
     ↓
Team + du können testen auf Staging
```

### 5.3 Release → Main

```
# Nach Test/Approval
git checkout main
git pull origin main
git merge develop
git push origin main
```

**Was passiert:**

```
Git Push zu main
     ↓
GitLab Webhook
     ↓
Server deployed zu www.data-dna.eu
     ↓
LIVE in Produktion!
```

---

## 6. Deployment-Verzeichnisstruktur

```
/var/www/astro/
├── deployments/
│   ├── main/
│   │   ├── deploys/
│   │   │   ├── 20251104003111/  ← Latest
│   │   │   ├── 20251104002000/
│   │   │   └── ...
│   │   ├── live → deploys/20251104003111/  ← Active
│   │   └── logs/
│   ├── develop/
│   │   ├── deploys/
│   │   ├── live → ...
│   │   └── logs/
│   ├── feature-de1/
│   │   ├── deploys/
│   │   ├── live → ...
│   │   └── logs/
│   ├── feature-de2/
│   ├── feature-fv/
│   └── scripts/
│       └── deploy-branch.sh
└── shared/
    └── src/
        └── content/
            └── kommunen/  ← Externe Collection
```

---

## 7. Monitoring & Troubleshooting

### 7.1 Logs prüfen

```
# Webhook-Server
sudo journalctl -u webhook-server -f

# Deployment-Service
sudo journalctl -u astro-develop -f

# Build-Logs
tail -f /var/www/astro/deployments/develop/logs/npm-build-*.log
```

### 7.2 Häufige Probleme

**Problem: Webhook triggert nicht**
```
# 1. Webhook-Server läuft?
sudo systemctl status webhook-server

# 2. Secret korrekt?
grep SECRET_TEAM_DE1 /home/astro/webhook-server/.env

# 3. Logs anschauen
sudo journalctl -u webhook-server -n 50
```

**Problem: Build schlägt fehl**
```
# Deploy-Logs
tail -100 /var/www/astro/deployments/feature-de1/logs/npm-build-*.log

# Service-Logs
sudo journalctl -u astro-feature-team-de1 -n 30
```

**Problem: Service startet nicht**
```
# Verzeichnis existiert?
ls -la /var/www/astro/deployments/feature-de1/live/

# Port gebunden?
sudo lsof -i :3002

# Service neu starten
sudo systemctl restart astro-feature-team-de1
```

---

## 8. Sicherheit

### 8.1 Secret-Verwaltung

- ✅ Jedem Team eigener Secret
- ✅ Secrets in `.env` (nicht im Code)
- ✅ Datei-Berechtigungen: `600` (nur astro)
- ✅ GitHub HMAC-SHA256 Validierung
- ✅ GitLab Token Validierung
- ⚠️ Secrets regelmäßig rotieren

### 8.2 Branch-Schutz

**Server-seitig: Branch-Pattern-Matching**

```
// Team DE1 kann NICHT zu feature/team-de2 deployen
// Server validiert Pattern: /^feature\/team-de1\/.+/
// Unbekannte Branches: 404 (ignoriert)
```

**GitHub: Branch-Protection-Rules (optional)**

```
Settings → Branches → Add rule
├─ Pattern: main
├─ Require pull request reviews
└─ Require status checks to pass
```

---

## 9. Quick Reference

### Secrets generieren
```
openssl rand -hex 32
```

### Webhook-Server Logs
```
sudo journalctl -u webhook-server -f
```

### Service neu starten
```
sudo systemctl restart astro-develop
```

### Deployment manuell
```
sudo -u astro /var/www/astro/scripts/deploy-branch.sh \
  feature/team-de1/setup \
  /var/www/astro/deployments/feature-de1 \
  3002 \
  https://github.com/team-de1/p2d2-feature.git
```

### Status aller Services
```
sudo systemctl status astro-*
```

---

## 10. Zusammenfassung

<<<<<<< HEAD
- **GitLab Issues:** p2d2 Repository
- **Logs:** `journalctl` oder `/var/www/astro/deployments/*/logs/`
- **Admin-Zugriff:** Frontend-VM root
```
=======
```
┌─────────────────────────────────────────────┐
│  Workflow Summary                           │
├─────────────────────────────────────────────┤
│                                             │
│  Team entwickelt in ihrem GitHub-Repo      │
│  └─ feature/team-de1/*                     │
│                                             │
│  Push triggert Webhook                     │
│  └─ Server validiert Secret + Branch      │
│                                             │
│  Deploy-Script wird aufgerufen             │
│  └─ Git clone + npm build                 │
│                                             │
│  Service wird neu gestartet                │
│  └─ f-de1.data-dna.eu LIVE                │
│                                             │
│  Team testet auf Feature-Domain            │
│  └─ Nach Approval: PR zu develop           │
│                                             │
│  Du mergst develop → main                  │
│  └─ Automatisches Deployment zu www        │
│                                             │
│  LIVE in Produktion ✅                     │
│                                             │
└─────────────────────────────────────────────┘

>>>>>>> develop

