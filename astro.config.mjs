import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx"; // Nur falls du MDX brauchst

export default defineConfig({
  site: "https://opn.data-dna.eu", // Optional, falls du eine feste Domain hast
  output: "server",
  adapter: node({ mode: "standalone" }),
  // integrations: [mdx()], // Nur falls du MDX brauchst
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: "0.0.0.0",
    port: 4321, // Falls du explizit den Port setzen willst
  },
  // experimental: {
  //   session: true, // Nur falls du experimentelle Sessions brauchst
  // },
});

