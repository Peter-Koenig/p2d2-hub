import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import vue from "@astrojs/vue";
import { polygonSyncPlugin } from "./src/integrations/polygon-sync-plugin.mjs";
import { fileURLToPath } from "url";

export default defineConfig({
  // Performance: Telemetrie deaktivieren (spart ~560ms)
  telemetry: false,

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

      // Debugging
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
      debounceMs: 5000,
      debug: process.env.APP_DEBUG === "true",
    }),
  ],
});
