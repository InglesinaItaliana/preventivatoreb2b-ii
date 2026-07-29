// ============================================================================
// verifica-province.mjs — SOLA LETTURA. Confronta la tabella province congelata
// in POPS (functions/lib_billing/destinazione.ts) con quella viva di Reviso.
//
// Perché esiste: la tabella è congelata nel codice di proposito (l'endpoint è
// paginato e di default torna 20 record su 112 — una fetch distratta produce una
// mappa monca a metà alfabeto, in silenzio). Il test unitario tiene allineate le
// due copie POPS fra loro, ma non può sapere se REVISO ha cambiato qualcosa:
// quello lo dice questo script, da lanciare quando si sospetta una deriva.
//
// Uso:  node risorsexCiC/verifica-province.mjs
// Esce 1 se trova differenze (usabile in un controllo periodico).
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const require = createRequire(path.join(repo, 'src', 'functions') + path.sep);
const admin = require('firebase-admin');

// La tabella come la usa la produzione: si legge dal COMPILATO, non dal sorgente,
// così si verifica esattamente ciò che gira nelle functions.
const { PROVINCE_CIC } = require(path.join(repo, 'src/functions/lib/lib_billing/destinazione.js'));

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const cfg = (await admin.firestore().collection('config').doc('cic').get()).data() || {};
const BASE = cfg.baseUrl || 'https://rest.reviso.com';

const res = await fetch(`${BASE}/provinces/IT?pagesize=1000`, {
  headers: {
    'X-AppSecretToken': cfg.secret || cfg.appSecretToken,
    'X-AgreementGrantToken': cfg.agreement || cfg.agreementGrantToken,
    'Content-Type': 'application/json',
  },
});
const json = await res.json();
const vive = (json?.collection || []).filter((p) => p.code); // scarta il record fantasma n.999

console.log(`Reviso: ${vive.length} province valide (+ ${(json?.collection || []).length - vive.length} senza sigla)`);
console.log(`POPS  : ${Object.keys(PROVINCE_CIC).length} in tabella\n`);

const problemi = [];
for (const p of vive) {
  const nostro = PROVINCE_CIC[p.code];
  if (nostro === undefined) problemi.push(`MANCA in POPS: ${p.code} = ${p.provinceNumber} (${p.name})`);
  else if (nostro !== p.provinceNumber) problemi.push(`NUMERO DIVERSO: ${p.code} → POPS ${nostro}, Reviso ${p.provinceNumber}`);
}
const sigleVive = new Set(vive.map((p) => p.code));
for (const code of Object.keys(PROVINCE_CIC)) {
  if (!sigleVive.has(code)) problemi.push(`IN PIÙ in POPS: ${code} (Reviso non la conosce)`);
}

if (problemi.length === 0) {
  console.log('✅ Tabella allineata con Reviso.');
  process.exit(0);
}
console.log('⚠️  Differenze trovate:');
for (const p of problemi) console.log('   ' + p);
console.log('\nSe la differenza è reale, aggiornare PROVINCE_CIC in');
console.log('src/functions/lib_billing/destinazione.ts E SIGLE_PROVINCE in src/lib/destinazione.ts');
console.log('(il test anti-drift in src/lib/__tests__/destinazione.test.ts controlla che restino uguali).');
process.exit(1);
