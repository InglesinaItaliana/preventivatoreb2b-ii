// ============================================================================
// lib_billing — punto d'ingresso del layer di fatturazione (Fase 2 migrazione)
// Selettore del provider in base a config/billing.activeBackend.
// Il FicProvider verrà aggiunto estraendo il codice FiC da index.ts (prossimo
// step, su questo branch): fino ad allora il path FiC resta quello attuale.
// ============================================================================

import { BillingBackend, BillingProvider } from './types';
import { createCicProvider } from './cicProvider';
import { getActiveBackend } from './cicConfig';

export * from './types';
export { round2, computeTotals } from './rounding';
export { getCicConfig, getActiveBackend } from './cicConfig';
export { CicProvider, createCicProvider } from './cicProvider';
export { CicClient } from './cicClient';
export { buildDdtLines, isDeliveryTariff, isRigaConsegna, DELIVERY_TARIFF_CODES } from './ddtLines';

/**
 * Ritorna il provider per il backend richiesto (o quello attivo da config).
 * 'fic' non è ancora servito da qui: usare il path legacy in index.ts finché
 * non viene estratto il FicProvider.
 */
export async function getBillingProvider(backend?: BillingBackend): Promise<BillingProvider> {
  const b = backend || (await getActiveBackend());
  if (b === 'cic') return createCicProvider();
  throw new Error("FicProvider non ancora disponibile in lib_billing: usare il path FiC legacy in index.ts");
}
