// ============================================================================
// Disegno PDF documento (ordine / preventivo / DDT) — layout POPS, minimale.
// Logica PURA: riceve un'istanza jsPDF (`doc`) e i dati, NON importa jsPDF né usa
// API del browser → usabile sia nel frontend (src/lib/billingPdf.ts) sia in uno
// script Node di anteprima. Unica fonte di verità del layout.
// Unità: mm, formato A4 (210×297). Il `doc` va creato con { unit:'mm', format:'a4' }.
// ============================================================================

// Dati azienda emittente — nuova società CiC (aggiornati al cutover FiC→CiC).
export const COMPANY = {
  name: 'Inglesina Italiana Srl',
  address: 'Via Cavalier Angelo Manzoni 18, Zona industriale Maiano, 26866 Sant\'Angelo Lodigiano (LO)',
  piva: 'P.IVA 14614580968',
  tel: '+39 348 7293897',
  email: 'info@inglesinaitaliana.it',
  web: 'preventivatoreb2b-ii.web.app',
};

export type PdfKind = 'order' | 'quotation' | 'ddt';

export interface PdfLine {
  code?: string;
  description: string;
  qty: number;
  unitNetPrice?: number;
  discountPct?: number;
  totalNet?: number;
}

export interface PdfDocData {
  kind: PdfKind;
  number?: string | number;
  date: string; // già formattata (es. 07/06/2026)
  customer: { name: string; piva?: string; address?: string; zip?: string; city?: string; province?: string };
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

export function drawBillingDocument(doc: any, data: PdfDocData, logoDataUrl?: string): void {
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
    try { doc.addImage(logoDataUrl, 'PNG', RIGHT - 34, 13, 34, 12); } catch { /* no logo */ }
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setText(INK);
    doc.text('INGLESINA ITALIANA', RIGHT, 19, { align: 'right' });
  }
  const cy = logoDataUrl ? 30 : 25;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(MID);
  doc.text(COMPANY.name, RIGHT, cy, { align: 'right' });
  doc.text(`${COMPANY.address}  ·  ${COMPANY.piva}`, RIGHT, cy + 3.6, { align: 'right' });
  doc.text(`Tel. ${COMPANY.tel}  ·  ${COMPANY.email}`, RIGHT, cy + 7.2, { align: 'right' });

  // linea accent
  let y = 44;
  setDraw(AMBER); doc.setLineWidth(0.9); doc.line(M, y, RIGHT, y);

  // ── DESTINATARIO ───────────────────────────────────────────────────────────
  y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
  doc.text('DESTINATARIO', M, y);
  y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(INK);
  doc.text(data.customer.name || '—', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setText(MID);
  const addr = [data.customer.address, [data.customer.zip, data.customer.city].filter(Boolean).join(' '),
    data.customer.province].filter(Boolean).join(' · ');
  if (addr) { y += 4.8; doc.text(addr, M, y); }
  if (data.customer.piva) { y += 4.8; doc.text(`P.IVA ${data.customer.piva}`, M, y); }

  // riferimento / commessa (a destra, stesso blocco)
  if (data.reference) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(DIM);
    doc.text('RIFERIMENTO', RIGHT, 53, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setText(INK);
    doc.text(String(data.reference), RIGHT, 58.5, { align: 'right' });
  }

  // ── TRASPORTO (DDT) ──────────────────────────────────────────────────────────
  if (data.transport) {
    y += 8;
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
    const cols = 3;
    const rowsN = Math.ceil(fields.length / cols);
    const cellW = (RIGHT - M) / cols;
    const cellH = 11;
    const boxH = 8 + rowsN * cellH;
    setFill(TINT); setDraw(LINE); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, RIGHT - M, boxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(DIM);
    doc.text('TRASPORTO', M + 4, y + 5.5);
    fields.forEach((f, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const cx = M + 4 + c * cellW, cy = y + 11 + r * cellH;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(DIM);
      doc.text(f[0], cx, cy);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(INK);
      doc.text(f[1], cx, cy + 4.5);
    });
    y += boxH;
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
  for (const l of data.lines) {
    if (y > 262) { doc.addPage(); y = 18; drawHead(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); }
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
  doc.text(`${COMPANY.name}  ·  ${COMPANY.piva}  ·  ${COMPANY.email}  ·  ${COMPANY.web}`, 105, fy, { align: 'center' });
}
