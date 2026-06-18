// ============================================================================
// test-ddt-batch.mjs — BATCH di test DDT su preventivi reali. Mix di DDT
// multi-ordine (clienti con ≥2 preventivi → DDT cumulativo) e singoli.
// Per ogni DDT: crea→emetti→verifica (numero assegnato, prodotti agganciati,
// IVA coerente)→CANCELLA SUBITO. Cancellando subito ogni DDT, il contatore della
// serie resta sempre a 1 (nessun buco). Cleanup garantito in finally.
//
// SICUREZZA: default DRY-RUN. Esegui con:  LIMIT=25 node risorsexCiC/test-ddt-batch.mjs --apply
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env.LIMIT || 25);
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const cfg = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: cfg.appSecretToken, agreement: cfg.agreementGrantToken, baseUrl: cfg.baseUrl };
const up = (s) => String(s ?? '').toUpperCase().trim();
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function reviso(method, p) { const r = await fetch(`${CREDS.baseUrl}${p}`, { method, headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' } }); const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; } return { status: r.status, ok: r.ok, json: j }; }
const del = async (id) => (await reviso('DELETE', `/delivery-notes/sales/${id}`)).status;
async function resolveCicProductIds(codes) { const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))]; const map = new Map(); await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); })); return map; }
function merceLines(elementi) { return (elementi || []).filter((it) => it.categoria !== 'EXTRA').map((item) => { let desc = item.descrizioneCompleta || 'Articolo Vetrata'; if (item.base_mm > 0 || item.altezza_mm > 0) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`; return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria }; }); }

// raggruppa preventivi (con merce) per cliente → job multi-ordine o singolo
const snap = await db.collection('preventivi').limit(500).get();
const byClient = new Map();
for (const doc of snap.docs) { const d = doc.data(); if (!d.clienteUID || !Array.isArray(d.elementi)) continue; if (!d.elementi.some((e) => e.categoria !== 'EXTRA' && (e.prezzo_unitario || 0) > 0)) continue; if (!byClient.has(d.clienteUID)) byClient.set(d.clienteUID, []); byClient.get(d.clienteUID).push({ id: doc.id, d }); }
const jobs = [];
for (const [uid, prevs] of byClient) { if (jobs.length >= LIMIT) break; const n = prevs.length >= 2 ? Math.min(3, prevs.length) : 1; jobs.push({ uid, prevs: prevs.slice(0, n), multi: n > 1 }); }

console.log(APPLY ? '🔴 APPLY — batch DDT (ognuno emesso, verificato, cancellato)\n' : '🟢 DRY-RUN\n');
console.log(`Job DDT: ${jobs.length} (multi-ordine=${jobs.filter((j) => j.multi).length}, singoli=${jobs.filter((j) => !j.multi).length})\n`);
if (!APPLY) { console.log('🟢 Dry-run. Rilancia con --apply.'); process.exit(0); }

const provider = await createCicProvider();
const open = new Set();
const res = { ok: 0, ko: 0, fails: [], maxNum: 0 };

try {
  let i = 0;
  for (const job of jobs) {
    i++;
    try {
      const u = (await db.collection('users').doc(job.uid).get()).data() || {};
      if (!u.piva) { res.ko++; res.fails.push(`${u.ragioneSociale || job.uid} no P.IVA`); continue; }
      const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
      let lines = [];
      for (const p of job.prevs) lines.push(...merceLines(p.d.elementi));
      const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
      for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
      const ddt = await provider.createDeliveryNote({ customer, date: new Date().toISOString().split('T')[0], lines, shipping: { packages: 1, transportType: 'INTERNAL' }, visibleSubject: `TEST batch DDT ${i}` });
      open.add(ddt.id);
      // verifica
      const fresh = await reviso('GET', `/delivery-notes/sales/${ddt.id}`);
      const dlines = fresh.json?.productDetails?.productLines || fresh.json?.lines || [];
      const varie = dlines.filter((l) => String(l.product?.id ?? l.product?.productNumber) === 'VARIE').length;
      const vatOk = Math.abs((ddt.vatAmount || 0) - round2((ddt.netAmount || 0) * 0.22)) <= 0.01;
      const numOk = ddt.number != null;
      const prodOk = varie === 0 && dlines.length === lines.length;
      const ok = numOk && prodOk && vatOk;
      if (ddt.number > res.maxNum) res.maxNum = ddt.number;
      if (ok) res.ok++; else { res.ko++; res.fails.push(`${u.ragioneSociale || job.uid}: num=${ddt.number} righe=${dlines.length}/${lines.length} varie=${varie} vatOk=${vatOk}`); }
      console.log(`   ${ok ? '✅' : '❌'} DDT#${i} ${job.multi ? '[multi×' + job.prevs.length + ']' : '[singolo]'} ${(u.ragioneSociale || '?').slice(0, 28).padEnd(28)} num=${ddt.number} righe=${dlines.length} net=${ddt.netAmount} iva=${ddt.vatAmount}`);
      // cancella subito → contatore torna indietro
      if (await del(ddt.id) < 400) open.delete(ddt.id);
    } catch (e) {
      res.ko++; res.fails.push(`job ${i}: ${(e?.message || e).slice(0, 80)}`);
      console.log(`   ❌ DDT#${i} ERRORE: ${(e?.message || e).slice(0, 80)}`);
    }
  }
} finally {
  if (open.size) { console.log(`\n🧹 Cleanup ${open.size} DDT residui…`); for (const id of [...open]) if (await del(id) < 400) open.delete(id); }
}

console.log('\n────────────────────────── BATCH DDT ──────────────────────────');
console.log(`✅ ${res.ok}/${res.ok + res.ko} DDT corretti (numero + prodotti agganciati + IVA coerente)`);
console.log(`   numero max raggiunto durante il batch: ${res.maxNum} (atteso 1 se ogni DDT è cancellato prima del successivo)`);
if (res.fails.length) console.log('   problemi: ' + res.fails.join(' | '));
console.log(open.size ? `\n⚠️ ${open.size} DDT NON cancellati: ${[...open].join(', ')}` : '\n🧹 Tutti i DDT di prova cancellati (contatore serie resta a 1).');
process.exit(res.ko === 0 && open.size === 0 ? 0 : 2);
