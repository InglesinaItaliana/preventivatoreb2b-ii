// ============================================================================
// codici.ts — generatore dei codici articolo del listino (Fase 2).
//
// Formato: LETTERA(categoria) + 3 cifre posizionali = modello · dimensione · finitura-tier.
//   es. I112 = Inglesina · Varsavia(modello 1) · dim 18(dimensione 1) · COLORE STANDARD(finitura 2)
// Ogni cifra è un indice SEQUENZIALE (1-9) dentro il suo livello.
// I codici sono APPEND-ONLY e IMMUTABILI (sono su CiC e sui preventivi salvati):
// si assegna sempre il prossimo numero libero, MAI si rinumera.
// Solo categorie geometriche I/D/M/C (S/E/L sono flat e non passano da questa UI).
// ============================================================================

export const CATEGORIA_LETTERA: Record<string, string> = {
  INGLESINA: 'I',
  DUPLEX: 'D',
  MUNTIN: 'M',
  CANALINO: 'C',
};

/** Voce base esistente, di cui al generatore servono solo cod + modello + dimensione. */
export interface BaseEntry {
  cod: string;
  modello: string;
  dimensione: string;
}

/** Specifica di un nuovo tier da codificare. */
export interface TierSpec {
  categoria: string;
  modello: string;
  dimensione: string;
  tipoFinitura: string;
}

const UP = (s: unknown): string => String(s ?? '').trim().toUpperCase();
const isWellFormed = (cod: unknown): cod is string => typeof cod === 'string' && /^[A-Z]\d{3}$/.test(cod);

/**
 * Calcola il prossimo codice per (categoria, modello, dimensione) dato l'insieme
 * dei codici base esistenti. Riusa le cifre di modello/dimensione se quel
 * modello/dimensione esiste già; altrimenti assegna max+1. La cifra finitura è
 * sempre max+1 dentro (modello, dimensione) → append.
 *
 * NB: per creare PIÙ tier nella stessa transazione usa nextCodiciForTiers (che
 * accumula), altrimenti due tier della stessa dimensione otterrebbero la stessa
 * cifra finitura.
 */
export function nextCodice(
  categoria: string,
  modello: string,
  dimensione: string,
  existing: BaseEntry[],
): string {
  const lettera = CATEGORIA_LETTERA[UP(categoria)];
  if (!lettera) {
    throw new Error(`Categoria non gestita per i codici: "${categoria}" (ammesse: ${Object.keys(CATEGORIA_LETTERA).join(', ')})`);
  }

  const sameLetter = existing.filter((e) => isWellFormed(e.cod) && e.cod[0] === lettera);

  // modello → cifra (da cod[1])
  const modelDigitOf = new Map<string, number>();
  let maxModel = 0;
  for (const e of sameLetter) {
    const d = Number(e.cod[1]);
    modelDigitOf.set(UP(e.modello), d);
    if (d > maxModel) maxModel = d;
  }
  const mDigit = modelDigitOf.get(UP(modello)) ?? maxModel + 1;

  // dimensione → cifra (da cod[2]) DENTRO il modello scelto
  const sameModel = sameLetter.filter((e) => Number(e.cod[1]) === mDigit);
  const dimDigitOf = new Map<string, number>();
  let maxDim = 0;
  for (const e of sameModel) {
    const d = Number(e.cod[2]);
    dimDigitOf.set(UP(e.dimensione), d);
    if (d > maxDim) maxDim = d;
  }
  const dDigit = dimDigitOf.get(UP(dimensione)) ?? maxDim + 1;

  // finitura → max+1 dentro (modello, dimensione)
  const sameDim = sameModel.filter((e) => Number(e.cod[2]) === dDigit);
  let maxFin = 0;
  for (const e of sameDim) {
    const d = Number(e.cod[3]);
    if (d > maxFin) maxFin = d;
  }
  const fDigit = maxFin + 1;

  // overflow: una sola cifra per livello
  ([['modello', mDigit], ['dimensione', dDigit], ['finitura', fDigit]] as const).forEach(([livello, d]) => {
    if (d > 9) throw new Error(`Overflow codice: superato il 10° ${livello} per "${lettera}" (cifra=${d}). Schema a una cifra esaurito.`);
  });

  const cod = `${lettera}${mDigit}${dDigit}${fDigit}`;
  if (existing.some((e) => e.cod === cod)) throw new Error(`Codice generato già esistente: ${cod}`);
  return cod;
}

/**
 * Genera i codici per una lista di nuovi tier, ACCUMULANDO mano a mano (così tier
 * della stessa dimensione ottengono cifre finitura successive e una nuova
 * dimensione/modello mantiene la sua cifra tra i suoi tier). Ritorna i tier
 * arricchiti col `cod`.
 */
export function nextCodiciForTiers(tiers: TierSpec[], existing: BaseEntry[]): Array<TierSpec & { cod: string }> {
  const acc: BaseEntry[] = existing.map((e) => ({ cod: e.cod, modello: e.modello, dimensione: e.dimensione }));
  const out: Array<TierSpec & { cod: string }> = [];
  for (const t of tiers) {
    const cod = nextCodice(t.categoria, t.modello, t.dimensione, acc);
    acc.push({ cod, modello: t.modello, dimensione: t.dimensione });
    out.push({ ...t, cod });
  }
  return out;
}
