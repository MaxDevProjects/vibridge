import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// AGENT_PORT is baked in at build time from the --build.define flag
const AGENT_PORT = process.env.VITE_AGENT_PORT ?? '3333';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'DevBridge',
        short_name: 'DevBridge',
        description: 'Mobile control panel for your AI dev environment',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: { enabled: true },
    }),
  ],
  define: {
    __AGENT_PORT__: JSON.stringify(AGENT_PORT),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
