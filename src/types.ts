export type Categoria = 'INGLESINA' | 'DUPLEX' | 'MUNTIN' | 'CANALINO' | 'EXTRA';
export type Modello = 'VARSAVIA' | 'GERMANELLA' | 'ALLUMINIO' | 'BORDO_CALDO' | 'MANUALE';

// STATI DEL LIFECYCLE (Single Entity)
export type StatoPreventivo = 
  | 'DRAFT'             // Preventivo - Bozza
  | 'PENDING_VAL'       // Preventivo - In attesa di validazione (Tecnica)
  | 'QUOTE_READY'       // Preventivo - Pronto/Validato (Prezzo visibile)
  | 'ORDER_REQ'         // Ordine - Ordine Richiesto (Check Admin)
  | 'WAITING_FAST'      // Ordine - Attesa Accettazione Veloce (Checkbox) - RIMOSSO
  | 'WAITING_SIGN'      // Ordine - Attesa Firma (Upload)
  | 'SIGNED'            // Ordine - Firmato
  | 'IN_PRODUZIONE'     // Produzione - In Produzione
  | 'READY'             // Produzione - Ordine Pronto - NUOVO
  | 'DELIVERY'          // Spedizione - Spedizione programmata
  | 'DELIVERED'         // Consegna - Consegnato (Stato Finale)
  | 'REJECTED';         // Rifiutato

  // Aggiungi interfaccia per la Sessione di Consegna
export interface DeliverySession {
  id: string;
  driverUid: string;
  driverName: string;
  startTime: any; // Timestamp
  endTime: any | null; // Timestamp
  status: 'OPEN' | 'CLOSED';
  deliveredOrderIds: string[]; // Array di ID ordini consegnati in questo viaggio
}

export interface Allegato {
  nome: string;
  url: string;
  tipo: string; // 'pdf', 'img', 'cad', etc.
  dataCaricamento: any;
}

export interface RiepilogoRiga {
  descrizione: string;
  canalino: string;
  quantitaTotale: number;
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
  fuseruolo?: number | null;
  
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

  // Riepilogo
  sommarioPreventivo?: RiepilogoRiga[];
  
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

// --- CONFIGURAZIONE CONDIVISA COLORI E TESTI ---
export const STATUS_DETAILS: Record<StatoPreventivo, { label: string, badge: string, iconBg: string, darkBadge: string, hoverBadge:string }> = {
  'DRAFT': { 
    label: 'BOZZE', 
    badge: 'bg-gray-100 text-gray-500 border-gray-200', 
    iconBg: 'bg-gray-100 text-gray-500', 
    darkBadge: 'bg-gray-500 text-gray-100',
    hoverBadge: 'hover:bg-gray-200'
  },
  'PENDING_VAL': { 
    label: 'PREVENTIVI DA QUOTARE', 
    badge: 'bg-orange-100 text-orange-500 border-orange-200 hover:bg-orange-200', 
    iconBg: 'bg-orange-100 text-orange-500', 
    darkBadge: 'bg-orange-500 text-orange-100 hover:bg-orange-600',
    hoverBadge: 'hover:bg-orange-200'
  },
  'QUOTE_READY': { 
    label: 'PREVENTIVI QUOTATI', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'ORDER_REQ': { 
    label: 'ORDINI DA ACCETTARE', 
    badge: 'bg-cyan-100 text-cyan-500 border-cyan-200', 
    iconBg: 'bg-cyan-100 text-cyan-500', 
    darkBadge: 'bg-cyan-500 text-cyan-100',
    hoverBadge: 'hover:bg-cyan-200'
  },
  'WAITING_FAST': { 
    label: 'ORDINI IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'WAITING_SIGN': { 
    label: 'ORDINI IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'SIGNED': { 
    label: 'ORDINI DA METTERE IN PRODUZIONE', 
    badge: 'bg-amber-100 text-amber-800 border-amber-200', 
    iconBg: 'bg-amber-100 text-amber-800', 
    darkBadge: 'bg-amber-800 text-amber-100',
    hoverBadge: 'hover:bg-amber-200'
  },
  'IN_PRODUZIONE': { 
    label: 'ORDINI IN PRODUZIONE', 
    badge: 'bg-amber-100 text-amber-800 border-amber-200', 
    iconBg: 'bg-amber-100 text-amber-800', 
    darkBadge: 'bg-amber-800 text-amber-100',
    hoverBadge: 'hover:bg-amber-200'
  },
  'READY': { 
    label: 'ORDINI PRONTI', 
    badge: 'bg-emerald-100 text-emerald-600 border-emerald-200', 
    iconBg: 'bg-emerald-100 text-emerald-600', 
    darkBadge: 'bg-emerald-600 text-emerald-100',
    hoverBadge: 'hover:bg-emerald-200'
  },
  'DELIVERY': { 
    label: 'SPEDIZIONE PROGRAMMATA', 
    badge: 'bg-emerald-100 text-emerald-600 border-emerald-200', 
    iconBg: 'bg-emerald-100 text-emerald-600', 
    darkBadge: 'bg-emerald-600 text-emerald-100',
    hoverBadge: 'hover:bg-emerald-200'
  },
  'DELIVERED': { 
    label: 'CONSEGNATO', 
    badge: 'bg-green-100 text-green-800 border-green-200', 
    iconBg: 'bg-green-100 text-green-800', 
    darkBadge: 'bg-green-800 text-green-100',
    hoverBadge: 'hover:bg-green-200'
  },
  'REJECTED': { 
    label: 'ANNULLATI', 
    badge: 'bg-red-100 text-red-700 border-red-200', 
    iconBg: 'bg-red-100 text-red-600', 
    darkBadge: 'bg-red-700 text-white',
    hoverBadge: 'hover:bg-red-200'
  }
};