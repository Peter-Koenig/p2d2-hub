# supplement/masterportal

Dieser Ordner ist die Quelle für das **Default-Masterportal** einer p2d2-Stage im
Add-on-Modus (CIVITAS/CORE V1s, später V2/Helm). Er ist bewusst **kein** Teil des
Astro-Builds: die Standalone-Anwendung ignoriert ihn vollständig.

## Zweck

- **Add-on-Modus:** Der Masterportal-Baustein (`overlay_addon_V1s/k8s/masterportal`)
  bezieht `portal/`, `addons/` und `README.md` aus diesem Ordner des Stage-Branches.
- **Standalone:** Astro verarbeitet nur `src/` und `public/`; `supplement/` liegt
  außerhalb und wird weder von `tsconfig` noch von Tailwind (`@source ../**`),
  Vitest oder npm-Workspaces erfasst.

## Aufbau

```text
supplement/masterportal/
├── portal/
│   ├── index.html          # Einstiegspunkt (byte-identisch über alle Stages)
│   ├── config.js.template  # Laufzeit-Konfiguration (envsubst-Platzhalter)
│   ├── resources/          # style_v3.json + img/ (byte-identisch über alle Stages)
│   └── localdata/          # Demodaten (byte-identisch über alle Stages)
├── addons/
│   └── addonsConf.json     # leeres Objekt (Customizing folgt separat)
└── README.md
```

## Ablauf

1. Der Ordner liegt im **Stage-Branch** des p2d2-Repos. Da alle Stages denselben
   Inhalt haben, tragen Merges zwischen Stage-Branches keine Hosts/Konfigurationen
   mit.
2. Beim Masterportal-Build wird der Stage-Branch genau einmal flach geklont
   (`addon_stage_checkout`, `modules_addon_V1s/addon_30_frontend.sh`). Der
   Image-Tag wird über die Tree-Hash dieses Ordners
   (`git rev-parse HEAD:supplement/masterportal`) gebildet.
3. Beim Containerstart wird `portal/config.js.template` per `envsubst` nach
   `/var/run/masterportal/config.js` gerendert (emptyDir) und von nginx unter
   `/masterportal/<stage>/config.js` ausgeliefert. Stage- und domainabhängige
   Werte kommen aus der ConfigMap `masterportal-<stage>-config`.

## Laufzeit-Variablen (config.js)

| Variable | Quelle |
|---|---|
| `IDM_HOST` | `idm.${ADDON_DOMAIN}` |
| `IAM_REALM` | `ADDON_IAM_REALM` (Standard `cc-prd`) |
| `OIDC_CLIENT_ID` | `geostack_public` (CIVITAS/CORE-Public-Client) |
| `OIDC_REDIRECT_URI` | `https://<frontend-host>/masterportal/<stage>/` |
| `INTERCEPTOR_URL_REGEX` | `https://(geoportal|<host-prefix>)[.]<domain-mit-[.]>/` |
| `PORTAL_BACKEND_ORIGIN` | `https://geoportal.${ADDON_DOMAIN}` |
