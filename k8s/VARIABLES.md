# p2d2 Frontend — Variablen-Ledger (CIVITAS/CORE)

Dieses Ledger dokumentiert **jede** für den Frontend-Baustein benötigte Variable
(ConfigMap-/Secret-Key) über alle 5 Stages hinweg. Es enthält **niemals echte
Werte**, sondern nur Name, Ablage, Kategorie, Quelle/Herkunft und Status.

## Kategorien

| Kategorie | Bedeutung |
|---|---|
| **K1** | Aus p2d2-Standalone übernommen (Wert bekannt, Quelle dokumentiert). |
| **K1-adaptiert** | Standalone-Wert wurde für die Cluster-Autarkie umgestellt. Original- UND Cluster-Ziel sind dokumentiert. |
| **K2** | Während der Installation zufällig erzeugt, bleibt (kein Nachtrag nötig). |
| **K3** | Noch leer/Platzhalter, muss von **Peter** befüllt werden. |
| **K4** | Zufällig erzeugt, wird von **Peter** durch den echten Wert ersetzt. |

## Ablage-Legende

- `base-config` = ConfigMap `p2d2-base-config` (gemeinsam, nicht-sensibel)
- `base-secret` = Secret `p2d2-base-secret` (gemeinsam, sensibel)
- `<stage>-config` = ConfigMap `p2d2-<stage>-config` (stage-spezifisch, nicht-sensibel)
- `<stage>-secret` = Secret `p2d2-<stage>-secret` (stage-spezifisch, sensibel)
- `extern` = separat verwaltet, **nicht** über die Manifeste angelegt/überschrieben

---

## 1. Basis ConfigMap (`p2d2-base-config`)

| Variable | Ablage | Kategorie | Quelle / Herkunft | Status |
|---|---|---|---|---|
| `APP_DEBUG` | base-config | K1 | `.env.base` (`false`) | gesetzt (`false`) |
| `DEFAULT_CATEGORY_ICON` | base-config | K1 | `.env.base` (`Fahnenmasten.svg`) | gesetzt; Datei im `public/`-Baum fehlt, Variable im Code derzeit ungenutzt — prüfen |
| `DB_HOST` | base-config | K1-adaptiert | Standalone `192.168.122.110` → `central-db.cc-prd-database-stack.svc.cluster.local` | gesetzt |
| `DB_PORT` | base-config | K1 | `.env.base` (`5432`) | gesetzt |
| `DB_NAME` | base-config | K1-adaptiert | Standalone `data-dna` → `p2d2` (VERIFIZIERT, s.u.) | gesetzt |
| `WFST_NAMESPACE` | base-config | K1 | `.env.base` (`urn:data-dna:govdata`) | gesetzt |
| `PUBLIC_WFST_ENDPOINT` | base-config | K1-adaptiert | Standalone `https://wfs.data-dna.eu/geoserver/ows` → `https://geoportal.udp.data-dna.eu/geoserver/ows` | gesetzt |
| `PUBLIC_MAPSERVER_URL` | base-config | K1-adaptiert | Standalone `https://ows.data-dna.eu` → `https://geoportal.udp.data-dna.eu/mapserver` | gesetzt |
| `SMTP_HOST` | base-config | K1 | `.env.base` (`mxe860.netcup.net`) | gesetzt |
| `SMTP_PORT` | base-config | K1 | `.env.base` (`587`) | gesetzt |
| `SMTP_SECURE` | base-config | K1 | `.env.base` (`false`) | gesetzt |
| `SMTP_USER` | base-config | K1 | `.env.base` (`p2d2-prod@scanea.de`) | gesetzt |
| `CONTACT_EMAIL_TO` | base-config | K1 | `.env.base` (`peter.koenig@scanea.de`) | gesetzt |
| `CONTACT_EMAIL_FROM` | base-config | K1 | `.env.base` (`p2d2-prod@scanea.de`) | gesetzt |

## 2. Basis Secret (`p2d2-base-secret`)

| Variable | Ablage | Kategorie | Quelle / Herkunft | Status |
|---|---|---|---|---|
| `ALTCHA_HMAC_KEY` | base-secret | K1 | `.env.base` (echter Wert) | **CHANGEME** — Peter trägt Wert ein |
| `SMTP_PASS` | base-secret | K1 | `.env.base` (echter Wert) | **CHANGEME** — Peter trägt Wert ein |
| `OIDC_ISSUER` | base-secret | K3 | Keycloak-Realm-URL (ein Realm für alle Stages) | **CHANGEME** — Peter/Keycloak |
| `OIDC_CLIENT_ID` | base-secret | K3 | Keycloak-OIDC-Client (ein Client, 5 Redirect-URIs) | **CHANGEME** — Peter/Keycloak |
| `OIDC_CLIENT_SECRET` | base-secret | K4 | Keycloak-Client-Secret (echtes Secret) | **CHANGEME** — Peter ersetzt |

## 3. Stage-Mapping (Übersicht der stage-spezifischen Werte)

| Stage | Deployment | `<stage>`-Suffix (Ressourcen) | `DB_USER` | `WFST_WORKSPACE` / `PUBLIC_WFST_WORKSPACE` | `<KEY>` (Env-Suffix) | `WFST_USERNAME` / `WFST_USER_<KEY>` | `PUBLIC_SITE_URL` |
|---|---|---|---|---|---|---|---|
| main | `p2d2-main` | `main` | `P2D2-MAIN` | `main` | `MAIN` | `p2d2_wfst_main` | `https://www.udp.data-dna.eu` |
| develop | `p2d2-dev` | `dev` | `P2D2-DEVELOP` | `dev` | `DEVELOP` | `p2d2_wfst_develop` | `https://dev.udp.data-dna.eu` |
| de1 | `p2d2-f-de1` | `f-de1` | `P2D2-DE1` | `de1` | `DE1` | `p2d2_wfst_de1` | `https://f-de1.udp.data-dna.eu` |
| de2 | `p2d2-f-de2` | `f-de2` | `P2D2-DE2` | `de2` | `DE2` | `p2d2_wfst_de2` | `https://f-de2.udp.data-dna.eu` |
| fv | `p2d2-f-fv` | `f-fv` | `P2D2-FV` | `fv` | `FV` | `p2d2_wfst_fv` | `https://f-fv.udp.data-dna.eu` |

> **Nomenklatur-Hinweis (bewusst beibehalten):** Der Code liest WFS-T-Credentials
> **sowohl** suffigiert (`WFST_ENDPOINT_<KEY>`, `WFST_USER_<KEY>`, `WFST_PW_<KEY>`)
> **als auch** plain (`WFST_ENDPOINT`, `WFST_USERNAME`, `WFST_PASSWORD`). Beide
> Schreibweisen werden pro Stage gesetzt (suffigiert hat in den API-Pfaden Vorrang;
> plain wird von Admin-Sync-Skripten genutzt). `main` entspricht dem Standalone-
> `production` (plain), die übrigen Stages dem suffigierten Standalone-Muster.

## 4. Stage ConfigMap (`p2d2-<stage>-config`, pro Stage identisch aufgebaut)

| Variable | Ablage | Kategorie | Quelle / Herkunft | Status |
|---|---|---|---|---|
| `DB_USER` | `<stage>-config` | K1 | Standalone `.env.<stage>` (Wert je Stage, siehe Stage-Mapping) | gesetzt |
| `WFST_WORKSPACE` | `<stage>-config` | K1 | Standalone `.env.<stage>` (Wert je Stage) | gesetzt |
| `PUBLIC_WFST_WORKSPACE` | `<stage>-config` | K1 | Standalone `.env.<stage>` (Wert je Stage) | gesetzt |
| `PUBLIC_SITE_URL` | `<stage>-config` | K1-adaptiert | Standalone `*.data-dna.eu` → `*.udp.data-dna.eu` (je Stage) | gesetzt |
| `WFST_ENDPOINT` (plain) | `<stage>-config` | K1-adaptiert | Standalone → `https://geoportal.udp.data-dna.eu/geoserver/<ws>/ows` | gesetzt |
| `WFST_ENDPOINT_<KEY>` | `<stage>-config` | K1-adaptiert | dito (suffigiert) | gesetzt |
| `WFST_USERNAME` (plain) | `<stage>-config` | K1 | Standalone (Wert je Stage, siehe Stage-Mapping) | gesetzt |
| `WFST_USER_<KEY>` | `<stage>-config` | K1 | dito (suffigiert) | gesetzt |

## 5. Stage Secret (`p2d2-<stage>-secret`, pro Stage identisch aufgebaut)

| Variable | Ablage | Kategorie | Quelle / Herkunft | Status |
|---|---|---|---|---|
| `DB_PASSWORD` | `<stage>-secret` | K3 | Cluster-DB-Rolle `<DB_USER>` (Rotation durch Peter) | **CHANGEME** — Peter |
| `WFST_PASSWORD` (plain) | `<stage>-secret` | K1 | GeoServer-Secret `p2d2-geoserver-wfst-<ws>` | **CHANGEME** — aus GeoServer-Secret übernehmen |
| `WFST_PW_<KEY>` | `<stage>-secret` | K1 | dito (suffigiert) | **CHANGEME** — aus GeoServer-Secret übernehmen |
| `SESSION_SECRET` | `<stage>-secret` | K2 | zufällig generiert (bleibt) | **CHANGEME** — bei Installation generieren |

> **WS-Zuordnung für die GeoServer-Secrets:** `main`→`p2d2-geoserver-wfst-main`,
> `dev`→`p2d2-geoserver-wfst-develop`, `de1`→`p2d2-geoserver-wfst-de1`,
> `de2`→`p2d2-geoserver-wfst-de2`, `fv`→`p2d2-geoserver-wfst-fv`.

## 6. Shared Infra-Secrets (extern verwaltet, NICHT über Manifeste überschreiben)

| Secret | Key | Kategorie | Quelle / Herkunft | Status |
|---|---|---|---|---|
| `p2d2-builder-git-auth` | `gitlab-token` | K3 | GitLab Deploy-/Access-Token | **vorhanden** (von Peter erzeugt) |
| `p2d2-builder-git-auth` | `github-token` | K3 | GitHub Deploy-/PAT-Token | **vorhanden** (von Peter erzeugt) |
| `p2d2-webhook-secrets` | `github-hmac-secret` | K3 | GitHub Webhook-HMAC-Secret | **vorhanden** (von Peter erzeugt) |
| `p2d2-webhook-secrets` | `gitlab-webhook-token` | K3 | GitLab Webhook-Token | **vorhanden** (von Peter erzeugt) |

> Diese beiden Secrets halten echte Werte und sind deshalb **bewusst aus den
> Manifesten entfernt** worden (`builder-job.yaml` und `webhook-controller/deployment.yaml`
> referenzieren sie nur noch). Beim „Löschen + Neuaufbau“ dürfen sie **nicht**
> gelöscht werden.

---

## Verifikation `DB_NAME = p2d2`

Bestätigt gegen den PostgreSQL-Baustein (Läufe
`2026-09-06-p2d2-addon-postgresql-baustein` und
`2026-09-10-p2d2-addon-postgresql-struktur-aufbau`): die Cluster-Datenbank heißt
`p2d2` (nicht `data-dna`). Beleg: `pg_database` enthält `p2d2`, `preparedDatabases.p2d2`
ist im `central-db`-Cluster konfiguriert. → `DB_NAME: p2d2` ist korrekt gesetzt.

## Offene Punkte / Folgearbeit

1. **Zitadel→Keycloak im Code (blockiert den Build).** Der Quellcode referenziert
   weiterhin `ZITADEL_ISSUER/CLIENT_ID/CLIENT_SECRET/PROJECT_ID/ORG_ID`
   (`astro.config.mjs`-Env-Schema, `src/lib/auth/oidc-client.ts`,
   `src/pages/api/auth/{login,logout,callback}.ts`, `src/lib/auth/session.ts`,
   `packages/core/src/preferences/metadata-parser.ts`). Erst nach diesem Refactor
   akzeptiert der Build die hier auf `OIDC_*` umbenannten Variablen.
2. **Builder-Job-Env.** Der Webhook-Controller (`webhook-controller/index.js`,
   `createBuilderJob`) injiziert bislang keine Build-Env-Variablen — der erzeugte
   Job braucht ebenfalls `envFrom` (base + stage), analog zur Referenz in
   `builder-job.yaml`.
3. **Webhook-Controller-Image** `p2d2-webhook-controller:v1s-2026-09-17` ist noch
   nicht gebaut (aktuell `ErrImagePull`).
4. **`WFST_NAMESPACE`** = `urn:data-dna:govdata` (Code) vs. GeoServer-Workspaces
   `urn:data-dna:govdata:<ws>` — als offener Punkt vermerkt.
5. **`p2d2-webhook-secrets`** zeigt im Cluster aktuell 5 Keys; referenziert werden
   nur `github-hmac-secret` und `gitlab-webhook-token` — auf überflüssige Alt-Keys
   prüfen.
