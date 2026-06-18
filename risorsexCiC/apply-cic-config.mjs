// ============================================================================
// apply-cic-config.mjs — completa la configurazione CiC dell'azienda definitiva:
//   1. crea il prodotto generico "VARIE" in CiC (fallback righe senza mapping)
//   2. scrive config/cic con i nomi di campo corretti + gli ID reali rilevati
//
// SICUREZZA: di default è DRY-RUN (mostra i payload, NON scrive nulla).
//   Per eseguire davvero:  node risorsexCiC/apply-cic-config.mjs --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const cfgRef = db.collection('config').doc('cic');
const d = (await cfgRef.get()).data() || {};
const CREDS = {
  secret: d.secret || d.appSecretToken,
  agreement: d.agreement || d.agreementGrantToken,
  baseUrl: d.baseUrl || 'https://rest.reviso.com',
};
if (!CREDS.secret || !CREDS.agreement) { console.error('❌ Credenziali CiC mancanti in config/cic'); process.exit(1); }

async function reviso(method, pathname, body) {
  const res = await fetch(`${CREDS.baseUrl}${pathname}`, {
    method,
    headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

console.log(APPLY ? '🔴 MODALITÀ APPLY — scrivo davvero\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply per eseguire)\n');

// ── 1) Prodotto generico VARIE ────────────────────────────────────────────────
const VARIE_PAYLOAD = {
  productNumber: 'VARIE',
  name: 'Varie',
  description: 'Voce generica (fallback righe senza prodotto a catalogo)',
  productGroup: { productGroupNumber: 3 }, // "Prodotti con IVA 22%"
  salesPrice: 0,
};
console.log('① Prodotto generico CiC — POST /products');
const exists = await reviso('GET', '/products?filter=' + encodeURIComponent('productNumber$eq:VARIE'));
if ((exists.json?.collection || []).length) {
  console.log('   ✓ "VARIE" esiste già → nessuna creazione.');
} else {
  console.log('   payload:', JSON.stringify(VARIE_PAYLOAD));
  if (APPLY) {
    const r = await reviso('POST', '/products', VARIE_PAYLOAD);
    if (r.ok && r.json?.productNumber) console.log(`   ✅ creato: productNumber=${r.json.productNumber}`);
    else { console.error('   ❌ creazione fallita:', r.status, JSON.stringify(r.json)); process.exit(1); }
  } else console.log('   (dry-run: non creato)');
}

// ── 2) config/cic completo ────────────────────────────────────────────────────
const NEW_CFG = {
  appSecretToken: CREDS.secret,
  agreementGrantToken: CREDS.agreement,
  baseUrl: CREDS.baseUrl,
  vatCode: 'V022',
  vatRate: 22,
  layoutNumber: 9,
  ddtNumberSeries: 29,
  defaultPaymentTermsNumber: 11,
  domesticVatZone: 1,
  customerGroupNumber: 1,
  genericProductNumber: 'VARIE',
};
console.log('\n② config/cic — update con i campi corretti');
const masked = { ...NEW_CFG, appSecretToken: CREDS.secret.slice(0, 4) + '…', agreementGrantToken: CREDS.agreement.slice(0, 4) + '…' };
console.log('   nuovo doc:', JSON.stringify(masked, null, 0));
console.log('   + rimuovo i campi legacy: secret, agreement');
if (APPLY) {
  await cfgRef.set({
    ...NEW_CFG,
    secret: admin.firestore.FieldValue.delete(),
    agreement: admin.firestore.FieldValue.delete(),
  }, { merge: true });
  console.log('   ✅ config/cic aggiornato.');
} else console.log('   (dry-run: non scritto)');

console.log('\n' + (APPLY ? '✅ Fatto.' : '🟢 Dry-run completato. Rilancia con --apply per eseguire.'));
process.exit(0);
