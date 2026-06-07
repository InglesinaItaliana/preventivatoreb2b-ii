// ============================================================================
// Helper unificante FiC / CiC lato frontend (Fase 2 migrazione).
// Data un preventivo, restituisce i riferimenti documento del backend giusto
// (FiC legacy o CiC), così la UI non deve sapere quale sistema c'è sotto.
// Funzioni pure: nessun side-effect (l'apertura documento è in FE-2).
// ============================================================================

import type { PreventivoDocumento } from '../types';

export type BillingBackend = 'fic' | 'cic';

export interface BillingInfo {
  backend: BillingBackend;
  hasOrder: boolean;
  hasDdt: boolean;
  orderId?: string | number;
  orderUrl?: string;
  ddtId?: string | number;
  ddtUrl?: string;
  ddtNumber?: string | number;
  billingError?: string;
}

/** Tipo lasco: i componenti spesso passano oggetti parziali (non l'intera interfaccia). */
type PreventivoLike = Partial<PreventivoDocumento> & Record<string, any>;

/** Risolve il backend: flag esplicito → presenza id CiC → default FiC. */
export function resolveBackend(p: PreventivoLike | null | undefined): BillingBackend {
  if (!p) return 'fic';
  if (p.billingBackend === 'cic' || p.billingBackend === 'fic') return p.billingBackend;
  if (p.cic_order_id || p.cic_ddt_id) return 'cic';
  return 'fic';
}

/** Riferimenti documento unificati per il preventivo. */
export function billingInfo(p: PreventivoLike | null | undefined): BillingInfo {
  const backend = resolveBackend(p);
  const cic = backend === 'cic';
  const pick = <T>(ficVal: T, cicVal: T): T => (cic ? cicVal : ficVal);
  return {
    backend,
    hasOrder: !!(cic ? p?.cic_order_id : p?.fic_order_id),
    hasDdt: !!(cic ? p?.cic_ddt_id : p?.fic_ddt_id),
    orderId: pick(p?.fic_order_id, p?.cic_order_id),
    orderUrl: pick(p?.fic_order_url, p?.cic_order_url),
    ddtId: pick(p?.fic_ddt_id, p?.cic_ddt_id),
    ddtUrl: pick(p?.fic_ddt_url, p?.cic_ddt_url),
    ddtNumber: pick(p?.fic_ddt_number, p?.cic_ddt_number),
    billingError: p?.billingError,
  };
}
