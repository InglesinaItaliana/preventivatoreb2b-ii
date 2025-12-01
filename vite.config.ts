import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // Aumentiamo il limite del warning a 1600kb (1.6MB) per gestire Firebase senza allarmi
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Mettiamo Firebase in un file separato (è il più pesante)
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'firebase';
            }
            // Mettiamo tutte le altre librerie (Vue, Router, Heroicons) in un file 'vendor'
            return 'vendor';
          }
        }
      }
    }
  }
})