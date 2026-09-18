# p2d2 Frontend-Pods (CIVITAS/CORE)

Manifeste für die fünf Frontend-Pods (Astro-SSR) im Namespace `cc-prd-geodata-stack`.

## Struktur

- `base.yaml` — gemeinsame Basis-Werte (ConfigMap `p2d2-base-config` + Secret `p2d2-base-secret`)
- `stages/<stage>.yaml` — je Stage: PVC, ConfigMap (stage-spezifisch), Secret (stage-spezifisch), Deployment, Service
- `builder-job.yaml` — Builder-Job (git clone → npm ci → npm run build:<stage> → PVC)
- `webhook-controller/` — Webhook-Controller (Node.js) + Deployment + RBAC
- `VARIABLES.md` — Variablen-Ledger (Kategorie/Quelle/Status aller Variablen, ohne echte Werte)

## Stage-Übersicht

| Stage | Deployment | DB-Rolle | Workspace | WFS-T-Nutzer | Build | Repo |
|---|---|---|---|---|---|---|
| main | `p2d2-main` | `P2D2-MAIN` | `main` | `p2d2_wfst_main` | `npm run build` | GitLab |
| develop | `p2d2-dev` | `P2D2-DEVELOP` | `dev` | `p2d2_wfst_develop` | `npm run build:develop` | GitLab |
| de1 | `p2d2-f-de1` | `P2D2-DE1` | `de1` | `p2d2_wfst_de1` | `npm run build:de1` | GitHub |
| de2 | `p2d2-f-de2` | `P2D2-DE2` | `de2` | `p2d2_wfst_de2` | `npm run build:de2` | GitHub |
| fv | `p2d2-f-fv` | `P2D2-FV` | `fv` | `p2d2_wfst_fv` | `npm run build:fv` | GitHub |

## Autarkie + ein gemeinsamer IAM

- **Autarkie:** alle Standalone-internen Adressen sind auf Cluster-instanz umgestellt
  (`DB_HOST` → `central-db`, `PUBLIC_WFST_ENDPOINT`/`WFST_ENDPOINT_<STAGE>` →
  `geoportal.udp.data-dna.eu/geoserver/...`, `PUBLIC_MAPSERVER_URL` →
  `geoportal.udp.data-dna.eu/mapserver`).
- **Ein IAM:** ein Keycloak-Realm + ein OIDC-Client für alle 5 Stages
  (`OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` im `p2d2-base-secret`).

## Secrets

- `p2d2-base-secret` + `p2d2-<stage>-secret` sind mit `CHANGEME`-Platzhaltern
  angelegt und werden von Peter befüllt (siehe `VARIABLES.md`, Kategorien K1–K4).
- Die echten Git-/Webhook-Secrets (`p2d2-builder-git-auth`, `p2d2-webhook-secrets`)
  werden **nicht** über diese Manifeste angelegt/überschrieben und dürfen beim
  Löschen+Neuaufbau **nicht** gelöscht werden.

## Anwendung

```bash
kubectl apply -f k8s/base.yaml
kubectl apply -f k8s/stages/
kubectl apply -f k8s/builder-job.yaml
kubectl apply -f k8s/webhook-controller/
```

## Bewusst weggelassen (gegenüber Standalone `deploy-branch.sh`)

- **Kommunen-Collection-Symlink** (`link_kommunen_collection`): Die Kommunen-Auswahl wird
  über die Markdown-Dateien im Repo selbst konfiguriert; ein geteilter Symlink ist in
  CIVITAS/CORE nicht sinnvoll. Es wird kein Verzeichnis gelöscht/verlinkt.
- **`systemctl`-Restart**: ersetzt durch `kubectl rollout restart deployment/p2d2-<stage>`.

## Bekannte Folgearbeit (blockiert den lauffähigen Zustand)

1. **Zitadel→Keycloak-Refactor im Quellcode** (Env-Schema + Auth-Flows lesen noch
   `ZITADEL_*`). Ohne diesen Refactor scheitert der Builder-Build, weil das
   Astro-Env-Schema `ZITADEL_*` verlangt, während die Manifeste bereits `OIDC_*` liefern.
2. **Builder-Env im Webhook-Controller** (`webhook-controller/index.js`) injiziert
   bislang keine Build-Env-Variablen in den erzeugten Job.
3. **Webhook-Controller-Image** bauen (`p2d2-webhook-controller:v1s-2026-09-17`).
