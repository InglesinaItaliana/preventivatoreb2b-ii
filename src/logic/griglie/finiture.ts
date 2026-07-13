// src/logic/griglie/finiture.ts
//
// Le finiture arrivano dal listino POPS. ATTENZIONE: nel listino il tipo NON si
// chiama "VERNICIATO" — quel valore non esiste. I gruppi veri sono:
//
//   COLORE STANDARD        → RAL a catalogo (BIANCO 9010, GRIGIO ANTRACITE 7016…)
//   COLORE PERSONALIZZATO  → RAL fuori catalogo, oro, pino, RAL personalizzato
//   RIVESTITA              → effetto legno (NOCE LE10, ROVERE DORATO LE07…)
//
// I primi due sono ciò che in officina si chiama "verniciato". Filtrare su
// "VERNICIAT" non trova nulla: è il motivo per cui la tendina restava vuota.

export type FamigliaFinitura = 'VERNICIATO' | 'RIVESTITO';

export const GRUPPI: Record<FamigliaFinitura, string[]> = {
  VERNICIATO: ['COLORE STANDARD', 'COLORE PERSONALIZZATO'],
  RIVESTITO: ['RIVESTITA'],
};

/** Il gruppo del listino appartiene a questa famiglia? */
export function appartiene(gruppo: string, famiglia: FamigliaFinitura): boolean {
  return GRUPPI[famiglia].includes(gruppo.trim().toUpperCase());
}

// --- Colore -----------------------------------------------------------------
// Quasi tutte le finiture portano il RAL nel nome ("GRIGIO ANTRACITE 7016"):
// lo si estrae e si guarda in tabella. Le altre (effetto legno, oro, pino) hanno
// una voce esplicita. Sconosciuta → grigio neutro, senza inventare un colore.

const RAL: Record<string, string> = {
  '1013': '#E3D9C6', // avorio
  '1036': '#8A6642', // oro perlato
  '6005': '#2F4538', // verde muschio
  '6009': '#27352A', // verde abete
  '6021': '#89AC76', // verde pallido
  '7001': '#8F999F', // grigio argento
  '7016': '#383E42', // grigio antracite
  '7022': '#4C4A44', // grigio ombra
  '7032': '#B9B9A8', // grigio ghiaia
  '7035': '#D7D7D7', // grigio luce
  '8017': '#45322E', // marrone cioccolato
  '8019': '#3D3635', // marrone grigiastro
  '9005': '#0A0A0A', // nero
  '9010': '#F1EDE1', // bianco puro
};

const PER_NOME: Record<string, string> = {
  'GRIGIO MAREZZATO 007': '#8C8C8C',
  'MARRONE MAREZZATO': '#6B4F3A',
  'ORO': '#C9A227',
  'PINO': '#C8A165',
  'RAL PERSONALIZZATO': '#9CA3AF',
  // Rivestite: effetto legno, nessun RAL
  'BIANCO LE11': '#EDE7DC',
  'DOUGLAS LE01': '#B07C4F',
  'MACORÈ LE08': '#7B3F2E',
  'NOCE LE10': '#5C4033',
  'ROVERE CHIARO LE04': '#C4A57B',
  'ROVERE DORATO LE07': '#A9762F',
  'WINCHESTER': '#6E4B2A',
};

export const COLORE_NEUTRO = '#9CA3AF';

export function coloreFinitura(finitura: string): string {
  if (!finitura) return COLORE_NEUTRO;
  const nome = finitura.trim().toUpperCase();

  const esplicito = PER_NOME[nome];
  if (esplicito) return esplicito;

  // Un RAL è un numero di 4 cifre in coda al nome.
  const ral = nome.match(/\b(\d{4})\b/);
  if (ral?.[1] && RAL[ral[1]]) return RAL[ral[1]]!;

  return COLORE_NEUTRO;
}

/** Schiarisce/scurisce un colore: serve a distinguere le barre dal telaio a parità di finitura. */
export function tinta(hex: string, fattore: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(fattore < 0 ? c * (1 + fattore) : c + (255 - c) * fattore)));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
