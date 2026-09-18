// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Webhook-Controller (CIVITAS/CORE) — portiert aus webhook-server_index.js.
//
// Ersetzt das Standalone-Muster (exec deploy-branch.sh + systemctl) durch:
//   1. Webhook validieren (GitLab Token plaintext / GitHub HMAC-SHA256)
//   2. Branch -> Stage auflösen
//   3. Builder-Job erzeugen (git clone -> npm ci -> npm run build:<stage> -> PVC)
//   4. Job-Poll auf Erfolg
//   5. kubectl rollout restart des Stage-Deployments

const express = require("express");
const crypto = require("crypto");
const k8s = require("@kubernetes/client-node");

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const batchApi = kc.makeApiClient(k8s.BatchV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);

const NAMESPACE = process.env.NAMESPACE || "cc-prd-geodata-stack";

// Branch -> Stage-Konfiguration (Repo/Provider getrennt nach Kollaborationsmodell:
// main/develop auf GitLab, feature/team-* auf GitHub).
const STAGES = {
  main: {
    name: "p2d2-main",
    build: "npm run build",
    gitHost: "gitlab.opencode.de",
    gitRepoPath: "OC000028072444/p2d2.git",
    branch: "main",
    pvc: "p2d2-main-code",
    deployment: "p2d2-main",
    provider: "gitlab",
    secret: process.env.GITLAB_WEBHOOK_TOKEN,
  },
  develop: {
    name: "p2d2-dev",
    build: "npm run build:develop",
    gitHost: "gitlab.opencode.de",
    gitRepoPath: "OC000028072444/p2d2.git",
    branch: "develop",
    pvc: "p2d2-dev-code",
    deployment: "p2d2-dev",
    provider: "gitlab",
    secret: process.env.GITLAB_WEBHOOK_TOKEN,
  },
  "feature/team-de1/main": {
    name: "p2d2-f-de1",
    build: "npm run build:de1",
    gitHost: "github.com",
    gitRepoPath: "Peter-Koenig/p2d2-hub.git",
    branch: "feature/team-de1/main",
    pvc: "p2d2-f-de1-code",
    deployment: "p2d2-f-de1",
    provider: "github",
    secret: process.env.GITHUB_HMAC_SECRET,
  },
  "feature/team-de2/main": {
    name: "p2d2-f-de2",
    build: "npm run build:de2",
    gitHost: "github.com",
    gitRepoPath: "Peter-Koenig/p2d2-hub.git",
    branch: "feature/team-de2/main",
    pvc: "p2d2-f-de2-code",
    deployment: "p2d2-f-de2",
    provider: "github",
    secret: process.env.GITHUB_HMAC_SECRET,
  },
  "feature/team-fv/main": {
    name: "p2d2-f-fv",
    build: "npm run build:fv",
    gitHost: "github.com",
    gitRepoPath: "Peter-Koenig/p2d2-hub.git",
    branch: "feature/team-fv/main",
    pvc: "p2d2-f-fv-code",
    deployment: "p2d2-f-fv",
    provider: "github",
    secret: process.env.GITHUB_HMAC_SECRET,
  },
};

const ALLOWED_BRANCHES_REGEX = /^(main|develop|feature\/team-[^/]+\/main)$/;

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (buf && buf.length) req.rawBody = buf.toString("utf8");
    },
  }),
);

function validateGitLabSecret(incoming, expected) {
  return Boolean(incoming && expected && incoming === expected);
}

function validateGitHubSecret(req, expected) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !expected || !req.rawBody) return false;
  const digest =
    "sha256=" + crypto.createHmac("sha256", expected).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(digest, "utf8"),
    );
  } catch {
    return false;
  }
}

function gitAuthUser(host) {
  return host.includes("github") ? "x-access-token" : "oauth2";
}

async function createBuilderJob(config) {
  const jobName = `${config.name}-builder-${Date.now()}`;
  const script = [
    "set -eu",
    `git clone --depth 1 --branch "${config.branch}" "https://${gitAuthUser(config.gitHost)}:\${GIT_TOKEN}@${config.gitHost}/${config.gitRepoPath}" /build/app`,
    "cd /build/app",
    "test -f package-lock.json",
    "npm ci",
    "npx tsc --noEmit",
    `eval "${config.build}"`,
    "test -d dist/server",
    "rm -rf /app/dist",
    "cp -a dist /app/dist",
  ].join("\n");

  await batchApi.createNamespacedJob(NAMESPACE, {
    metadata: { name: jobName },
    spec: {
      ttlSecondsAfterFinished: 3600,
      backoffLimit: 1,
      template: {
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "builder",
              image: "node:20",
              imagePullPolicy: "IfNotPresent",
              workingDir: "/build",
              env: [
                {
                  name: "GIT_TOKEN",
                  valueFrom: {
                    secretKeyRef: {
                      name: "p2d2-builder-git-auth",
                      key: config.provider === "github" ? "github-token" : "gitlab-token",
                    },
                  },
                },
              ],
              command: ["/bin/sh", "-c"],
              args: [script],
              volumeMounts: [{ name: "code", mountPath: "/app" }],
            },
          ],
          volumes: [
            {
              name: "code",
              persistentVolumeClaim: { claimName: config.pvc },
            },
          ],
        },
      },
    },
  });

  return jobName;
}

async function waitForJob(jobName) {
  const deadline = Date.now() + 15 * 60 * 1000; // 15 min
  while (Date.now() < deadline) {
    const { body } = await batchApi.readNamespacedJobStatus(jobName, NAMESPACE);
    const s = body.status || {};
    if (s.succeeded) return true;
    if (s.failed) return false;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function rolloutRestart(deploymentName) {
  const patch = {
    spec: {
      template: {
        metadata: {
          annotations: {
            "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
          },
        },
      },
    },
  };
  await appsApi.patchNamespacedDeployment(
    deploymentName,
    NAMESPACE,
    patch,
    undefined,
    undefined,
    undefined,
    undefined,
    { headers: { "Content-Type": "application/merge-patch+json" } },
  );
}

app.post("/webhook", async (req, res) => {
  const ref = (req.body && req.body.ref) || "";
  const branch = ref.replace("refs/heads/", "");

  if (!ALLOWED_BRANCHES_REGEX.test(branch)) {
    return res.status(200).send("Ignoriert: Kein Ziel-Branch.");
  }

  const config = STAGES[branch];
  if (!config) {
    return res.status(404).send(`Branch ${branch} nicht konfiguriert.`);
  }

  const valid =
    config.provider === "github"
      ? validateGitHubSecret(req, config.secret)
      : validateGitLabSecret(req.headers["x-gitlab-token"], config.secret);

  if (!valid) {
    console.error(`[webhook] Ungueltiger Token fuer ${branch}`);
    return res.status(403).send("Zugriff verweigert.");
  }

  // Frueh antworten, Deployment async fortsetzen
  res.status(202).send(`Deployment ${branch} gestartet.`);

  try {
    const jobName = await createBuilderJob(config);
    console.log(`[webhook] Builder-Job ${jobName} fuer ${branch} gestartet`);
    const ok = await waitForJob(jobName);
    if (!ok) {
      console.error(`[webhook] Builder-Job ${jobName} fehlgeschlagen`);
      return;
    }
    await rolloutRestart(config.deployment);
    console.log(`[webhook] ${config.deployment} neu gestartet`);
  } catch (err) {
    console.error(`[webhook] Fehler bei ${branch}:`, err.message);
  }
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

const PORT = 9321;
app.listen(PORT, () => {
  console.log(`p2d2-webhook-controller lauscht auf ${PORT}`);
  console.log(`Konfigurierte Stages: ${Object.keys(STAGES).join(", ")}`);
});
