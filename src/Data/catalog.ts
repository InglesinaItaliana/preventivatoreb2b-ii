import { defineStore } from 'pinia';
import Papa from 'papaparse';

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1843801803&single=true&output=csv';

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    listino: {} as any, // Serve per i menu a tendina (Gerarchico)
    codiciMap: {} as Record<string, number>, // <--- NUOVO: Indice veloce per Codice -> Prezzo
    loading: false,
    error: null as string | null,
    isLoaded: false
  }),

  actions: {
    async fetchCatalog() {
      if (this.isLoaded) return;
      
      this.loading = true;
      this.error = null;
      
      try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        if (!response.ok) throw new Error('Errore connessione Google Sheet');
        
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toUpperCase(), 
          complete: (results) => {
            const tree: { [key: string]: any } = {};
            const map: Record<string, number> = {}; // <--- Mappa temporanea

            results.data.forEach((row: any) => {
              // Lettura colonne
              const cat = (row.CATEGORIA || row.INGLESINE || '').trim().toUpperCase();
              const mod = (row.TIPO || row.MODELLO || '').trim().toUpperCase();
              const dim = (row.DIMENSIONE || 'STD').trim().toUpperCase();
              const fin = (row.FINITURA || 'STD').trim().toUpperCase();
              const tipoFin = (row.TIPO_FINITURA || 'Altro').trim();
              const cod = (row.CODICE || '').trim().toUpperCase(); // Forza maiuscolo S001
              
              // Pulizia Prezzo
              let rawPrice = row.PREZZO;
              if (typeof rawPrice === 'string') {
                  rawPrice = rawPrice.replace('€', '').replace(',', '.').trim();
              }
              const price = rawPrice ? parseFloat(rawPrice) : 0;

              // 1. POPOLIAMO L'ALBERO (Per i Menu)
              if (cat && mod && price !== null) {
                if (!tree[cat]) tree[cat] = {};
                if (!tree[cat][mod]) tree[cat][mod] = {};
                if (!tree[cat][mod][dim]) tree[cat][mod][dim] = {};
                tree[cat][mod][dim][fin] = { prezzo: price, cod: cod, group: tipoFin };
              }

              // 2. POPOLIAMO LA MAPPA CODICI (Per i Calcoli) <--- ECCO LA MAGIA
              // Se la riga ha un CODICE e un PREZZO, lo salviamo direttamente.
              if (cod && price !== null) {
                map[cod] = price;
              }
            });

            console.log("Mappa Codici caricata:", map); // Controlla in console se vedi S001: 5
            this.listino = tree;
            this.codiciMap = map; // Salviamo nello state
            this.isLoaded = true;
            this.loading = false;
          },
          error: (err: any) => {
            this.error = err.message;
            this.loading = false;
          }
        });
      } catch (e: any) {
        this.error = e.message;
        this.loading = false;
      }
    }
  }
});
