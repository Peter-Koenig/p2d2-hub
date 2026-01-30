import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx"; // Nur falls du MDX brauchst

import vue from "@astrojs/vue";
import { polygonSyncPlugin } from "./src/integrations/polygon-sync-plugin.mjs";
import { fileURLToPath } from "url";

// WhereAmI

import { defineConfig } from "astro/config";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { resolve } from "path";

// === DEBUG: Zeige wo Astro läuft und .env sucht ===
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cwd = process.cwd();

console.log("\n=== ASTRO CONFIG DEBUG ===");
console.log("📂 Config File Location:", __dirname);
console.log("📂 process.cwd():", cwd);
console.log("📂 NODE_ENV:", process.env.NODE_ENV);
console.log("\n🔍 .env File Check:");

const envFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
];

envFiles.forEach((file) => {
  const fullPath = resolve(cwd, file);
  const exists = existsSync(fullPath);
  console.log(`  ${exists ? "✅" : "❌"} ${file} (${fullPath})`);
});

console.log("\n🔑 Environment Variables Check:");
console.log("  DB_HOST:", process.env.DB_HOST ? "✅ SET" : "❌ MISSING");
console.log(
  "  ALTCHA_HMAC_KEY:",
  process.env.ALTCHA_HMAC_KEY ? "✅ SET" : "❌ MISSING",
);
console.log("  PORT:", process.env.PORT || "(not set)");
console.log("=========================\n");
// === END DEBUG ===

// WhereAmI - END

export default defineConfig({
  // Performance: Telemetrie deaktivieren (spart ~560ms)
  telemetry: false,
  // Optional, falls du eine feste Domain hast
  site: "https://opn.data-dna.eu",

  env: {
    schema: {
      // Datenbank
      DB_HOST: envField.string({ context: "server", access: "secret" }),
      DB_PORT: envField.number({ context: "server", access: "secret" }),
      DB_NAME: envField.string({ context: "server", access: "secret" }),
      DB_USER: envField.string({ context: "server", access: "secret" }),
      DB_PASSWORD: envField.string({ context: "server", access: "secret" }),

      // GIS / WFS-T
      WFST_WORKSPACE: envField.string({ context: "server", access: "secret" }),
      WFST_ENDPOINT: envField.string({ context: "server", access: "secret" }),
      WFST_USERNAME: envField.string({ context: "server", access: "secret" }),
      WFST_PASSWORD: envField.string({ context: "server", access: "secret" }),
      WFST_NAMESPACE: envField.string({ context: "server", access: "secret" }),

      DEFAULT_CATEGORY_ICON: envField.string({
        context: "server",
        access: "public",
      }),

      // Kontakt-Formular
      ALTCHA_HMAC_KEY: envField.string({ context: "server", access: "secret" }),

      // SMTP
      SMTP_HOST: envField.string({ context: "server", access: "secret" }),
      SMTP_PORT: envField.number({ context: "server", access: "secret" }),
      SMTP_SECURE: envField.boolean({ context: "server", access: "secret" }),
      SMTP_USER: envField.string({ context: "server", access: "secret" }),
      SMTP_PASS: envField.string({ context: "server", access: "secret" }),

      // Email Empfänger/Absender
      CONTACT_EMAIL_TO: envField.string({
        context: "server",
        access: "secret",
      }),
      CONTACT_EMAIL_FROM: envField.string({
        context: "server",
        access: "secret",
      }),

      // Debugging (optional, kann in.env stehen oder nicht)
      APP_DEBUG: envField.boolean({
        context: "server",
        access: "public",
        default: false,
      }),
    },
  },

  output: "server",
  adapter: node({ mode: "standalone" }),

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ["ol", "proj4", "vue"], // Pre-bundle GIS-Dependencies
    },
    css: { transformer: "lightningcss" },
    build: { cssMinify: "lightningcss" },
    server: {
      hmr: {
        host: "localhost",
        port: 4325,
        protocol: "ws",
      },
    },
  },

  // experimental: {
  //   session: true, // Nur falls Du experimentelle Sessions brauchst
  // },
  server: {
    host: "0.0.0.0",
    port: 4321,
  },

  integrations: [
    mdx(),
    vue(),
    polygonSyncPlugin({
      watchDir: "src/content/kommunen",
      autoSync: true,
      followSymlinks: true,
      debounceMs: 5000, // Warte länger auf Vite HMR completion
      debug: process.env.APP_DEBUG === "true",
    }),
  ],
});
