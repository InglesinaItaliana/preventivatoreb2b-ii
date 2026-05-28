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
      registerType: 'prompt',
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
        // skipWaiting:true → il nuovo SW va direttamente in 'activated' senza
        // passare da 'waiting'. Combinato con clientsClaim, il nuovo SW prende
        // subito il controllo dei client al primo install. Senza skipWaiting,
        // dopo l'unregister+reload di useSWUpdate.applyUpdate il nuovo SW
        // restava in 'waiting' e workbox-window riemetteva l'evento 'waiting'
        // → il banner update si ri-armava all'infinito (loop QUASAR osservato
        // 2026-05-28). Vedi docs/ATLAS.md sez. 10.
        skipWaiting: true,
        clientsClaim: true,
        // Cache dei Google Fonts (CSS + file font), incluso "Material Symbols Outlined"
        // usato da <MIcon>. Senza questo, ad ogni deploy il SW si rigenera e il font
        // icone viene ri-richiesto alla CDN: finché non arriva le ligature sono invisibili
        // → le icone "spariscono" a intermittenza. Con CacheFirst il font è servito dalla
        // cache all'istante, indipendentemente dal deploy. statuses [0,200] gestisce le
        // risposte opaque cross-origin della CDN Google.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      includeAssets: [
        'firebase-messaging-sw.js',
        'pulsar/firebase-messaging-sw.js',
        'cepheid/firebase-messaging-sw.js',
      ],
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
            // NEBULA-DOCS editor: TipTap + ProseMirror + tippy.js (popup slash
            // menu / future mention popovers). ~120 KB gzip. Caricato SOLO
            // quando si apre /nebula/docs/:docId, mai per POPS o altre PWA.
            if (id.includes('@tiptap') || id.includes('prosemirror-') || id.includes('tippy.js')) {
              return 'nebula-docs-editor'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
