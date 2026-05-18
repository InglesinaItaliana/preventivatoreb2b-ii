import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'firebase'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
