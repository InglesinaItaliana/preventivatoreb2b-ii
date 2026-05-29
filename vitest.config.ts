import { defineConfig } from 'vitest/config'

/**
 * Vitest — introdotto in Fase 6 (Yjs/CRDT). Copre la logica pura più rischiosa:
 *  - schema ProseMirror condiviso (guardia anti-drift, rischio #1)
 *  - helper Yjs server-side (round-trip, idempotenza, apply MCP)
 *
 * Niente DOM necessario per questi test (conversioni headless). I test su
 * componenti Vue/editor reale si aggiungeranno con jsdom/happy-dom quando
 * serviranno.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/functions/**/__tests__/**/*.test.ts',
    ],
    // Il bundle yjs/y-tiptap tocca localStorage al load: non far fallire.
    silent: false,
  },
})
