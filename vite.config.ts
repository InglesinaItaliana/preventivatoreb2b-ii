import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Bundle analysis: `ANALYZE=true npm run build` → genera dist/stats.html con visualizzazione interattiva
    process.env.ANALYZE ? visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true, brotliSize: true }) : null,
    VitePWA({
      registerType: 'autoUpdate',
      // Manifest gestiti come file statici in /public/ (pops|pulsar|cepheid.webmanifest)
      // e selezionati a runtime dallo script inline in index.html in base al path.
      // Vedi POLARIS.md azione 2.
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Escludi il SW di FCM dal precaching/navigateFallback (è gestito da Firebase Messaging)
        navigateFallbackDenylist: [/^\/firebase-messaging-sw\.js$/],
      },
      includeAssets: ['firebase-messaging-sw.js'],
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // POLARIS azione 4 — split granulare Firebase: POPS NON usa messaging, lo carichiamo
        // solo nelle PWA che lo richiedono (PULSAR/CEPHEID via composables/shared/useNotifications).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase/messaging') || id.includes('@firebase/messaging')) {
              return 'firebase-messaging'
            }
            if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
              return 'firebase-firestore'
            }
            if (id.includes('firebase/functions') || id.includes('@firebase/functions')) {
              return 'firebase-functions'
            }
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'firebase-core'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
