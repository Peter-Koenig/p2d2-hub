import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx"; // Nur falls du MDX brauchst

import vue from "@astrojs/vue";

export default defineConfig({
  // Optional, falls du eine feste Domain hast
  site: "https://opn.data-dna.eu",

  output: "server",
  adapter: node({ mode: "standalone" }),

  // integrations: [mdx()], // Nur falls du MDX brauchst
  vite: {
    plugins: [tailwindcss()],
  },

  // experimental: {
  //   session: true, // Nur falls du experimentelle Sessions brauchst
  // },
  server: {
    host: "0.0.0.0",
    port: 4321, // Falls du explizit den Port setzen willst
  },

  integrations: [vue()],
});