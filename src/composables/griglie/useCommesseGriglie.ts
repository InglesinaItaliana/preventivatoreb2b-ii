// src/composables/griglie/useCommesseGriglie.ts
//
// Le commesse di griglie, salvate SOLO in questo browser (localStorage): niente
// Firestore per scelta. Conseguenze da tenere a mente:
//   - una commessa creata su un PC non si vede da un altro PC o dal tablet;
//   - svuotando i dati del browser le commesse spariscono.
// Lo stato è uno solo per tutta l'app (modulo), e si riallinea se la stessa
// chiave cambia in un'altra scheda dello stesso browser.

import { ref } from 'vue';
import { prossimoCodiceCommessa, type CommessaGriglie } from '../../logic/griglie/commessa';

const CHIAVE = 'pops_griglie_commesse_v1';
// L'ultimo codice commessa emesso: resta anche se la commessa viene eliminata, così
// un codice magari già stampato non torna su un'altra commessa.
const CHIAVE_CODICE = 'pops_griglie_ultimo_codice_v1';

function leggi(): CommessaGriglie[] {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    const valore = grezzo ? JSON.parse(grezzo) : [];
    return Array.isArray(valore) ? valore : [];
  } catch {
    return [];   // storage bloccato o dato illeggibile: si parte vuoti invece di rompere la pagina
  }
}

const commesse = ref<CommessaGriglie[]>(leggi());
/** L'ultimo salvataggio è fallito (storage pieno o bloccato): la pagina lo deve dire. */
const erroreSalvataggio = ref(false);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CHIAVE) commesse.value = leggi();
  });
}

function scrivi(): boolean {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(commesse.value));
    erroreSalvataggio.value = false;
    return true;
  } catch {
    erroreSalvataggio.value = true;
    return false;
  }
}

export function nuovoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useCommesseGriglie() {
  /** Inserisce o sostituisce (per id). Restituisce false se il browser non ha salvato. */
  function salva(c: CommessaGriglie): boolean {
    const i = commesse.value.findIndex((x) => x.id === c.id);
    if (i >= 0) commesse.value.splice(i, 1, c);
    else commesse.value.unshift(c);
    return scrivi();
  }

  function elimina(id: string): boolean {
    commesse.value = commesse.value.filter((c) => c.id !== id);
    return scrivi();
  }

  const trova = (id: string | null) => (id ? commesse.value.find((c) => c.id === id) ?? null : null);

  /** Il codice della prossima commessa (GR-AA-NNN): mai uno già emesso da questo browser. */
  function nuovoCodice(anno: number): string {
    let ultimo = '';
    try { ultimo = localStorage.getItem(CHIAVE_CODICE) ?? ''; } catch { /* storage bloccato: si guarda solo alle commesse */ }
    const codice = prossimoCodiceCommessa([...commesse.value.map((c) => c.commessa), ultimo], anno);
    try { localStorage.setItem(CHIAVE_CODICE, codice); } catch { /* idem */ }
    return codice;
  }

  return { commesse, erroreSalvataggio, salva, elimina, trova, nuovoCodice };
}
