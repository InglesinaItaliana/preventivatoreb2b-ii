import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { usePianiTaglio } from '../griglie/usePianiTaglio';
import type { RichiestaPiano } from '../../logic/griglie/nesting';

/**
 * Il calcolo in background dei piani di taglio. Qui non c'è `Worker` (ambiente
 * node): il composable calcola nel thread, ma i tempi — subito la prima volta,
 * poi a dati fermi — e il `pronto` sono gli stessi.
 */

const richiesta = (lunghezza: number, quantita = 4): RichiestaPiano => ({
  chiave: 'Inglesina 26 BIANCO 9010',
  pezzi: [{ etichetta: 'V1', lunghezza, quantita }],
  lunghezzaStecca: 3000,
  kerf: 3,
  opzioni: { intestatura: 20 },
});

describe('usePianiTaglio', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function monta(iniziale: number) {
    const lunghezza = ref(iniziale);
    const scope = effectScope();
    const stato = scope.run(() => usePianiTaglio(() => [richiesta(lunghezza.value)], 400))!;
    return { lunghezza, scope, ...stato };
  }

  it('la prima volta calcola subito', async () => {
    const { piani, pronto, scope } = monta(1000);
    expect(pronto.value).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(pronto.value).toBe(true);
    expect(piani.value.get('Inglesina 26 BIANCO 9010')!.passi[0]!.lunghezza).toBe(1000);
    scope.stop();
  });

  it('dopo, ricalcola solo quando i dati smettono di cambiare', async () => {
    const { lunghezza, piani, pronto, scope } = monta(1000);
    await vi.advanceTimersByTimeAsync(0);

    // Un cursore trascinato: tre valori in fila, un calcolo solo, sull'ultimo
    for (const l of [1100, 1200, 1300]) {
      lunghezza.value = l;
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(pronto.value).toBe(false);   // i piani a video sono ancora quelli vecchi
    expect(piani.value.get('Inglesina 26 BIANCO 9010')!.passi[0]!.lunghezza).toBe(1000);

    await vi.advanceTimersByTimeAsync(400);
    expect(pronto.value).toBe(true);
    expect(piani.value.get('Inglesina 26 BIANCO 9010')!.passi[0]!.lunghezza).toBe(1300);
    scope.stop();
  });

  it('tornando ai dati dei piani che ci sono, è subito pronto', async () => {
    const { lunghezza, pronto, scope } = monta(1000);
    await vi.advanceTimersByTimeAsync(0);
    lunghezza.value = 1100;
    await nextTick();
    expect(pronto.value).toBe(false);
    lunghezza.value = 1000;
    await nextTick();
    expect(pronto.value).toBe(true);
    scope.stop();
  });
});
