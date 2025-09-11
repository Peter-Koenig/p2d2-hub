import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import vue from "@astrojs/vue";

export default defineConfig({
  // Site URL for correct absolute URLs
  site: "https://opn.data-dna.eu",

  // Server output with Node.js adapter
  output: "server",
  adapter: node({ mode: "standalone" }),

  // Performance: Disable telemetry (avoid 560ms startup delay)
  telemetry: false,

  // Content optimizations to reduce sync time
  content: {
    experimental: {
      // Avoid full content sync on every change
      contentCollection: true,
    },
  },

  // Central Shiki configuration for syntax highlighting (Singleton pattern)
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      langs: [
        "javascript",
        "typescript",
        "bash",
        "json",
        "sql", // For PostGIS/geodata code
        "yaml", // For configuration files
        "xml", // For WFS/GML requests
      ],
      transformers: [],
    },
  },

  // Integrations with optimized Shiki configuration
  integrations: [
    // MDX with central Shiki configuration (avoids 10 separate instances)
    mdx({
      syntaxHighlight: "shiki",
      shikiConfig: {
        // Reuse global config - Singleton pattern
        theme: "github-light",
      },
    }),

    // Vue integration
    vue(),
  ],

  // Vite configuration with performance optimizations
  vite: {
    plugins: [tailwindcss()],

    // Dependency optimization for frequently used GIS libraries
    optimizeDeps: {
      include: [
        "ol", // OpenLayers - main GIS library
        "proj4", // Coordinate transformation
        "axios", // HTTP client for WFS requests
        "vue", // Vue.js framework
        "@vue/runtime-dom", // Vue runtime
      ],
      // Force pre-bundling to avoid re-optimization
      force: true,
    },

    // Dev server configuration
    server: {
      hmr: {
        host: "localhost",
        port: 4325,
        protocol: "ws",
      },
    },
  },

  // Server configuration
  server: {
    host: "0.0.0.0", // External access for development
    port: 4321,
  },

  // Experimental features: Session disabled (avoid performance overhead)
  experimental: {
    // Disable sessions completely to prevent filesystem overhead
    sessions: false,
    // Content optimizations
    contentCollection: true,
  },
});
