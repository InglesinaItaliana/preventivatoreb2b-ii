// src/lib/griglie/pianiTaglio.worker.ts
//
// Il piano di taglio fuori dalla pagina: su una commessa grossa la ricerca
// ottimizzata impiega secondi, e nel thread della pagina li passerebbe a pagina
// bloccata. Riceve le richieste (v. RichiestaPiano), risponde coi piani, nello
// stesso ordine. Nessuno stato fra un messaggio e l'altro.

import { calcolaRichiesta, type PianoTaglio, type RichiestaPiano } from '../../logic/griglie/nesting';

export interface DomandaPiani { id: number; richieste: RichiestaPiano[] }
export interface RispostaPiani { id: number; piani: [string, PianoTaglio][] }

const ambito = self as unknown as {
  onmessage: ((e: MessageEvent<DomandaPiani>) => void) | null;
  postMessage(r: RispostaPiani): void;
};

ambito.onmessage = (e) => {
  const { id, richieste } = e.data;
  ambito.postMessage({ id, piani: richieste.map((r) => [r.chiave, calcolaRichiesta(r)]) });
};
