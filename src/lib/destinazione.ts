// ============================================================================
// Destinazione merce (lato frontend) — luogo di consegna diverso dall'indirizzo
// del cliente.
// ----------------------------------------------------------------------------
// ⚠️ SPECCHIO di `src/functions/lib_billing/destinazione.ts`. Il frontend non
// può importare da src/functions (escluso da tsconfig.app.json: è un confine
// architetturale, non una dimenticanza), quindi le regole condivise vivono in
// due copie tenute allineate da un test anti-drift
// (src/lib/__tests__/destinazione.test.ts): se tocchi una regola qui, toccala lì.
//
// Cosa NON sta qui: `buildDestinationBlock`, cioè il payload per Reviso. Quello
// è affare del backend e nessuno lo deve poter costruire dal browser.
//
// Perché la chiave di raggruppamento sta anche lato client: la selezione degli
// ordini da spedire (AdminView) deve rifiutare un DDT con destinazioni diverse
// PRIMA di arrivare alla callable, altrimenti l'operatore scopre l'errore dopo
// aver già premuto il bottone.
// ============================================================================

/** Luogo di consegna alternativo, salvato sul preventivo e nella rubrica cliente. */
export interface DestinazioneMerce {
  /** Ragione sociale o nome di chi riceve (può non essere il cliente). */
  destinatario: string;
  indirizzo: string;
  cap: string;
  citta: string;
  /** Sigla provincia (IT). Opzionale: Reviso accetta un documento senza. */
  provincia?: string;
  /** Facoltativo: senza numero il corriere può non riuscire a consegnare. */
  telefono?: string;
  referente?: string;
  note?: string;
}

/** Voce della rubrica cliente (users/{uid}.destinazioni[]). */
export interface DestinazioneSalvata extends DestinazioneMerce {
  id: string;
  /** Nome che il cliente dà all'indirizzo ("Cantiere Via Roma"). */
  etichetta: string;
}

/**
 * Sigle provincia note a Reviso, in ordine alfabetico — è la tendina della
 * modale. Specchio delle chiavi di PROVINCE_CIC lato backend, dove ognuna ha
 * anche il numero che finisce sul documento.
 *
 * ⚠️ Include le 4 province ABOLITE nel 2016 (CI, VS, OG, OT) perché Reviso le
 * espone ancora, e NON include `SU`: per Reviso il Sud Sardegna è `SD`. La
 * normalizzazione traduce SU → SD, così chi arriva con la sigla ufficiale
 * (quella giusta nel mondo reale) non resta senza provincia sul DDT.
 */
export const SIGLE_PROVINCE: readonly string[] = Object.freeze([
  'AG', 'AL', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AT', 'AV', 'BA', 'BG', 'BI',
  'BL', 'BN', 'BO', 'BR', 'BS', 'BT', 'BZ', 'CA', 'CB', 'CE', 'CH', 'CI',
  'CL', 'CN', 'CO', 'CR', 'CS', 'CT', 'CZ', 'EN', 'FC', 'FE', 'FG', 'FI',
  'FM', 'FR', 'GE', 'GO', 'GR', 'IM', 'IS', 'KR', 'LC', 'LE', 'LI', 'LO',
  'LT', 'LU', 'MB', 'MC', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NA', 'NO',
  'NU', 'OG', 'OR', 'OT', 'PA', 'PC', 'PD', 'PE', 'PG', 'PI', 'PN', 'PO',
  'PR', 'PT', 'PU', 'PV', 'PZ', 'RA', 'RC', 'RE', 'RG', 'RI', 'RM', 'RN',
  'RO', 'SA', 'SD', 'SI', 'SO', 'SP', 'SR', 'SS', 'SV', 'TA', 'TE', 'TN',
  'TO', 'TP', 'TR', 'TS', 'TV', 'UD', 'VA', 'VB', 'VC', 'VE', 'VI', 'VR',
  'VS', 'VT', 'VV',
]);

/** Sigle reali che Reviso non conosce. Specchio di ALIAS_PROVINCE lato backend. */
const ALIAS_PROVINCE: Readonly<Record<string, string>> = Object.freeze({ SU: 'SD' });

/** Sigla canonica (quella che Reviso conosce), o undefined se non riconosciuta. */
export function normalizzaProvincia(v: unknown): string | undefined {
  const s = (v == null ? '' : String(v)).trim().toUpperCase();
  if (!s) return undefined;
  const canonica = ALIAS_PROVINCE[s] || s;
  return SIGLE_PROVINCE.includes(canonica) ? canonica : undefined;
}

const testo = (v: unknown): string => (v == null ? '' : String(v)).trim();

/**
 * Errori bloccanti di una destinazione. Array vuoto = si può salvare.
 * Il telefono NON è obbligatorio: senza numero il corriere può non consegnare,
 * ma è un rischio che sceglie il cliente.
 */
export function validaDestinazione(d: Partial<DestinazioneMerce> | null | undefined): string[] {
  const errori: string[] = [];
  if (!d) return ['Destinazione mancante'];
  if (!testo(d.destinatario)) errori.push('Manca il destinatario');
  if (!testo(d.indirizzo)) errori.push("Manca l'indirizzo");
  if (!/^\d{5}$/.test(testo(d.cap))) errori.push('Il CAP deve essere di 5 cifre');
  if (!testo(d.citta)) errori.push('Manca la città');
  if (testo(d.provincia) && !normalizzaProvincia(d.provincia)) {
    errori.push(`Provincia non riconosciuta: ${testo(d.provincia)}`);
  }
  return errori;
}

/**
 * Chiave di raggruppamento: due ordini con la STESSA chiave possono viaggiare
 * sullo stesso DDT, due chiavi diverse NO — un DDT ha un solo luogo di
 * destinazione, e ciò che finisce sul DDT è ciò che viene fatturato.
 * Consegna standard (nessuna destinazione) → stringa vuota.
 */
export function destinazioneKey(d: Partial<DestinazioneMerce> | null | undefined): string {
  if (!d) return '';
  const parti = [d.destinatario, d.indirizzo, d.cap, d.citta, normalizzaProvincia(d.provincia) || d.provincia]
    .map((p) => testo(p).toLowerCase().replace(/\s+/g, ' '));
  return parti.every((p) => !p) ? '' : parti.join('|');
}

/** True se l'ordine viaggia verso un luogo diverso dall'indirizzo del cliente. */
export function hasDestinazione(d: Partial<DestinazioneMerce> | null | undefined): boolean {
  return destinazioneKey(d) !== '';
}

/**
 * Due ordini vanno nello stesso posto → possono salire sullo stesso DDT.
 *
 * Esiste come funzione con un nome perché la selezione degli ordini da spedire
 * (AdminView) la usa in TRE punti — selezione automatica, aggiunta singola e
 * "dimming" delle card. Tre copie della stessa condizione sono tre occasioni
 * perché una resti indietro, e quella che resta indietro fa passare un DDT con
 * due destinazioni. Solo lato client: al server serve la validazione, non la
 * selezione (v. destinazioneComune).
 */
export function stessaDestinazione(
  a: Partial<DestinazioneMerce> | null | undefined,
  b: Partial<DestinazioneMerce> | null | undefined,
): boolean {
  return destinazioneKey(a) === destinazioneKey(b);
}

/** Indirizzo su una riga: badge, navigatore, tooltip. */
export function formatDestinazione(d: Partial<DestinazioneMerce> | null | undefined): string {
  if (!d) return '';
  const prov = normalizzaProvincia(d.provincia) || testo(d.provincia);
  const comune = [testo(d.cap), testo(d.citta)].filter(Boolean).join(' ');
  return [testo(d.indirizzo), comune, prov ? `(${prov})` : '']
    .filter(Boolean).join(', ')
    .replace(', (', ' (');
}

/** Esito del controllo "questi ordini possono stare sullo stesso DDT?". */
export type EsitoDestinazione =
  | { ok: true; destinazione?: DestinazioneMerce }
  | { ok: false; errore: string };

/**
 * Decide se un gruppo di ordini può viaggiare su un unico DDT e con quale
 * luogo di destinazione. Specchio della stessa funzione lato backend: qui serve
 * a non far nemmeno selezionare ordini incompatibili, là a rifiutarli comunque.
 */
export function destinazioneComune(
  destinazioni: ReadonlyArray<Partial<DestinazioneMerce> | null | undefined>,
): EsitoDestinazione {
  const chiavi = [...new Set(destinazioni.map((d) => destinazioneKey(d)))];
  if (chiavi.length > 1) {
    return {
      ok: false,
      errore: 'Gli ordini selezionati hanno luoghi di consegna diversi: serve un DDT per ciascuna destinazione.',
    };
  }
  const prima = destinazioni.find((d) => hasDestinazione(d));
  if (!prima) return { ok: true };
  const errori = validaDestinazione(prima);
  if (errori.length > 0) return { ok: false, errore: `Destinazione non valida: ${errori.join('; ')}` };
  return { ok: true, destinazione: prima as DestinazioneMerce };
}

/** Destinazione completa su più righe: riepiloghi e modali. */
export function righeDestinazione(d: Partial<DestinazioneMerce> | null | undefined): string[] {
  if (!hasDestinazione(d)) return [];
  const prov = normalizzaProvincia(d!.provincia) || testo(d!.provincia);
  return [
    testo(d!.destinatario),
    testo(d!.indirizzo),
    [testo(d!.cap), testo(d!.citta), prov ? `(${prov})` : ''].filter(Boolean).join(' '),
    [testo(d!.referente), testo(d!.telefono)].filter(Boolean).join(' · '),
  ].filter(Boolean);
}
