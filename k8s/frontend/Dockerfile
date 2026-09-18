# Minimales Runtime-Image für das p2d2-Frontend (Astro SSR, standalone).
#
# Dieses Dockerfile nimmt ein VORAB gebautes `dist/` + `node_modules` aus dem
# Build-Kontext entgegen (Build erfolgt im Node-Skript k8s/frontend/build-<stage>.sh,
# analog GeoServer/MapProxy: Build auf dem k3s-Node, dann `docker build` +
# `docker save | k3s ctr images import`).
#
# Der Astro-Standalone-Adapter externalisiert Laufzeit-Dependencies (z. B. `vue`),
# daher muss `node_modules` im Image vorhanden sein.
#
# Server-seitige Secrets (DB_*, WFST_*, SMTP_*, OIDC_*/ZITADEL_*, SESSION_SECRET)
# werden NICHT ins Image gebacken — sie kommen weiterhin per envFrom aus den
# ConfigMaps/Secrets (siehe k8s/VARIABLES.md).
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY node_modules ./node_modules
COPY dist ./dist

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
