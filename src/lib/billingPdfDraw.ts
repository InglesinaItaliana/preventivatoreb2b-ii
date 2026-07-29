// ============================================================================
// Disegno PDF documento (ordine / preventivo / DDT) — layout POPS, minimale.
// Logica PURA: riceve un'istanza jsPDF (`doc`) e i dati, NON importa jsPDF né usa
// API del browser → usabile sia nel frontend (src/lib/billingPdf.ts) sia in uno
// script Node di anteprima. Unica fonte di verità del layout.
// Unità: mm, formato A4 (210×297). Il `doc` va creato con { unit:'mm', format:'a4' }.
// ============================================================================

import type { DestinazioneMerce } from './destinazione';

// Dati dell'azienda emittente stampati in intestazione.
// La fonte di verità è REVISO (GET /self → .company), pubblicata su
// settings/company dalla function syncCompanyInfo e letta a runtime da
// billingPdf.ts: l'intestazione dei PDF POPS deve coincidere con quella dei
// documenti Reviso, altrimenti dello stesso DDT girano due versioni con
// emittenti diversi. Vedi functions/lib_billing/companyInfo.ts.
export interface CompanyInfo {
  name: string;
  address: string;   // via e civico
  zip: string;
  city: string;      // può già contenere la provincia: "Sant'Angelo Lodigiano (LO)"
  province: string;  // sigla
  country?: string;
  piva: string;      // solo il numero: il prefisso "P.IVA" lo mette il disegno
  tel: string;       // vuoto = riga telefono omessa
  email: string;
  web?: string;      // non esiste in Reviso: resta qui, compare solo nel footer
}

// Fallback: ultimo dato buono, allineato a Reviso il 2026-07-28. Serve quando
// settings/company non è leggibile (offline, primo avvio prima del sync) —
// meglio un'intestazione vecchia di un'intestazione vuota.
export const COMPANY: CompanyInfo = {
  name: 'Inglesina Italiana S.r.l.',
  address: 'Via Cav. Angelo Manzoni 18',
  zip: '26866',
  city: 'Sant\'Angelo Lodigiano (LO)',
  province: 'LO',
  country: 'IT',
  piva: '14614580968',
  tel: '0371843883',
  email: 'info@inglesinaitaliana.it',
  web: 'preventivatoreb2b-ii.web.app',
};

/** Sovrascrive il fallback solo con i campi valorizzati (un campo vuoto in
 *  Firestore non deve cancellare l'ultimo dato buono). */
export function mergeCompany(over?: Partial<CompanyInfo> | null): CompanyInfo {
  const out: CompanyInfo = { ...COMPANY };
  if (over) {
    for (const k of Object.keys(out) as (keyof CompanyInfo)[]) {
      const v = over[k];
      if (typeof v === 'string' && v.trim()) (out as any)[k] = v.trim();
    }
  }
  return out;
}

/** Riga "CAP Città (PR)" — la provincia solo se la città non la porta già. */
export function companyCityLine(c: CompanyInfo): string {
  const prov = c.province && !c.city.toUpperCase().includes(`(${c.province.toUpperCase()})`)
    ? ` (${c.province})`
    : '';
  return [c.zip, c.city].filter(Boolean).join(' ') + prov;
}

export type PdfKind = 'order' | 'quotation' | 'ddt';

export interface PdfLine {
  code?: string;
  description: string;
  qty: number;
  unitNetPrice?: number;
  discountPct?: number;
  totalNet?: number;
  group?: string; // intestazione di gruppo (DDT cumulativo: ordine di provenienza)
}

export interface PdfDocData {
  kind: PdfKind;
  number?: string | number;
  date: string; // già formattata (es. 07/06/2026)
  customer: { name: string; piva?: string; address?: string; zip?: string; city?: string; province?: string };
  /**
   * Luogo di consegna diverso dall'indirizzo del cliente (solo DDT). Deve dire
   * ESATTAMENTE quello che dice il documento su Reviso: questo PDF è la copia di
   * cortesia dello stesso DDT, e due versioni che divergono sono peggio di una
   * sola. Su Reviso è il blocco "LUOGO DI DESTINAZIONE".
   */
  destinazione?: DestinazioneMerce;
  reference?: string;
  lines: PdfLine[];
  showPrices: boolean;
  net?: number;
  vat?: number;
  gross?: number;
  vatRate?: number;
  notes?: string;
  transport?: {
    causale?: string;
    deliveredBy?: string; // Mittente / Vettore
    carrier?: string;     // corriere
    packages?: number;    // colli
    weight?: number;      // kg
    tracking?: string;
    date?: string;
  };
}

// Palette POPS / SIDERA
const INK: [number, number, number] = [26, 24, 21];
const MID: [number, number, number] = [106, 101, 96];
const DIM: [number, number, number] = [150, 145, 138];
const AMBER: [number, number, number] = [251, 191, 36]; // #fbbf24 — amber POPS (amber-400)
const LINE: [number, number, number] = [224, 221, 215];
const TINT: [number, number, number] = [248, 247, 243];

const M = 16;          // margine
const RIGHT = 210 - M; // 194
const TITLES: Record<PdfKind, string> = {
  order: "CONFERMA D'ORDINE",
  quotation: 'PREVENTIVO',
  ddt: 'DOCUMENTO DI TRASPORTO',
};

function euro(n: number | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  try {
    return v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  } catch {
    return v.toFixed(2) + ' €';
  }
}

export function drawBillingDocument(
  doc: any,
  data: PdfDocData,
  logoDataUrl?: string,
  company?: Partial<CompanyInfo> | null,
): void {
  const C = mergeCompany(company);
  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  // ── HEADER ───────────────────────────────────────────────────────────────
  // Blocco documento (alto-sx): rettangolo scuro con titolo in ambra-400.
  const title = TITLES[data.kind];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  const blockW = doc.getTextWidth(title) + 12;
  const blockH = 11;
  setFill(INK); doc.roundedRect(M, 14, blockW, blockH, 1.8, 1.8, 'F');
  setText(AMBER); doc.text(title, M + 6, 21.4);

  // N. / Data sotto il blocco
  const metaY = 14 + blockH + 6.5;
  let mx = M;
  doc.setFontSize(9);
  if (data.number !== undefined && data.number !== null && data.number !== '') {
    setText(MID); doc.setFont('helvetica', 'normal'); doc.text('N.', mx, metaY);
    setText(INK); doc.setFont('helvetica', 'bold'); doc.text(String(data.number), mx + 6, metaY);
    mx += 6 + doc.getTextWidth(String(data.number)) + 10;
  }
  setText(MID); doc.setFont('helvetica', 'normal'); doc.text('Data', mx, metaY);
  setText(INK); doc.setFont('helvetica', 'bold'); doc.text(data.date, mx + 9, metaY);

  // Azienda emittente (alto-dx)
  if (logoDataUrl) {
    // Mantieni l'aspect ratio reale del logo entro un box max (niente stretch).
    let lw = 40, lh = 14;
    try { const pr = doc.getImageProperties(logoDataUrl); const r = (pr.width || 1) / (pr.height || 1); lh = lw / r; if (lh > 16) { lh = 16; lw = lh * r; } } catch { /* dims di default */ }
    try { doc.addImage(logoDataUrl, 'PNG', RIGHT - lw, 12, lw, lh); } catch { /* no logo */ }
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setText(INK);
    doc.text('INGLESINA ITALIANA', RIGHT, 19, { align: 'right' });
  }
  const cy = logoDataUrl ? 29 : 25;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(INK);
  doc.text(C.name, RIGHT, cy, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); setText(MID);
  let ay = cy + 3.3;
  // Righe dell'emittente: quelle vuote si saltano (un campo mancante in Reviso
  // non deve lasciare una riga bianca o un "· Tel." senza numero).
  const righeAzienda = [
    C.address,
    companyCityLine(C),
    [C.piva ? `P.IVA ${C.piva}` : '', C.tel ? `Tel. ${C.tel}` : ''].filter(Boolean).join('  ·  '),
    C.email,
  ].filter((r) => r && r.trim());
  for (const riga of righeAzienda) {
    // wrap a 92mm → resta nella metà destra, non tocca N./Data
    for (const ln of doc.splitTextToSize(riga, 92) as string[]) { doc.text(ln, RIGHT, ay, { align: 'right' }); ay += 2.9; }
  }

  // linea accent
  let y = 44;
  setDraw(AMBER); doc.setLineWidth(0.9); doc.line(M, y, RIGHT, y);

  // ── DESTINATARIO (sx) · LUOGO DI DESTINAZIONE (dx) ─────────────────────────
  // Affiancati come sul DDT di Reviso: chi compra a sinistra, dove va la merce a
  // destra. Due cursori verticali indipendenti, poi si riprende dal più basso.
  const bandY = y + 8;
  const COL2 = 108;                       // colonna destra
  const COL2W = RIGHT - COL2;
  // Senza destinazione la colonna sinistra si prende tutta la larghezza: ordini e
  // preventivi restano identici a prima.
  const leftW = data.destinazione ? COL2 - M - 8 : RIGHT - M;

  let yl = bandY;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
  doc.text('DESTINATARIO', M, yl);
  yl += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(INK);
  for (const ln of doc.splitTextToSize(data.customer.name || '—', leftW) as string[]) {
    doc.text(ln, M, yl); yl += 5;
  }
  yl -= 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setText(MID);
  const addr = [data.customer.address, [data.customer.zip, data.customer.city].filter(Boolean).join(' '),
    data.customer.province].filter(Boolean).join(' · ');
  if (addr) {
    for (const ln of doc.splitTextToSize(addr, leftW) as string[]) { yl += 4.8; doc.text(ln, M, yl); }
  }
  if (data.customer.piva) { yl += 4.8; doc.text(`P.IVA ${data.customer.piva}`, M, yl); }

  let yr = bandY;
  if (data.destinazione) {
    const d = data.destinazione;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
    doc.text('LUOGO DI DESTINAZIONE', COL2, yr);
    yr += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(INK);
    for (const ln of doc.splitTextToSize(d.destinatario || '—', COL2W) as string[]) {
      doc.text(ln, COL2, yr); yr += 5;
    }
    yr -= 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setText(MID);
    const rigaDest = [d.indirizzo, [d.cap, d.citta].filter(Boolean).join(' '), d.provincia]
      .filter(Boolean).join(' · ');
    if (rigaDest) {
      for (const ln of doc.splitTextToSize(rigaDest, COL2W) as string[]) { yr += 4.8; doc.text(ln, COL2, yr); }
    }
    const contatto = [d.referente, d.telefono].filter(Boolean).join(' · ');
    if (contatto) {
      for (const ln of doc.splitTextToSize(contatto, COL2W) as string[]) { yr += 4.8; doc.text(ln, COL2, yr); }
    }
  }

  y = Math.max(yl, yr);

  // ── TRASPORTO (DDT) ────────────────────────────────────────────────────────
  // Fra le intestazioni e le righe merce: sono i dati del viaggio, non del
  // documento. Compatto: le colonne si adattano al numero di campi, così non si
  // va a capo per un campo solo (era il caso della sola data di trasporto).
  if (data.transport) {
    const tb = data.transport;
    const fields: [string, string][] = [
      ['Causale trasporto', tb.causale || 'VENDITA'],
      ['Trasporto a mezzo', tb.deliveredBy || 'Mittente'],
    ];
    if (tb.carrier) fields.push(['Vettore / Corriere', tb.carrier]);
    if (tb.packages != null) fields.push(['Colli', String(tb.packages)]);
    if (tb.weight != null) fields.push(['Peso', `${tb.weight} kg`]);
    if (tb.tracking) fields.push(['Tracking', tb.tracking]);
    if (tb.date) fields.push(['Data trasporto', tb.date]);
    // Righe bilanciate: max 5 campi per riga, poi si distribuiscono in parti
    // uguali (7 campi = 4+3, non 5+2 con una riga quasi vuota).
    const rowsN = Math.ceil(fields.length / 5);
    const cols = Math.ceil(fields.length / rowsN);
    const cellW = (RIGHT - M) / cols;
    const cellH = 8.5;
    const boxH = 15.3 + (rowsN - 1) * cellH;
    y += 7;
    setFill(TINT); setDraw(LINE); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, RIGHT - M, boxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(DIM);
    doc.text('TRASPORTO', M + 4, y + 4.6);
    fields.forEach((f, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const cx = M + 4 + c * cellW, cy = y + 9 + r * cellH;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); setText(DIM);
      doc.text(f[0], cx, cy);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setText(INK);
      doc.text(f[1], cx, cy + 3.8);
    });
    y += boxH;
  }

  // ── RIFERIMENTO ────────────────────────────────────────────────────────────
  // Sul DDT sta sopra le righe, a sinistra: è l'etichetta della merce che segue,
  // e la metà destra dell'intestazione è occupata dal luogo di destinazione.
  // Su ordine e preventivo resta in alto a destra, dov'è sempre stato.
  if (data.reference) {
    if (data.kind === 'ddt') {
      y += 9;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
      doc.text('RIFERIMENTO', M, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(INK);
      doc.text(String(data.reference), M + 26, y);
      y -= 3; // la tabella parte comunque con il suo respiro (y += 10 sotto)
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
      doc.text('RIFERIMENTO', RIGHT, 53, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setText(INK);
      doc.text(String(data.reference), RIGHT, 58.5, { align: 'right' });
    }
  }

  // ── TABELLA RIGHE ──────────────────────────────────────────────────────────
  y += 10;
  const priced = data.showPrices;
  // colonne (right-edge per i numerici)
  const xCode = M, xDesc = priced ? 34 : 40;
  const xQtaR = priced ? 130 : RIGHT;
  const xPriceR = 156, xScR = 170, xImpR = RIGHT;

  const drawHead = () => {
    setFill(TINT); doc.rect(M, y, RIGHT - M, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(MID);
    const ty = y + 5.3;
    doc.text('COD.', xCode + 1, ty);
    doc.text('DESCRIZIONE', xDesc, ty);
    doc.text('Q.TÀ', xQtaR, ty, { align: 'right' });
    if (priced) {
      doc.text('PREZZO', xPriceR, ty, { align: 'right' });
      doc.text('SC.%', xScR, ty, { align: 'right' });
      doc.text('IMPORTO', xImpR, ty, { align: 'right' });
    }
    y += 8;
  };
  drawHead();

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let currentGroup: string | undefined;
  for (const l of data.lines) {
    if (y > 262) { doc.addPage(); y = 18; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); }
    // Intestazione di gruppo (DDT cumulativo): una banda per ogni ordine.
    if (l.group && l.group !== currentGroup) {
      currentGroup = l.group;
      if (y > 256) { doc.addPage(); y = 18; drawHead(); }
      setFill(TINT); doc.rect(M, y, RIGHT - M, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(INK);
      doc.text(currentGroup, xCode + 1, y + 4.2);
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    }
    const descLines: string[] = doc.splitTextToSize(l.description || '', (priced ? xQtaR - 8 : xQtaR - 30) - xDesc);
    const rowH = Math.max(7, descLines.length * 4.2 + 2.8);
    setText(MID); doc.setFontSize(8);
    doc.text(l.code || '', xCode + 1, y + 5);
    setText(INK); doc.setFontSize(9);
    doc.text(descLines, xDesc, y + 5);
    doc.text(String(l.qty), xQtaR, y + 5, { align: 'right' });
    if (priced) {
      setText(MID);
      doc.text(euro(l.unitNetPrice), xPriceR, y + 5, { align: 'right' });
      doc.text(l.discountPct ? `${l.discountPct}%` : '—', xScR, y + 5, { align: 'right' });
      setText(INK);
      doc.text(euro(l.totalNet), xImpR, y + 5, { align: 'right' });
    }
    y += rowH;
    setDraw(LINE); doc.setLineWidth(0.2); doc.line(M, y, RIGHT, y);
  }

  // ── TOTALI (solo se priced) ───────────────────────────────────────────────
  if (priced) {
    if (y + 30 > 283) { doc.addPage(); y = 18; } // i totali non devono finire sotto il footer
    y += 8;
    const boxX = 124;
    const simpleRow = (label: string, val: string) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setText(MID);
      doc.text(label, boxX, y);
      setText(INK); doc.text(val, xImpR, y, { align: 'right' });
      y += 6;
    };
    simpleRow('Imponibile', euro(data.net));
    simpleRow(`IVA ${data.vatRate ?? 22}%`, euro(data.vat));
    y += 2.5;
    const bh = 9;
    setFill(AMBER); doc.roundedRect(boxX, y, RIGHT - boxX, bh, 1.4, 1.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(INK);
    doc.text('TOTALE', boxX + 4, y + 6);
    doc.text(euro(data.gross), RIGHT - 4, y + 6, { align: 'right' });
    y += bh;
  }

  // ── NOTE ───────────────────────────────────────────────────────────────────
  if (data.notes) {
    const noteLines = doc.splitTextToSize(data.notes, RIGHT - M);
    if (y + 9 + noteLines.length * 4 > 283) { doc.addPage(); y = 18; }
    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM); doc.text('NOTE', M, y);
    y += 4.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setText(MID);
    doc.text(noteLines, M, y);
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const fy = 289;
  setDraw(LINE); doc.setLineWidth(0.3); doc.line(M, fy - 4, RIGHT, fy - 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(DIM);
  doc.text(
    [C.name, C.piva ? `P.IVA ${C.piva}` : '', C.email, C.web].filter(Boolean).join('  ·  '),
    105, fy, { align: 'center' },
  );
}
