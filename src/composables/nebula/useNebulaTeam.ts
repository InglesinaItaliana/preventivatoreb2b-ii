import { ref, onUnmounted } from 'vue'
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { isHiddenTeamEmail, dedupeTeamDocs } from '../sidera/useTeamMembers'

export interface NebulaMember {
  email:      string
  firstName:  string
  lastName:   string
  role:       'ADMIN' | 'PRODUZIONE' | 'COMMERCIALE' | 'LOGISTICA' | string
  phone:      string
  active:     boolean
  color:      string
  position?:  string
  uid?:       string
  category?:  string
  hueIndex?:  number
  docId?:     string   // chiave reale del doc /team — per le scritture (re-key safe)
  managerUid?: string  // STELLA-GRAFO: da chi dipende (organigramma)
}

// Categorie avatar (forma della stella). Allineate a CATEGORIES in src/lib/starAvatar.js.
export const CATEGORY_OPTIONS = [
  { key: 'direzione',       label: 'Direzione' },
  { key: 'amministrazione', label: 'Amministrazione' },
  { key: 'produzione',      label: 'Produzione' },
  { key: 'logistica',       label: 'Logistica' },
  { key: 'commerciale',     label: 'Commerciale' },
] as const

export const POSITION_OPTIONS = [
  'Titolare',
  'Socio',
  'Amministratore Delegato',
  'Responsabile Commerciale',
  'Agente Commerciale',
  'Responsabile Produzione',
  'Capo Officina',
  'Operaio Specializzato',
  'Operaio',
  'Responsabile Logistica',
  'Magazziniere',
  'Autista',
  'Amministrativo',
  'Contabile',
]

/**
 * FUNZIONE → categoria di default per la creazione "funzione-first" (POLARIS Az.9 /
 * opzione B, vedi docs/STELLA-GRAFO.md). Si sceglie la funzione → categoria (avatar)
 * e il RUOLO-permessi si DERIVA dalla categoria (CATEGORY_TO_ROLE in permissions.ts):
 * una sola tassonomia gestita a mano. direzione/amministrazione → ADMIN, ma si
 * differenziano per avatar e accesso CORE (scudo, a parte). (`tecnico` rimosso.)
 */
export interface Funzione { position: string; category: string }
export const FUNZIONI: Funzione[] = [
  { position: 'Titolare',                 category: 'direzione' },
  { position: 'Socio',                    category: 'direzione' },
  { position: 'Amministratore Delegato',  category: 'direzione' },
  { position: 'Amministrativo',           category: 'amministrazione' },
  { position: 'Contabile',                category: 'amministrazione' },
  { position: 'Responsabile Commerciale', category: 'commerciale' },
  { position: 'Agente Commerciale',       category: 'commerciale' },
  { position: 'Responsabile Produzione',  category: 'produzione' },
  { position: 'Capo Officina',            category: 'produzione' },
  { position: 'Operaio Specializzato',    category: 'produzione' },
  { position: 'Operaio',                  category: 'produzione' },
  { position: 'Responsabile Logistica',   category: 'logistica' },
  { position: 'Magazziniere',             category: 'logistica' },
  { position: 'Autista',                  category: 'logistica' },
]

export function useNebulaTeam() {
  const members = ref<NebulaMember[]>([])
  const loading = ref(true)

  const unsubscribe = onSnapshot(collection(db, 'team'), (snap) => {
    members.value = dedupeTeamDocs(snap.docs)
      .filter(e => !isHiddenTeamEmail(e.email))
      .map(e => ({
        email:     e.email,
        firstName: e.data.firstName ?? '',
        lastName:  e.data.lastName  ?? '',
        role:      e.data.role      ?? '',
        phone:     e.data.phone     ?? '',
        active:    e.data.active    ?? true,
        color:     e.data.color     ?? '#2F6B4A',
        position:  e.data.position  ?? undefined,
        uid:       e.uid,
        category:   e.data.category  ?? undefined,
        hueIndex:   typeof e.data.hueIndex === 'number' ? e.data.hueIndex : undefined,
        docId:      e.id,
        managerUid: e.data.managerUid ?? undefined,
      }))
    loading.value = false
  }, (err) => {
    console.error('[useNebulaTeam]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  // Scrive sul doc che ESISTE (uid-keyed in coesistenza, altrimenti email-keyed):
  // risolve la chiave reale dalla lista già deduplicata. Re-key safe.
  function docIdFor(email: string): string {
    return members.value.find(m => m.email === email)?.docId || email
  }

  async function updatePosition(email: string, position: string) {
    await updateDoc(doc(db, 'team', docIdFor(email)), { position: position || null })
  }

  async function updateCategory(email: string, category: string) {
    await updateDoc(doc(db, 'team', docIdFor(email)), { category })
  }

  return { members, loading, updatePosition, updateCategory }
}
