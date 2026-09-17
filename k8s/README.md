# p2d2 Frontend-Pods (CIVITAS/CORE)

Manifeste für die fünf Frontend-Pods (Astro-SSR) im Namespace `cc-prd-geodata-stack`.

## Struktur

- `stages/<stage>.yaml` — je Stage: PVC, ConfigMap, Secret, Deployment, Service
- `builder-job.yaml` — Builder-Job (git clone → npm ci → npm run build:<stage> → PVC)
- `webhook-controller/` — Webhook-Controller (Node.js) + Deployment + RBAC

## Stage-Übersicht

| Stage | Deployment | DB-Rolle | Workspace | WFS-T-Nutzer | Build | Repo |
|---|---|---|---|---|---|---|
| main | `p2d2-main` | `P2D2-MAIN` | `main` | `p2d2_wfst_main` | `npm run build` | GitLab |
| develop | `p2d2-dev` | `P2D2-DEVELOP` | `dev` | `p2d2_wfst_develop` | `npm run build:develop` | GitLab |
| de1 | `p2d2-f-de1` | `P2D2-DE1` | `de1` | `p2d2_wfst_de1` | `npm run build:de1` | GitHub |
| de2 | `p2d2-f-de2` | `P2D2-DE2` | `de2` | `p2d2_wfst_de2` | `npm run build:de2` | GitHub |
| fv | `p2d2-f-fv` | `P2D2-FV` | `fv` | `p2d2_wfst_fv` | `npm run build:fv` | GitHub |

## Secrets

Alle sensiblen Werte sind `CHANGEME`-Platzhalter und werden von Peter nachträglich befüllt
(`kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`). Die Pods dürfen
mit Platzhaltern zunächst fehlschlagen (erwartet).

## Anwendung

```bash
kubectl apply -f k8s/stages/
kubectl apply -f k8s/builder-job.yaml
kubectl apply -f k8s/webhook-controller/
```

## Bewusst weggelassen (gegenüber Standalone `deploy-branch.sh`)

- **Kommunen-Collection-Symlink** (`link_kommunen_collection`): Die Kommunen-Auswahl wird
  über die Markdown-Dateien im Repo selbst konfiguriert; ein geteilter Symlink ist in
  CIVITAS/CORE nicht sinnvoll. Es wird kein Verzeichnis gelöscht/verlinkt.
- **`systemctl`-Restart**: ersetzt durch `kubectl rollout restart deployment/p2d2-<stage>`.
