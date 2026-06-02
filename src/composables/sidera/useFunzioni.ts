import { ref, computed, onUnmounted } from 'vue'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { FUNZIONI as DEFAULT_FUNZIONI } from '../nebula/useNebulaTeam'
import type { Role } from '../../router/permissions'

/**
 * Funzioni/mansioni gestibili (POLARIS Az.9 / opzione B): ogni etichetta-funzione
 * lega un nome (es. "Agente Commerciale") a una CATEGORIA-avatar (gruppo di 6) e a
 * un RUOLO-permessi. Persistite in Firestore `funzioni/{id}` per essere editabili
 * senza codice. Sorgente per il select "Funzione" nella creazione agente.
 */
export interface FunzioneDoc { id: string; label: string; category: string; role: Role; order: number }

/** Forma minima usata dal select creazione agente (collezione o default). */
export interface FunzioneOption { label: string; category: string; role: Role }

export function useFunzioni() {
  const funzioni = ref<FunzioneDoc[]>([])
  const loading = ref(true)

  const unsub = onSnapshot(
    query(collection(db, 'funzioni'), orderBy('order')),
    (snap) => {
      funzioni.value = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FunzioneDoc, 'id'>) }))
      loading.value = false
    },
    (err) => { console.error('[useFunzioni]', err); loading.value = false },
  )
  onUnmounted(unsub)

  // Lista effettiva per la creazione agente: la collezione se popolata, altrimenti
  // i default hardcoded (così la creazione funziona anche prima del seed).
  const effective = computed<FunzioneOption[]>(() =>
    funzioni.value.length
      ? funzioni.value.map(f => ({ label: f.label, category: f.category, role: f.role }))
      : DEFAULT_FUNZIONI.map(f => ({ label: f.position, category: f.category, role: f.role })),
  )

  const isSeeded = computed(() => funzioni.value.length > 0)

  async function addFunzione(f: FunzioneOption) {
    const order = funzioni.value.length ? Math.max(...funzioni.value.map(x => x.order ?? 0)) + 1 : 0
    await addDoc(collection(db, 'funzioni'), { ...f, order, createdAt: serverTimestamp() })
  }
  async function updateFunzione(id: string, patch: Partial<Omit<FunzioneDoc, 'id'>>) {
    await updateDoc(doc(db, 'funzioni', id), patch)
  }
  async function deleteFunzione(id: string) {
    await deleteDoc(doc(db, 'funzioni', id))
  }
  /** Popola la collezione con i default hardcoded (una tantum, se vuota). */
  async function seedDefaults() {
    const batch = writeBatch(db)
    DEFAULT_FUNZIONI.forEach((f, i) => {
      batch.set(doc(collection(db, 'funzioni')), {
        label: f.position, category: f.category, role: f.role, order: i, createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }

  return { funzioni, effective, isSeeded, loading, addFunzione, updateFunzione, deleteFunzione, seedDefaults }
}
