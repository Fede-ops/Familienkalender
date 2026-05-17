import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// When deploying to GitHub Pages set VITE_DEPLOY_BASE=/nanoclaw/
const base = process.env.VITE_DEPLOY_BASE ?? "/";
const buildTime = new Date().toISOString();

export default defineConfig({
  base,
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "Familienkalender",
        short_name: "Kalender",
        description: "Shared family calendar backed by Home Assistant",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
