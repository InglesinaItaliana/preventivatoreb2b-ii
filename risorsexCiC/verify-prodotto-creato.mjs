// ============================================================================
// verify-prodotto-creato.mjs — verifica end-to-end di un prodotto creato dalla
// tab Listino (Fase 2). Sola lettura.
//
// Per uno o più codici controlla la catena completa:
//   listino_base/{cod}  → prezzo/tier
//   products/{cod}       → cicProductId
//   CiC /products?barCode=cod → prodotto esistente su Reviso
//   catalogo (cod==)     → quante righe colore lo usano
//
// Uso:  node risorsexCiC/verify-prodotto-creato.mjs I141 I142 ...
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep)('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const codes = process.argv.slice(2).map((s) => s.trim().toUpperCase()).filter(Boolean);
if (!codes.length) { console.error('Uso: node risorsexCiC/verify-prodotto-creato.mjs <COD> [COD...]'); process.exit(1); }

const cfg = (await db.collection('config').doc('cic').get()).data();
const reviso = async (p) => {
  const r = await fetch(`${cfg.baseUrl}${p}`, { headers: { 'X-AppSecretToken': cfg.appSecretToken, 'X-AgreementGrantToken': cfg.agreementGrantToken, 'Content-Type': 'application/json' } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};

let allOk = true;
for (const cod of codes) {
  console.log(`\n=== ${cod} ===`);
  const base = (await db.collection('listino_base').doc(cod).get()).data();
  const prod = (await db.collection('products').doc(cod).get()).data();
  const cic = await reviso(`/products?filter=${encodeURIComponent(`barCode$eq:${cod}`)}`);
  const cicItem = (cic?.collection || [])[0];
  const catSnap = await db.collection('catalogo').where('cod', '==', cod).get();

  const okBase = !!base;
  const okProd = !!prod?.cicProductId;
  const okCic = !!cicItem;
  const okCat = catSnap.size > 0;

  console.log(`  listino_base : ${okBase ? `OK (${base.modello}/${base.dimensione}/${base.finitura} = € ${base.prezzo})` : '❌ assente'}`);
  console.log(`  products     : ${okProd ? `OK (cicProductId=${prod.cicProductId})` : '❌ cicProductId mancante'}`);
  console.log(`  CiC /products: ${okCic ? `OK (productNumber=${cicItem.productNumber}, barCode=${cicItem.barCode})` : '❌ non trovato su Reviso'}`);
  console.log(`  catalogo     : ${okCat ? `${catSnap.size} colori` : '⚠️ 0 colori (non comparirà nel menu)'}`);
  if (okProd && okCic && String(prod.cicProductId) !== String(cicItem.productNumber)) {
    console.log(`  ⚠️ disallineamento: products.cicProductId=${prod.cicProductId} vs CiC productNumber=${cicItem.productNumber}`);
    allOk = false;
  }
  if (!(okBase && okProd && okCic && okCat)) allOk = false;
}

console.log('\n' + (allOk ? '✅ Catena completa per tutti i codici.' : '❌ Alcuni controlli falliti (vedi sopra).'));
process.exit(allOk ? 0 : 1);
