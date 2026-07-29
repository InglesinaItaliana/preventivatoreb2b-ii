// Anteprima headless dei PDF POPS (nessun browser, nessun Firestore): disegna
// un ordine e un DDT di esempio con l'anagrafica emittente passata come dato,
// per vedere l'intestazione senza dover fare un giro completo in app.
//   npx vite-node scripts/preview-pdf.mts -- /percorso/di/uscita
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';
import { drawBillingDocument, type PdfDocData } from '../src/lib/billingPdfDraw';

// Anagrafica come arriva da Reviso (settings/company).
const COMPANY_REVISO = {
  name: 'Inglesina Italiana S.r.l.',
  address: 'Via Cav. Angelo Manzoni 18',
  zip: '26866',
  city: "Sant'Angelo Lodigiano (LO)",
  province: 'LO',
  country: 'IT',
  piva: '14614580968',
  tel: '0371843883',
  email: 'info@inglesinaitaliana.it',
};

const righe = [
  { code: 'I101', description: 'Inglesina ORO 20mm  ·  1200×1500 mm', qty: 4, unitNetPrice: 48.5, totalNet: 194 },
  { code: 'C210', description: 'Canalino nero 12mm  ·  800×1100 mm', qty: 2, unitNetPrice: 22, totalNet: 44 },
  { code: 'L003', description: 'Consegna con mezzo proprio', qty: 1, unitNetPrice: 60, totalNet: 60 },
];

const base: PdfDocData = {
  kind: 'order',
  number: 1234,
  date: '28/07/2026',
  customer: { name: 'Vetreria Esempio S.r.l.', piva: '01234567890', address: 'Via Roma 1', zip: '20100', city: 'Milano', province: 'MI' },
  reference: 'COMMESSA-TEST',
  lines: righe,
  showPrices: true,
  net: 298,
  vat: 65.56,
  gross: 363.56,
  vatRate: 22,
};

const out = process.argv[process.argv.length - 1];
for (const [kind, nome] of [['order', 'ordine'], ['ddt', 'ddt'], ['quotation', 'preventivo']] as const) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const data: PdfDocData = kind === 'ddt'
    ? { ...base, kind, showPrices: false, lines: righe.map(({ code, description, qty }) => ({ code, description, qty })),
        net: undefined, vat: undefined, gross: undefined, vatRate: undefined,
        destinazione: {
          destinatario: 'Cantiere Rossi & C. snc', indirizzo: 'Via Giuseppe Verdi 42',
          cap: '20121', citta: 'Milano', provincia: 'MI',
          referente: 'Sig. Rossi', telefono: '02 1234567',
        },
        transport: { causale: 'VENDITA', deliveredBy: 'Mittente', packages: 3, date: '28/07/2026' } }
    : { ...base, kind };
  drawBillingDocument(doc, data, undefined, COMPANY_REVISO);
  writeFileSync(`${out}/${nome}.pdf`, Buffer.from(doc.output('arraybuffer')));
  console.log(`${out}/${nome}.pdf`);
}
