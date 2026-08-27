// src/composables/useNovita.ts
//
// Stato "già letto" delle novità. Vive in localStorage, quindi È PER POSTAZIONE:
// un cliente che apre POPS dall'ufficio e dal magazzino vede il contatore
// accendersi su entrambi i PC, ed è il comportamento richiesto — la novità la
// deve notare chi sta davanti allo schermo, non l'account.
//
// Conseguenze da conoscere (sono il prezzo della scelta, non bug):
//  • cambio PC o profilo browser → il contatore si riaccende;
//  • navigazione in incognito → sempre non letto;
//  • Safari cancella lo storage dopo ~7 giorni di inattività sul sito, e chi
//    svuota la cache riparte da zero;
//  • un PC condiviso da due account cliente ha UN solo stato di lettura (chiave
//    non legata all'uid: è la scelta esplicita "per PC e basta");
//  • non sapremo mai quanti clienti hanno letto una novità: niente traccia
//    lato server, per definizione.
//
// Nota: NON sostituisce il popup one-time di useAnnunci.ts, che resta per
// account su users/{uid}.annunciVisti. Sono due canali: il popup ferma il
// cliente una volta sola, il pannello resta consultabile.

import { computed, ref } from 'vue';
import {
  NOVITA, contaNonLette, idStorici, novitaVisibili, oggiISO,
  type Novita,
} from '../lib/novita';

/**
 * Chiave unica per browser. Volutamente senza uid: v. sopra.
 * Se un giorno servisse lo stato per account, la chiave diventa
 * `pops_novita_lette_<uid>` e questo file è l'unico posto da toccare.
 */
export const CHIAVE_NOVITA_LETTE = 'pops_novita_lette';

// Stato a livello di modulo: il pannello può essere montato più volte (o
// rimontato dal router) senza che il seeding iniziale venga rifatto.
const lette = ref<string[]>([]);
let inizializzato = false;

/**
 * Torna gli id letti, oppure `null` quando su questa postazione non c'è uno
 * stato utilizzabile: chiave assente, storage negato (Safari in lockdown, quota
 * piena) o contenuto illeggibile. Tutti e tre i casi si trattano allo stesso
 * modo — come un primo avvio — perché l'alternativa (elenco vuoto) accenderebbe
 * il contatore su tutto l'arretrato.
 */
function leggiStorage(): string[] | null {
  try {
    const raw = localStorage.getItem(CHIAVE_NOVITA_LETTE);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

function scriviStorage(ids: string[]): void {
  try {
    localStorage.setItem(CHIAVE_NOVITA_LETTE, JSON.stringify(ids));
  } catch {
    // Niente da fare: lo stato resta in memoria per questa sessione.
  }
}

/**
 * Primo avvio su questa postazione: diamo per lette le novità che hanno già
 * perso il badge NOVITÀ, così il contatore nasce spento sull'arretrato e si
 * accende solo su ciò che è davvero recente.
 *
 * Scriviamo la chiave anche quando l'elenco è vuoto: la sua ESISTENZA è il
 * segnale "questo PC è già stato inizializzato", altrimenti il seeding si
 * ripeterebbe a ogni caricamento.
 */
function inizializza(): void {
  if (inizializzato) return;
  inizializzato = true;

  const salvato = leggiStorage();
  if (salvato === null) {
    const storici = idStorici(NOVITA, oggiISO());
    lette.value = storici;
    scriviStorage(storici);
  } else {
    lette.value = salvato;
  }

  // Due schede aperte sullo stesso PC (caso normale: dashboard + preventivatore):
  // quello che leggi in una si spegne anche nell'altra.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== CHIAVE_NOVITA_LETTE) return;
      const aggiornate = leggiStorage();
      // Se l'altra scheda ha cancellato la chiave teniamo quello che sappiamo:
      // riaccendere il badge a metà sessione sarebbe solo confusione.
      if (aggiornate) lette.value = aggiornate;
    });
  }
}

export function useNovita() {
  inizializza();

  /** Ricalcolato a ogni uso: se la scheda resta aperta a cavallo di mezzanotte,
   *  "oggi" cambia e con esso i badge. */
  const elenco = computed<Novita[]>(() => novitaVisibili(NOVITA, oggiISO()));

  const nonLette = computed<number>(() => contaNonLette(NOVITA, lette.value, oggiISO()));

  const isLetta = (id: string): boolean => lette.value.includes(id);

  const segnaLetta = (id: string): void => {
    if (lette.value.includes(id)) return;
    const aggiornate = [...lette.value, id];
    lette.value = aggiornate;
    scriviStorage(aggiornate);
  };

  const segnaTutteLette = (): void => {
    const tutte = Array.from(new Set([...lette.value, ...elenco.value.map((n) => n.id)]));
    lette.value = tutte;
    scriviStorage(tutte);
  };

  return { elenco, nonLette, isLetta, segnaLetta, segnaTutteLette };
}
