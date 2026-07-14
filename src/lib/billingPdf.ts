// ============================================================================
// Generazione PDF documento lato frontend (Opzione B: POPS genera il PDF).
// Usa jsPDF + la logica di disegno condivisa (billingPdfDraw). Apre in nuova
// scheda. Il logo SVG (public/logo.svg) viene rasterizzato in PNG via canvas.
// ============================================================================

import { jsPDF } from 'jspdf';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { drawBillingDocument, type PdfDocData, type PdfKind, type PdfLine } from './billingPdfDraw';
import { computeTotals } from './billingTotals';
import { ddtElementi, isRigaConsegna } from './billing';
import { db } from '../firebase';
import type { PreventivoDocumento } from '../types';

const VAT_RATE = 22;

type PreventivoLike = Partial<PreventivoDocumento> & Record<string, any>;

// L'anagrafica cliente completa (denominazione, P.IVA, indirizzo) vive su
// users/{clienteUID}, NON sul preventivo. Per i PDF generati da POPS la
// recuperiamo e la usiamo come fallback dei campi mancanti sul preventivo.
async function loadClientAnagrafica(uid?: string): Promise<Record<string, any> | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(fsDoc(db, 'users', uid));
    return snap.exists() ? (snap.data() as Record<string, any>) : null;
  } catch {
    return null;
  }
}

// Etichetta di gruppo per il DDT cumulativo: identifica l'ordine di provenienza
// delle righe (numero ordine CiC + commessa), così dal DDT si risale agli ordini.
function orderGroupLabel(o: PreventivoLike): string {
  const num = o.cic_order_number ?? o.cic_order_id ?? o.codice ?? '—';
  const ref = o.commessa;
  return `Ordine ${num}${ref ? ` · ${ref}` : ''}`;
}

// ── Logo: SVG → PNG (cache) ───────────────────────────────────────────────
let logoCache: string | null | undefined;
async function loadLogoPng(): Promise<string | undefined> {
  if (logoCache !== undefined) return logoCache || undefined;
  try {
    const svg = await (await fetch('/logo.svg')).text();
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('logo')); img.src = url; });
    // Gli attributi width/height del SVG sono inaffidabili (height="0.9" → logo schiacciato):
    // usiamo l'aspect ratio reale dal viewBox.
    let vw = 628, vh = 172;
    const vb = svg.match(/viewBox="([\d.\-\s]+)"/);
    if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); if (p[2] > 0 && p[3] > 0) { vw = p[2]; vh = p[3]; } }
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = vw * scale;
    canvas.height = vh * scale;
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
  // Il trasporto non prende lo sconto d'ordine (né qui, né sull'ordine CiC, né sul DDT).
  const scontoDiRiga = (e: any) => (isRigaConsegna(e) ? 0 : sconto);
  const totals = computeTotals(
    elementi.map((e) => ({
      qty: Number(e.quantita) || 1,
      unitNetPrice: Number(e.prezzo_unitario) || 0,
      discountPct: scontoDiRiga(e),
    })),
    sconto, VAT_RATE,
  );
  const isDdt = kind === 'ddt';
  // DDT: le righe sono già state selezionate da openDdtPdf (merce + lavorazioni +
  // una sola consegna), coerenti con quelle del DDT su CiC. Qui non si filtra più.
  const elForLines = elementi;
  const lines: PdfLine[] = elForLines.map((e) => {
    const i = elementi.indexOf(e);
    let desc = e.descrizioneCompleta || 'Articolo';
    if (e.categoria !== 'EXTRA' && (e.base_mm > 0 || e.altezza_mm > 0)) {
      desc += `  ·  ${e.base_mm}×${e.altezza_mm} mm${e.infoCanalino ? ` · ${e.infoCanalino}` : ''}`;
    }
    // Il DDT non porta prezzi: solo merce + quantità.
    const base: PdfLine = { code: e.codice || '', description: desc, qty: Number(e.quantita) || 1 };
    if (isDdt && e.__group) base.group = e.__group; // raggruppamento per ordine (DDT cumulativo)
    if (!isDdt) {
      base.unitNetPrice = Number(e.prezzo_unitario) || 0;
      base.discountPct = scontoDiRiga(e) || undefined;
      base.totalNet = totals.lineNets[i];
    }
    return base;
  });
  return {
    kind,
    number: isDdt
      ? (p.cic_ddt_number ?? p.fic_ddt_number ?? p.codice)
      : kind === 'order'
      ? (p.cic_order_number ?? p.codice)   // ordine: numero CiC vero (fallback codice)
      : p.codice,                           // preventivo: codice POPS
    date: fmtDate(isDdt
      ? (p.dataSpedizione || p.dataConsegnaPrevista || p.dataConferma || p.dataCreazione)
      : kind === 'order'
      ? (p.cic_order_date || p.dataConferma || p.dataCreazione)   // ordine: data CiC vera
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
    // Arricchisce i dati cliente (denominazione, P.IVA, indirizzo) da users/{uid}:
    // sul preventivo questi campi non sono salvati. I valori già presenti su `p`
    // restano prioritari; quelli dell'anagrafica fanno da fallback.
    const u = await loadClientAnagrafica(p.clienteUID);
    const enriched: PreventivoLike = u ? {
      ...p,
      cliente: p.cliente || u.ragioneSociale,
      ragioneSociale: p.ragioneSociale ?? u.ragioneSociale,
      clientePiva: p.clientePiva ?? p.piva ?? u.piva,
      piva: p.piva ?? u.piva,
      indirizzo: p.indirizzo ?? u.indirizzo,
      cap: p.cap ?? u.cap,
      citta: p.citta ?? u.citta,
      provincia: p.provincia ?? u.provincia,
    } : p;
    const data = buildPdfData(enriched, kind);
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
  // DDT cumulativo (più ordini): tagga ogni riga con l'ordine di provenienza,
  // così nel PDF compare un'intestazione di gruppo per ciascun ordine.
  // Le righe sono quelle del DDT su CiC: merce + lavorazioni + una sola consegna
  // (la tariffa più alta fra tutti gli ordini) → vedi ddtElementi().
  const multi = arr.length > 1;
  const merged: PreventivoLike = {
    ...first,
    elementi: ddtElementi(
      arr.flatMap((x) => {
        const elementi = Array.isArray(x.elementi) ? x.elementi : [];
        if (!multi) return elementi;
        const label = orderGroupLabel(x);
        return elementi.map((e: any) => ({ ...e, __group: label }));
      }),
      first.metodoSpedizione,   // corriere → la consegna diventa "Spedizione", come sul DDT CiC
    ),
  };
  return openBillingPdf(merged, 'ddt');
}
