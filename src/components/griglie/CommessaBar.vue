<script setup lang="ts">
// La barra COMMESSA del configuratore griglie: più pannelli diversi (P1, P2, P3…)
// nello stesso ordine, salvati in questo browser.
//
// Il configuratore resta il posto in cui si disegna UN pannello: questa barra
// salva il pannello a video dentro la commessa, e ci ricarica quello scelto.
// In BOZZA tutto si modifica e i codici (P1…) seguono la posizione; IN PRODUZIONE la
// commessa è congelata (codici, misure e quote fotografate) finché non la si
// sblocca esplicitamente.
import { ref, computed, watch } from 'vue';
import {
  PlusIcon, DocumentDuplicateIcon, TrashIcon, LockOpenIcon,
  ArrowPathIcon, XMarkIcon, EyeIcon, PrinterIcon, ArrowDownTrayIcon, CogIcon,
} from '@heroicons/vue/24/solid';
import {
  codicePannello, nuovaCommessa, pannelliCalcolati, parametriDi, congela, sblocca, pesoInglesinaKgM, pianiCongelati,
  type CommessaGriglie, type InputPannello, type ParametriOfficina,
} from '../../logic/griglie/commessa';
import { useCommesseGriglie, nuovoId } from '../../composables/griglie/useCommesseGriglie';
import { creaSchedaProduzione, nomeScheda, richiestePiani } from '../../lib/griglie/schedaProduzionePdf';
import { usePianiTaglio } from '../../composables/griglie/usePianiTaglio';

const props = defineProps<{
  inputCorrente: InputPannello;
  parametri: ParametriOfficina;
}>();
const emit = defineEmits<{
  carica: [input: InputPannello];                  // porta nel configuratore il pannello scelto
  aperta: [commessa: CommessaGriglie | null];      // la commessa aperta (il piano del pannello a video legge le sue quote)
  pannello: [codice: string | null];               // il codice del pannello a video (P1…), se è della commessa
}>();

const { commesse, erroreSalvataggio, salva, elimina, trova, nuovoCodice } = useCommesseGriglie();

const idAperta = ref<string | null>(null);
const idPannello = ref<string | null>(null);   // il pannello che il configuratore sta mostrando
const aperta = computed(() => trova(idAperta.value));
watch(aperta, (c) => emit('aperta', c), { immediate: true });

const bloccata = computed(() => aperta.value?.stato === 'IN_PRODUZIONE');
const indiceAttivo = computed(() => aperta.value?.pannelli.findIndex((p) => p.id === idPannello.value) ?? -1);
const pannelloAttivo = computed(() => (indiceAttivo.value >= 0 ? aperta.value!.pannelli[indiceAttivo.value]! : null));
watch(indiceAttivo, (i) => emit('pannello', i >= 0 ? codicePannello(i) : null), { immediate: true });
/** Il configuratore mostra qualcosa di diverso dal pannello salvato. */
const modificato = computed(() =>
  !!pannelloAttivo.value && JSON.stringify(pannelloAttivo.value.input) !== JSON.stringify(props.inputCorrente));

const adesso = () => new Date().toISOString();
const dataBreve = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const elenco = computed(() => [...commesse.value].sort((a, b) => b.aggiornata.localeCompare(a.aggiornata)));

function aggiorna(modifica: (c: CommessaGriglie) => CommessaGriglie) {
  if (!aperta.value) return;
  salva({ ...modifica(JSON.parse(JSON.stringify(aperta.value))), aggiornata: adesso() });
}

/** Prima di lasciare il pannello a video: se ha modifiche non salvate, si chiede. */
function puoLasciare(): boolean {
  return !modificato.value || bloccata.value
    || window.confirm(`Il pannello ${codicePannello(indiceAttivo.value)} ha modifiche non salvate. Lasciarle?`);
}

// --- Commessa ---------------------------------------------------------------
function crea() {
  if (!puoLasciare()) return;
  const c = nuovaCommessa(nuovoId(), adesso(), nuovoCodice(new Date().getFullYear()));
  salva(c);
  idAperta.value = c.id;
  idPannello.value = null;
}

function apri(id: string) {
  if (!id || !puoLasciare()) return;
  idAperta.value = id;
  const primo = trova(id)?.pannelli[0];
  idPannello.value = primo?.id ?? null;
  if (primo) emit('carica', JSON.parse(JSON.stringify(primo.input)));
}

function chiudi() {
  if (!puoLasciare()) return;
  idAperta.value = null;
  idPannello.value = null;
}

function rinomina(campo: 'cliente', valore: string) {
  aggiorna((c) => ({ ...c, [campo]: valore }));
}

function eliminaCommessa() {
  const c = aperta.value;
  if (!c) return;
  const nome = c.commessa || 'senza nome';
  if (!window.confirm(`Eliminare la commessa "${nome}" con i suoi ${c.pannelli.length} pannelli? Non si può annullare.`)) return;
  elimina(c.id);
  idAperta.value = null;
  idPannello.value = null;
}

function mandaInProduzione() {
  const c = aperta.value;
  if (!c || !c.pannelli.length || !pianiPronti.value) return;
  if (modificato.value && !window.confirm(`Il pannello ${codicePannello(indiceAttivo.value)} ha modifiche non salvate, che NON entreranno in produzione. Continuare?`)) return;
  if (!window.confirm('Mandare la commessa in produzione? Codici, misure e quote si bloccano: per cambiarle andrà sbloccata.')) return;
  // Il piano calcolato in background è quello di questi pannelli con questi parametri: si fotografa
  salva(congela(c, props.parametri, adesso(), pianiPronti.value ? piani.value : undefined));
}

function sbloccaCommessa() {
  const c = aperta.value;
  if (!c) return;
  if (!window.confirm('Sbloccare la commessa? Torna in bozza: misure e quote si ricalcolano con i parametri di oggi e i codici dei pannelli possono cambiare. Se i pezzi sono già tagliati o marcati, il foglio stampato non corrisponderà più.')) return;
  salva(sblocca(c, adesso()));
}

// --- Pannelli ---------------------------------------------------------------
function scegliPannello(id: string) {
  if (id === idPannello.value || !puoLasciare()) return;
  const p = aperta.value?.pannelli.find((x) => x.id === id);
  if (!p) return;
  idPannello.value = id;
  emit('carica', JSON.parse(JSON.stringify(p.input)));
}

/** Salva il pannello a video come NUOVO pannello, in fondo alla lista. */
function aggiungi() {
  const id = nuovoId();
  aggiorna((c) => ({ ...c, pannelli: [...c.pannelli, { id, input: JSON.parse(JSON.stringify(props.inputCorrente)) }] }));
  idPannello.value = id;
}

/** Sovrascrive il pannello attivo con quello a video. */
function salvaModifiche() {
  const id = idPannello.value;
  if (!id) return;
  aggiorna((c) => ({ ...c, pannelli: c.pannelli.map((p) => (p.id === id ? { ...p, input: JSON.parse(JSON.stringify(props.inputCorrente)) } : p)) }));
}

/** Copia del pannello a video subito dopo l'attivo: comodo per le varianti. */
function duplica() {
  const id = nuovoId();
  const dopo = indiceAttivo.value;
  aggiorna((c) => {
    const pannelli = [...c.pannelli];
    pannelli.splice(dopo + 1, 0, { id, input: JSON.parse(JSON.stringify(props.inputCorrente)) });
    return { ...c, pannelli };
  });
  idPannello.value = id;
}

function eliminaPannello() {
  const i = indiceAttivo.value;
  if (i < 0) return;
  const seguenti = (aperta.value?.pannelli.length ?? 0) - i - 1;
  const avviso = seguenti > 0 ? ` I pannelli successivi cambiano codice.` : '';
  if (!window.confirm(`Eliminare il pannello ${codicePannello(i)}?${avviso}`)) return;
  const id = idPannello.value;
  aggiorna((c) => ({ ...c, pannelli: c.pannelli.filter((p) => p.id !== id) }));
  idPannello.value = null;
}

const riassunto = (input: InputPannello) => `${input.stile} · ${input.larghezzaCm}×${input.altezzaCm} cm · ×${input.quantita}`;

// --- PDF della commessa -----------------------------------------------------
// Il piano di taglio di TUTTA la commessa, calcolato in background mentre si
// lavora sui pannelli: il PDF lo prende già pronto e si attiva quando c'è.
const pannelliCommessa = computed(() => (aperta.value ? pannelliCalcolati(aperta.value, props.parametri) : []));
// In produzione vale il piano fotografato al congelamento: non si ricalcola.
const congelati = computed(() => (aperta.value ? pianiCongelati(aperta.value) : null));
const { piani: pianiCalcolati, pronto: calcolatiPronti } = usePianiTaglio(() => {
  const c = aperta.value;
  if (!c || !pannelliCommessa.value.length || congelati.value) return [];
  const parametri = parametriDi(c, props.parametri);
  return richiestePiani(pannelliCommessa.value, { kerf: parametri.kerf, intestatura: parametri.intestatura, steccaInglesina: parametri.steccaInglesina });
});

const piani = computed(() => congelati.value ?? pianiCalcolati.value);
const pianiPronti = computed(() => !!congelati.value || calcolatiPronti.value);

function apriPdf(per: 'schermo' | 'stampa' | 'scarica' = 'schermo') {
  const c = aperta.value;
  if (!c || !c.pannelli.length || !pianiPronti.value) return;
  const parametri = parametriDi(c, props.parametri);
  const opzioni = {
    commessa: c.commessa.trim(),
    cliente: c.cliente.trim(),
    data: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    kerf: parametri.kerf,
    intestatura: parametri.intestatura,
    steccaInglesina: parametri.steccaInglesina,
    pesoBarraKgM: parametri.pesoBarraKgM,
    pesoInglesinaKgM: pesoInglesinaKgM(parametri),
    congelataIl: c.stato === 'IN_PRODUZIONE' && c.congelata ? dataBreve(c.congelata.il) : undefined,
    piani: piani.value,   // già calcolati in background
  };
  const doc = creaSchedaProduzione(pannelliCommessa.value, opzioni, per === 'stampa' ? 'stampa' : 'schermo');
  doc.setProperties({ title: nomeScheda(opzioni) });
  // Aperto in una scheda il browser lo salverebbe con un nome a caso: «Scarica» gli dà il suo
  if (per === 'scarica') doc.save(`${nomeScheda(opzioni)}.pdf`);
  else window.open(doc.output('bloburl'), '_blank');
}
</script>

<template>
  <div class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80 mb-6">
    <!-- Intestazione come le altre card; a commessa aperta, a destra le sue azioni (solo icone) -->
    <div class="flex justify-between items-center gap-3 border-b pb-2 mb-4">
      <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Commessa</h2>
      <div v-if="aperta" class="flex flex-wrap items-center justify-end gap-2">
        <!-- Solo icone: il significato sta nel tooltip -->
        <button @click="apriPdf('schermo')" :disabled="!aperta.pannelli.length || !pianiPronti"
          :title="aperta.pannelli.length && !pianiPronti ? 'Calcolo del piano…' : 'Apri il PDF della commessa'"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <EyeIcon class="h-4 w-4" />
        </button>
        <button @click="apriPdf('stampa')" :disabled="!aperta.pannelli.length || !pianiPronti" title="Stampa: pagine A4, con la finestra di stampa"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <PrinterIcon class="h-4 w-4" />
        </button>
        <button @click="apriPdf('scarica')" :disabled="!aperta.pannelli.length || !pianiPronti" title="Scarica il PDF col codice della commessa"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <ArrowDownTrayIcon class="h-4 w-4" />
        </button>
        <button v-if="!bloccata" @click="mandaInProduzione" :disabled="!aperta.pannelli.length || !pianiPronti"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          title="Manda in produzione: blocca codici, misure e quote">
          <CogIcon class="h-4 w-4" />
        </button>
        <button v-else @click="sbloccaCommessa" title="Sblocca: la commessa torna in bozza"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <LockOpenIcon class="h-4 w-4" />
        </button>
        <button @click="eliminaCommessa" title="Elimina commessa"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <TrashIcon class="h-4 w-4" />
        </button>
        <button @click="chiudi" title="Chiudi commessa"
          class="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Nessuna commessa aperta -->
    <div v-if="!aperta" class="flex flex-wrap items-center gap-3">
      <select
        :value="''" @change="apri(($event.target as HTMLSelectElement).value)"
        :disabled="!elenco.length"
        class="flex-1 min-w-[12rem] max-w-md p-2 border border-gray-200 rounded-lg bg-white text-sm disabled:opacity-50"
      >
        <option value="" disabled>{{ elenco.length ? 'Apri una commessa…' : 'Nessuna commessa salvata' }}</option>
        <option v-for="c in elenco" :key="c.id" :value="c.id">
          {{ c.commessa || 'senza nome' }}{{ c.cliente ? ' · ' + c.cliente : '' }} · {{ c.pannelli.length }} pannelli{{ c.stato === 'IN_PRODUZIONE' ? ' · IN PRODUZIONE' : '' }}
        </option>
      </select>
      <button @click="crea"
        class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-amber-400 text-sm font-bold shadow-md hover:bg-gray-800 transition-colors">
        <PlusIcon class="h-4 w-4" /> Nuova commessa
      </button>
    </div>

    <!-- Commessa aperta -->
    <div v-else class="space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <!-- Il codice si assegna alla creazione e non si modifica -->
        <div class="shrink-0">
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Codice commessa</label>
          <p class="p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-bold font-mono tabular-nums text-gray-900">{{ aperta.commessa || '—' }}</p>
        </div>
        <div class="min-w-[9rem] flex-1 max-w-xs">
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cliente</label>
          <input :value="aperta.cliente" @change="rinomina('cliente', ($event.target as HTMLInputElement).value)"
            :disabled="bloccata" type="text"
            class="w-full p-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-amber-400 outline-none" />
        </div>
        <span
          class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase self-center"
          :class="bloccata ? 'bg-gray-900 text-amber-400' : 'bg-amber-100 text-amber-800'"
        >{{ bloccata ? `In produzione dal ${dataBreve(aperta.congelata!.il)}` : 'Bozza' }}</span>

      </div>

      <!-- I pannelli -->
      <div class="flex flex-wrap items-stretch gap-2">
        <button
          v-for="(p, i) in aperta.pannelli" :key="p.id"
          @click="scegliPannello(p.id)"
          class="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg border text-left transition-all"
          :class="p.id === idPannello ? 'border-amber-400 bg-amber-50 shadow' : 'border-gray-200 bg-white hover:border-amber-300'"
        >
          <span class="h-8 w-8 shrink-0 rounded-md flex items-center justify-center font-bold font-heading"
            :class="p.id === idPannello ? 'bg-amber-400 text-amber-950' : 'bg-gray-900 text-white'">{{ codicePannello(i) }}</span>
          <span class="min-w-0">
            <span class="block text-[11px] font-bold text-gray-800 leading-tight">{{ riassunto(p.input) }}</span>
            <span class="block text-[10px] text-gray-500 leading-tight">
              {{ p.input.finitura || p.input.tipoFinitura }}
              <span v-if="p.id === idPannello && modificato" class="text-amber-600 font-bold"> · modificato</span>
            </span>
          </span>
        </button>
        <p v-if="!aperta.pannelli.length" class="text-[11px] text-gray-500 italic self-center">
          Nessun pannello: imposta il pannello qui sotto e aggiungilo alla commessa.
        </p>
      </div>

      <!-- Azioni sul pannello a video -->
      <div v-if="!bloccata" class="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
        <button @click="aggiungi"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-amber-950 text-[12px] font-bold hover:bg-amber-300 transition-colors">
          <PlusIcon class="h-4 w-4" /> Aggiungi come pannello {{ codicePannello(aperta.pannelli.length) }}
        </button>
        <template v-if="pannelloAttivo">
          <button @click="salvaModifiche" :disabled="!modificato"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-[12px] font-bold hover:border-gray-500 transition-colors disabled:opacity-40">
            <ArrowPathIcon class="h-4 w-4" /> Salva modifiche al pannello {{ codicePannello(indiceAttivo) }}
          </button>
          <button @click="duplica"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-[12px] font-bold hover:border-gray-500 transition-colors">
            <DocumentDuplicateIcon class="h-4 w-4" /> Duplica
          </button>
          <button @click="eliminaPannello"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 text-[12px] font-bold hover:text-red-600 hover:border-red-300 transition-colors">
            <TrashIcon class="h-4 w-4" /> Elimina pannello {{ codicePannello(indiceAttivo) }}
          </button>
        </template>
      </div>
      <p v-else class="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
        Commessa in produzione: i pannelli si possono aprire e guardare, ma non modificare. Pagina e PDF
        usano quote e parametri congelati.
      </p>

      <p v-if="erroreSalvataggio" class="text-[11px] text-red-600 font-bold">
        Il browser non ha salvato l'ultima modifica (memoria piena o bloccata).
      </p>
    </div>
  </div>
</template>
