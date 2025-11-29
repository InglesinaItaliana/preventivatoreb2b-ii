<template>
    <div class="p-6 bg-gray-50 min-h-screen text-slate-800 font-sans">
      <!-- Header Configurazione -->
      <div class="bg-white p-6 rounded-lg shadow-md mb-8 border-l-4 border-blue-600">
        <h1 class="text-2xl font-bold mb-4 text-gray-800 uppercase tracking-wide">Calcoli Lavorazioni Duplex/Inglesine</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cliente</label>
            <input v-model="settings.cliente" type="text" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Es. CRISTINELLI">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Commessa</label>
            <input v-model="settings.commessa" type="text" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Es. Z0015">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Profilo</label>
            <input v-model="settings.profilo" type="text" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Es. TG 9005 18">
          </div>
           <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Canalina</label>
            <input v-model="settings.canalina" type="text" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Es. TG 9005 18">
          </div>
        </div>
  
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Detrazione (mm)</label>
            <input v-model.number="settings.detrazione" type="number" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-yellow-50">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Dif. Detrazione (mm)</label>
            <input v-model.number="settings.difDetrazione" type="number" class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" placeholder="Es. 2">
            <p class="text-[10px] text-gray-400 mt-1">Extra tolleranza sottratta</p>
          </div>
          <div class="flex items-center mt-6">
            <input v-model="settings.isDuplex" type="checkbox" id="duplex" class="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
            <label for="duplex" class="ml-2 block text-sm text-gray-900 font-bold">Modalità DUPLEX (x2 lati)</label>
          </div>
        </div>
      </div>
  
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <!-- INPUT TABLE (A9:E9) -->
        <div class="lg:col-span-5 flex flex-col gap-4">
          <div class="bg-white p-4 rounded-lg shadow-md">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-bold text-gray-700">Misure Input</h2>
              <button @click="addRow" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm shadow flex items-center gap-1">
                <span class="text-lg font-bold">+</span> Riga
              </button>
            </div>
            
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-100 border-b-2 border-gray-200">
                  <tr>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold w-12">#</th>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold">nTEL</th>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold">B (Base)</th>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold">A (Altezza)</th>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold">nV</th>
                    <th class="px-2 py-2 text-center text-gray-600 font-bold">nO</th>
                    <th class="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(row, index) in rows" :key="index" class="hover:bg-gray-50">
                    <td class="px-2 py-1 text-center text-gray-400">{{ index + 1 }}</td>
                    <td class="px-1 py-1"><input v-model.number="row.nTel" type="number" class="w-full text-center border rounded p-1 focus:ring-1 focus:ring-blue-500"></td>
                    <td class="px-1 py-1"><input v-model.number="row.base" type="number" class="w-full text-center border rounded p-1 focus:ring-1 focus:ring-blue-500 font-medium"></td>
                    <td class="px-1 py-1"><input v-model.number="row.altezza" type="number" class="w-full text-center border rounded p-1 focus:ring-1 focus:ring-blue-500 font-medium"></td>
                    <td class="px-1 py-1"><input v-model.number="row.nV" type="number" class="w-full text-center border rounded p-1 bg-blue-50 focus:ring-1 focus:ring-blue-500"></td>
                    <td class="px-1 py-1"><input v-model.number="row.nO" type="number" class="w-full text-center border rounded p-1 bg-green-50 focus:ring-1 focus:ring-blue-500"></td>
                    <td class="px-1 py-1 text-center">
                      <button @click="removeRow(index)" class="text-red-400 hover:text-red-600" title="Rimuovi">×</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- Totali Input Rapidi -->
            <div class="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-500 bg-gray-50 p-2 rounded">
               <div>Totale Telai: <span class="font-bold text-gray-800">{{ totalTelai }}</span></div>
               <div>Totale Metri Quadri: <span class="font-bold text-gray-800">{{ totalMq.toFixed(2) }} mq</span></div>
            </div>
          </div>
        </div>
  
        <!-- OUTPUT / CALCOLI (AN8:BJ50 Style) -->
        <div class="lg:col-span-7 flex flex-col gap-6">
          
          <!-- Blocco Principale Output -->
          <div class="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
            <div class="bg-slate-800 text-white px-4 py-2 flex justify-between items-center">
              <h2 class="font-bold uppercase tracking-wider text-sm">Output Produzione (AN8:BJ50)</h2>
              <div class="text-xs text-slate-300">
                Detrazione effettiva: <span class="font-bold text-white">{{ effectiveDetrazione }} mm</span>
              </div>
            </div>
  
            <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <!-- Colonna: Analisi Verticali / Orizzontali -->
              <div>
                <h3 class="text-xs font-bold text-gray-500 border-b border-gray-300 pb-1 mb-2">DETTAGLIO CALCOLI</h3>
                
                <div v-if="computedRows.length === 0" class="text-gray-400 text-sm italic">Nessun dato inserito.</div>
  
                <div v-for="(row, idx) in computedRows" :key="idx" class="mb-4 text-sm border-b border-dashed border-gray-200 pb-2 last:border-0">
                  <div class="flex justify-between font-bold text-gray-700 mb-1">
                    <span>Telaio #{{ idx + 1 }}</span>
                    <span class="text-xs bg-gray-200 px-2 rounded">{{ row.nTel }} pz</span>
                  </div>
                  
                  <!-- Verticali -->
                  <div v-if="row.nV > 0" class="flex justify-between items-center pl-2 border-l-2 border-blue-400 mb-1 bg-blue-50 p-1 rounded-r">
                     <span class="text-gray-600">V ({{ row.altezza }}mm)</span>
                     <div class="flex gap-2">
                       <span class="font-mono bg-white px-1 border rounded">n: {{ row.qtyV }}</span>
                       <span class="font-bold text-blue-800">{{ row.dimV }} mm</span>
                     </div>
                  </div>
  
                  <!-- Orizzontali -->
                  <div v-if="row.nO > 0" class="flex justify-between items-center pl-2 border-l-2 border-green-400 bg-green-50 p-1 rounded-r">
                     <span class="text-gray-600">O ({{ row.base }}mm)</span>
                     <div class="flex gap-2">
                       <span class="font-mono bg-white px-1 border rounded">n: {{ row.qtyO }}</span>
                       <span class="font-bold text-green-800">{{ row.dimO }} mm</span>
                     </div>
                  </div>
                </div>
              </div>
  
              <!-- Colonna: Lista di Taglio Aggregata & Accessori -->
              <div>
                <h3 class="text-xs font-bold text-gray-500 border-b border-gray-300 pb-1 mb-2">LISTA DI TAGLIO</h3>
                
                <table class="w-full text-sm mb-6">
                  <thead class="bg-gray-100 text-xs uppercase text-gray-500">
                    <tr>
                      <th class="py-1 px-2 text-left">Q.tà</th>
                      <th class="py-1 px-2 text-left">Misura (mm)</th>
                      <th class="py-1 px-2 text-right">Tipo</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="(cut, i) in aggregatedCuts" :key="i" class="hover:bg-yellow-50 font-medium">
                      <td class="py-1 px-2 font-bold text-lg text-slate-800">{{ cut.qty }}</td>
                      <td class="py-1 px-2 text-slate-800">{{ cut.dim }}</td>
                      <td class="py-1 px-2 text-right">
                        <span :class="cut.type === 'V' ? 'text-blue-600 bg-blue-100' : 'text-green-600 bg-green-100'" class="px-1 rounded text-xs font-bold">
                          {{ cut.type === 'V' ? 'Verticale' : 'Orizzontale' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
  
                <!-- Accessori -->
                <h3 class="text-xs font-bold text-gray-500 border-b border-gray-300 pb-1 mb-2">ACCESSORI</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="bg-gray-100 p-3 rounded flex flex-col items-center justify-center">
                     <span class="text-xs text-gray-500 uppercase">Terminali</span>
                     <span class="text-2xl font-bold text-gray-800">{{ totalAccessories.terminali }}</span>
                  </div>
                  <div class="bg-gray-100 p-3 rounded flex flex-col items-center justify-center">
                     <span class="text-xs text-gray-500 uppercase">Croci</span>
                     <span class="text-2xl font-bold text-gray-800">{{ totalAccessories.croci }}</span>
                  </div>
                  <div class="bg-gray-100 p-3 rounded flex flex-col items-center justify-center col-span-2">
                     <span class="text-xs text-gray-500 uppercase">Metri Lineari Totali</span>
                     <span class="text-xl font-bold text-blue-600">{{ (totalAccessories.metriLineari / 1000).toFixed(2) }} m</span>
                  </div>
                </div>
  
              </div>
            </div>
            
            <!-- Footer Blocco Output -->
            <div class="bg-gray-50 px-4 py-2 border-t border-gray-200 text-xs flex justify-between">
              <span class="text-gray-500">Generato per: <strong>{{ settings.cliente }}</strong></span>
              <span class="text-gray-500">Commessa: <strong>{{ settings.commessa }}</strong></span>
            </div>
          </div>
  
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, reactive, computed } from 'vue';
  
  // --- Interfacce ---
  interface InputRow {
    nTel: number;
    base: number;
    altezza: number;
    nV: number;
    nO: number;
  }
  
  interface CutItem {
    dim: number;
    qty: number;
    type: 'V' | 'O';
  }
  
  // --- Stato ---
  const settings = reactive({
    cliente: 'CRISTINELLI',
    commessa: 'Z0015',
    profilo: 'TG 9005 18',
    canalina: 'TG 9005 18',
    detrazione: 24,
    difDetrazione: 2, // Correttivo (es. nel foglio era 24, ma risultato 26, quindi +2)
    isDuplex: true // Default a true per raddoppiare i pezzi
  });
  
  const rows = ref<InputRow[]>([
    { nTel: 1, base: 800, altezza: 1750, nV: 1, nO: 4 }, // Esempio Cristinelli
  ]);
  
  // --- Azioni Tabella ---
  const addRow = () => {
    rows.value.push({ nTel: 1, base: 0, altezza: 0, nV: 0, nO: 0 });
  };
  
  const removeRow = (index: number) => {
    if (rows.value.length > 1) {
      rows.value.splice(index, 1);
    }
  };
  
  // --- Logica di Calcolo ---
  
  const effectiveDetrazione = computed(() => {
    return settings.detrazione + settings.difDetrazione;
  });
  
  const totalTelai = computed(() => rows.value.reduce((acc, r) => acc + r.nTel, 0));
  
  const totalMq = computed(() => {
    return rows.value.reduce((acc, r) => {
      return acc + (r.nTel * (r.base * r.altezza) / 1000000);
    }, 0);
  });
  
  // 1. Calcolo Dettagliato per Riga (simile alle colonne nascoste o intermedie del foglio)
  const computedRows = computed(() => {
    return rows.value.map(row => {
      // Fattore moltiplicativo: Se Duplex (fronte+retro) = 2, altrimenti 1
      const multiplier = settings.isDuplex ? 2 : 1;
      
      // Calcolo Dimensioni
      const dimV = row.altezza - effectiveDetrazione.value;
      const dimO = row.base - effectiveDetrazione.value;
      
      // Calcolo Quantità per questa riga specifica
      const qtyV = row.nTel * row.nV * multiplier;
      const qtyO = row.nTel * row.nO * multiplier;
  
      return {
        ...row,
        dimV: dimV > 0 ? dimV : 0,
        dimO: dimO > 0 ? dimO : 0,
        qtyV,
        qtyO,
        multiplier
      };
    });
  });
  
  // 2. Aggregazione per Lista di Taglio (simile all'ordinamento del foglio)
  const aggregatedCuts = computed(() => {
    const cuts: CutItem[] = [];
  
    computedRows.value.forEach(row => {
      if (row.qtyV > 0) {
        cuts.push({ dim: row.dimV, qty: row.qtyV, type: 'V' });
      }
      if (row.qtyO > 0) {
        cuts.push({ dim: row.dimO, qty: row.qtyO, type: 'O' });
      }
    });
  
    // Raggruppa per dimensione e tipo
    const map = new Map<string, CutItem>();
    
    cuts.forEach(cut => {
      const key = `${cut.dim}-${cut.type}`;
      if (map.has(key)) {
        map.get(key)!.qty += cut.qty;
      } else {
        map.set(key, { ...cut });
      }
    });
  
    // Converte in array e ordina (decrescente per dimensione, come nel foglio)
    return Array.from(map.values()).sort((a, b) => b.dim - a.dim);
  });
  
  // 3. Calcolo Accessori
  const totalAccessories = computed(() => {
    let terminali = 0;
    let croci = 0;
    let metriLineari = 0;
  
    // I terminali nel foglio sembrano essere (nV + nO) * 2 lati * nTel * 2 estremità?
    // Nel foglio Cristinelli (1V, 4O, 1 Tel, Duplex): Terminali = 36.
    // Calcolo foglio: (1+4) * 2(duplex?) * 2(estremità) = 20? No.
    // Rivediamo la cella Excel: Spesso è calcolato sui pezzi totali tagliati.
    // Totale pezzi tagliati per Cristinelli: 2 Verticali + 4 Orizzontali (su lato singolo) -> se duplex -> 4 V + 8 O = 12 pezzi.
    // Ogni pezzo ha 2 terminali -> 24 terminali? Il foglio dice 36.
    // Potrebbe contare anche terminali sui telai esterni?
    
    // LOGICA SEMPLIFICATA STANDARD: 
    // Terminali = Numero totale di pezzi tagliati * 2.
    // Croci = nV * nO * nTel * (1 se semplice, 2 se duplex ma le croci interne sono singole di solito, dipende dal profilo).
    
    computedRows.value.forEach(row => {
      // Metri lineari
      metriLineari += (row.qtyV * row.dimV);
      metriLineari += (row.qtyO * row.dimO);
      
      // Croci (Incroci nV * nO)
      // Nota: Le croci sono accessori fisici all'intersezione.
      croci += (row.nV * row.nO * row.nTel);
  
      // Terminali
      // Assumiamo 2 terminali per ogni bacchetta tagliata
      terminali += (row.qtyV + row.qtyO) * 2;
    });
  
    return { terminali, croci, metriLineari };
  });
  
  </script>
  
  <style scoped>
  /* Aggiustamenti per input number hide arrows */
  input[type=number]::-webkit-inner-spin-button, 
  input[type=number]::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }
  </style>