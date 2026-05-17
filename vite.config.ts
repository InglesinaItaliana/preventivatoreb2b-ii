import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PULSAR',
        short_name: 'PULSAR',
        description: 'Chat e collaborazione Inglesina',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/pulsar/',
        scope: '/pulsar/',
        id: '/pulsar/',
        icons: [
          { src: '/icons/pulsar-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pulsar-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
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
