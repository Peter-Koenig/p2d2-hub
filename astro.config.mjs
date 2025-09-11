import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx"; // Nur falls du MDX brauchst

import vue from "@astrojs/vue";

export default defineConfig({
  // Performance: Telemetrie deaktivieren (spart ~560ms)
  telemetry: false,
  // Optional, falls du eine feste Domain hast
  site: "https://opn.data-dna.eu",

  output: "server",
  adapter: node({ mode: "standalone" }),

  // integrations: [mdx()], // Nur falls du MDX brauchst
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["ol", "proj4", "vue"], // Pre-bundle GIS-Dependencies
    },
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

  integrations: [vue()],
});
