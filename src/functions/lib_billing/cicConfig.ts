// ============================================================================
// Configurazione CiC / Reviso — letta da Firestore (config/cic, config/billing)
// con fallback su variabili d'ambiente per i segreti.
// ----------------------------------------------------------------------------
// I due token (AppSecret + AgreementGrant) insieme = accesso completo alla
// contabilità → vanno come secret (firebase functions:secrets), MAI nel repo né
// lato client. Gli ID (vatCode, serie, layout...) sono quelli rilevati nello
// spike 2026-06-05 sul trial italiano e sono sovrascrivibili da config/cic.
// ============================================================================

import * as admin from 'firebase-admin';
import { BillingBackend } from './types';

export interface CicConfig {
  appSecretToken: string;
  agreementGrantToken: string;
  baseUrl: string;
  vatCode: string;             // codice IVA vendite (es. V022 = 22%)
  vatRate: number;             // aliquota in % (es. 22)
  layoutNumber: number;        // layout documento (IT v2.0 = 9)
  ddtNumberSeries: number;     // serie DDT vendite (= 29)
  defaultPaymentTermsNumber: number;  // termine pagamento di default (es. 6)
  domesticVatZone: number;     // vatZone domestica (= 1)
  customerGroupNumber: number; // gruppo clienti di default (= 1)
  genericProductNumber: string;// prodotto generico per righe senza codice (Spedizione/Extra)
}

const DEFAULTS = {
  baseUrl: 'https://rest.reviso.com',
  vatCode: 'V022',
  vatRate: 22,
  layoutNumber: 9,
  ddtNumberSeries: 29,
  defaultPaymentTermsNumber: 6,
  domesticVatZone: 1,
  customerGroupNumber: 1,
  genericProductNumber: 'VARIE',
};

export async function getCicConfig(): Promise<CicConfig> {
  const snap = await admin.firestore().collection('config').doc('cic').get();
  const d = (snap.exists ? snap.data() : {}) as Record<string, any>;

  const appSecretToken = process.env.REVISO_APP_SECRET || d.appSecretToken;
  const agreementGrantToken = process.env.REVISO_AGREEMENT_GRANT || d.agreementGrantToken;
  if (!appSecretToken || !agreementGrantToken) {
    throw new Error('Credenziali CiC mancanti (config/cic.appSecretToken/agreementGrantToken o env REVISO_*)');
  }

  return {
    appSecretToken,
    agreementGrantToken,
    baseUrl: d.baseUrl || DEFAULTS.baseUrl,
    vatCode: d.vatCode || DEFAULTS.vatCode,
    vatRate: d.vatRate ?? DEFAULTS.vatRate,
    layoutNumber: d.layoutNumber ?? DEFAULTS.layoutNumber,
    ddtNumberSeries: d.ddtNumberSeries ?? DEFAULTS.ddtNumberSeries,
    defaultPaymentTermsNumber: d.defaultPaymentTermsNumber ?? DEFAULTS.defaultPaymentTermsNumber,
    domesticVatZone: d.domesticVatZone ?? DEFAULTS.domesticVatZone,
    customerGroupNumber: d.customerGroupNumber ?? DEFAULTS.customerGroupNumber,
    genericProductNumber: d.genericProductNumber || DEFAULTS.genericProductNumber,
  };
}

/** Backend attivo per i NUOVI documenti. Default 'fic' finché non si flippa al cutover. */
export async function getActiveBackend(): Promise<BillingBackend> {
  const snap = await admin.firestore().collection('config').doc('billing').get();
  const b = (snap.exists ? snap.data() : {})?.activeBackend;
  return b === 'cic' ? 'cic' : 'fic';
}
