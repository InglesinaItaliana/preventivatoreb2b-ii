export type Categoria = 'INGLESINA' | 'DUPLEX' | 'MUNTIN' | 'CANALINO' | 'EXTRA';
export type Modello = 'VARSAVIA' | 'GERMANELLA' | 'ALLUMINIO' | 'BORDO_CALDO' | 'MANUALE';

// STATI DEL LIFECYCLE (Single Entity)
export type StatoPreventivo = 
  | 'DRAFT'             // Bozza (Cliente)
  | 'PENDING_VAL'       // In attesa di validazione (Note o Curve)
  | 'QUOTE_READY'       // Preventivo Pronto/Validato (Prezzo visibile)
  | 'ORDER_REQ'         // Richiesta Ordine inviata
  | 'WAITING_SIGN'      // Attesa Firma (PDF inviato)
  | 'SIGNED'            // Firmato / Confermato
  | 'IN_PRODUZIONE'     // In Produzione
  | 'REJECTED';         // Rifiutato

export interface Allegato {
  nome: string;
  url: string;
  tipo: string; // 'pdf', 'img', 'cad', etc.
  dataCaricamento: any;
}

export interface RigaPreventivo {
  id: string;
  categoria: Categoria;
  modello: Modello;
  dimensione: string;
  finitura: string;
  base_mm: number;
  altezza_mm: number;
  righe: number;
  colonne: number;
  quantita: number;
  descrizioneCompleta: string;
  infoCanalino?: string;
  rawCanalino?: any;
  
  prezzo_unitario: number;
  prezzo_totale: number;
  
  nonEquidistanti?: boolean;
  curva: boolean;
  tacca: boolean;
}

// Struttura completa del documento su DB
export interface PreventivoDocumento {
  codice: string;
  cliente: string;
  commessa: string;
  
  elementi: RigaPreventivo[];
  
  // ECONOMICI
  totaleImponibile: number;
  scontoPercentuale: number; // Nuovo campo Admin
  totaleScontato: number;    // Totale finale
  
  // GESTIONALI
  stato: StatoPreventivo;
  noteCliente: string;       // Nuovo campo
  noteAdmin?: string;
  
  // FILE
  allegati: Allegato[];      // Nuovo array
  
  dataCreazione: any;
  dataScadenza: any;
}
export interface DatiLegali {
  accettazioneTermini: boolean;   // Checkbox 1
  accettazioneClausole: boolean;  // Checkbox 2
  ipCliente: string;
  userAgent: string;
  dataFirma: any; // Timestamp
  firmatarioEmail: string;
  firmatarioUid: string;
}

export interface PreventivoDocumento {
  // ... campi esistenti ...
  datiLegali?: DatiLegali; // <--- NUOVO CAMPO OPZIONALE
}