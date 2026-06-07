// ============================================================================
// Generazione PDF documento lato frontend (Opzione B: POPS genera il PDF).
// Usa jsPDF + la logica di disegno condivisa (billingPdfDraw). Apre in nuova
// scheda. Il logo SVG (public/logo.svg) viene rasterizzato in PNG via canvas.
// ============================================================================

import { jsPDF } from 'jspdf';
import { drawBillingDocument, type PdfDocData, type PdfKind, type PdfLine } from './billingPdfDraw';
import { computeTotals } from './billingTotals';
import type { PreventivoDocumento } from '../types';

const VAT_RATE = 22;

type PreventivoLike = Partial<PreventivoDocumento> & Record<string, any>;

// ── Logo: SVG → PNG (cache) ───────────────────────────────────────────────
let logoCache: string | null | undefined;
async function loadLogoPng(): Promise<string | undefined> {
  if (logoCache !== undefined) return logoCache || undefined;
  try {
    const svg = await (await fetch('/logo.svg')).text();
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('logo')); img.src = url; });
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = (img.width || 120) * scale;
    canvas.height = (img.height || 48) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    logoCache = canvas.toDataURL('image/png');
    return logoCache;
  } catch {
    logoCache = null; // fallback al wordmark testuale
    return undefined;
  }
}

function fmtDate(v: any): string {
  let d: Date;
  try { d = v?.toDate ? v.toDate() : (v ? new Date(v) : new Date()); } catch { d = new Date(); }
  if (isNaN(d.getTime())) d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Mappa un preventivo nei dati del PDF. */
export function buildPdfData(p: PreventivoLike, kind: PdfKind): PdfDocData {
  const elementi: any[] = Array.isArray(p.elementi) ? p.elementi : [];
  const sconto = Number(p.scontoPercentuale) || 0;
  const totals = computeTotals(
    elementi.map((e) => ({ qty: Number(e.quantita) || 1, unitNetPrice: Number(e.prezzo_unitario) || 0 })),
    sconto, VAT_RATE,
  );
  const isDdt = kind === 'ddt';
  // DDT = documento di trasporto: elenca solo la merce (escludo gli EXTRA).
  const elForLines = isDdt ? elementi.filter((e) => e.categoria !== 'EXTRA') : elementi;
  const lines: PdfLine[] = elForLines.map((e) => {
    const i = elementi.indexOf(e);
    let desc = e.descrizioneCompleta || 'Articolo';
    if (e.categoria !== 'EXTRA' && (e.base_mm > 0 || e.altezza_mm > 0)) {
      desc += `  ·  ${e.base_mm}×${e.altezza_mm} mm${e.infoCanalino ? ` · ${e.infoCanalino}` : ''}`;
    }
    // Il DDT non porta prezzi: solo merce + quantità.
    const base: PdfLine = { code: e.codice || '', description: desc, qty: Number(e.quantita) || 1 };
    if (!isDdt) {
      base.unitNetPrice = Number(e.prezzo_unitario) || 0;
      base.discountPct = sconto || undefined;
      base.totalNet = totals.lineNets[i];
    }
    return base;
  });
  return {
    kind,
    number: isDdt ? (p.cic_ddt_number ?? p.fic_ddt_number ?? p.codice) : p.codice,
    date: fmtDate(isDdt
      ? (p.dataSpedizione || p.dataConsegnaPrevista || p.dataConferma || p.dataCreazione)
      : (p.dataConferma || p.dataCreazione)),
    customer: {
      name: p.cliente || p.ragioneSociale || '—',
      piva: p.clientePiva || p.piva,
      address: p.indirizzo,
      zip: p.cap,
      city: p.citta,
      province: p.provincia,
    },
    reference: p.commessa || p.codice,
    lines,
    showPrices: !isDdt,
    net: isDdt ? undefined : totals.net,
    vat: isDdt ? undefined : totals.vat,
    gross: isDdt ? undefined : totals.gross,
    vatRate: isDdt ? undefined : VAT_RATE,
    notes: p.noteCliente || undefined,
    transport: isDdt ? {
      causale: 'VENDITA',
      deliveredBy: p.metodoSpedizione === 'COURIER' ? 'Vettore' : 'Mittente',
      carrier: p.corriere || undefined,
      packages: p.colli != null ? Number(p.colli) : undefined,
      weight: p.peso != null ? Number(p.peso) : undefined,
      tracking: p.trackingCode || undefined,
      date: p.dataSpedizione ? fmtDate(p.dataSpedizione) : undefined,
    } : undefined,
  };
}

/** Costruisce e apre il PDF in una nuova scheda. */
export async function openBillingPdf(p: PreventivoLike, kind: PdfKind): Promise<void> {
  // Apri la scheda SUBITO, dentro il gesto utente (altrimenti il popup-blocker
  // la blocca perché window.open arriverebbe dopo l'await del logo).
  const win = window.open('', '_blank');
  try {
    const data = buildPdfData(p, kind);
    const logo = await loadLogoPng();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    drawBillingDocument(doc, data, logo);
    const blobUrl = doc.output('bloburl');
    if (win) win.location.href = blobUrl;
    else window.open(blobUrl, '_blank');
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}

export const openOrderPdf = (p: PreventivoLike) => openBillingPdf(p, 'order');
export const openQuotationPdf = (p: PreventivoLike) => openBillingPdf(p, 'quotation');

/** DDT: accetta un preventivo o una lista (DDT cumulativo) → unisce le righe. */
export function openDdtPdf(p: PreventivoLike | PreventivoLike[]): Promise<void> {
  const arr = Array.isArray(p) ? p : [p];
  const first: PreventivoLike = arr[0] || {};
  // Difensivo: un DDT cumulativo deve raggruppare ordini dello STESSO DDT.
  const ddtKey = (x: PreventivoLike) => (x.cic_ddt_id ?? x.fic_ddt_id ?? null);
  if (arr.length > 1 && arr.some((x) => ddtKey(x) !== ddtKey(first))) {
    console.warn('[billingPdf] DDT cumulativo: ordini con ddt_id diversi', arr.map(ddtKey));
  }
  const merged: PreventivoLike = {
    ...first,
    elementi: arr.flatMap((x) => (Array.isArray(x.elementi) ? x.elementi : [])),
  };
  return openBillingPdf(merged, 'ddt');
}
