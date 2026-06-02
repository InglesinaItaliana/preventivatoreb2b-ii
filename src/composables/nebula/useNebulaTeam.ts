import { ref, onUnmounted } from 'vue'
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { isHiddenTeamEmail, dedupeTeamDocs } from '../sidera/useTeamMembers'
import type { Role } from '../../router/permissions'

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
}

// Categorie avatar (forma della stella). Allineate a CATEGORIES in src/lib/starAvatar.js.
export const CATEGORY_OPTIONS = [
  { key: 'direzione',       label: 'Direzione' },
  { key: 'amministrazione', label: 'Amministrazione' },
  { key: 'produzione',      label: 'Produzione' },
  { key: 'tecnico',         label: 'Tecnico' },
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
 * FUNZIONE → (role, category) di default per la creazione "funzione-first"
 * (POLARIS Az.9 / opzione B, vedi docs/STELLA-GRAFO.md). Si sceglie la funzione e
 * il software deriva ruolo-permessi + categoria-avatar; il `role` resta sempre
 * visibile e overridabile. NB:
 *  - Amministrativo/Contabile → role ADMIN (= "tutto l'admin tranne SIDERA CORE":
 *    il CORE è governato a parte da core/admins, NON dal role).
 *  - Operaio Specializzato → category `tecnico` (role resta PRODUZIONE).
 *  - `direzione` vs `amministrazione` = forme avatar distinte legittime (role≠category).
 */
export interface Funzione { position: string; role: Role; category: string }
export const FUNZIONI: Funzione[] = [
  { position: 'Titolare',                 role: 'ADMIN',       category: 'direzione' },
  { position: 'Socio',                    role: 'ADMIN',       category: 'direzione' },
  { position: 'Amministratore Delegato',  role: 'ADMIN',       category: 'direzione' },
  { position: 'Amministrativo',           role: 'ADMIN',       category: 'amministrazione' },
  { position: 'Contabile',                role: 'ADMIN',       category: 'amministrazione' },
  { position: 'Responsabile Commerciale', role: 'COMMERCIALE', category: 'commerciale' },
  { position: 'Agente Commerciale',       role: 'COMMERCIALE', category: 'commerciale' },
  { position: 'Responsabile Produzione',  role: 'PRODUZIONE',  category: 'produzione' },
  { position: 'Capo Officina',            role: 'PRODUZIONE',  category: 'produzione' },
  { position: 'Operaio Specializzato',    role: 'PRODUZIONE',  category: 'tecnico' },
  { position: 'Operaio',                  role: 'PRODUZIONE',  category: 'produzione' },
  { position: 'Responsabile Logistica',   role: 'LOGISTICA',   category: 'logistica' },
  { position: 'Magazziniere',             role: 'LOGISTICA',   category: 'logistica' },
  { position: 'Autista',                  role: 'LOGISTICA',   category: 'logistica' },
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
        category:  e.data.category  ?? undefined,
        hueIndex:  typeof e.data.hueIndex === 'number' ? e.data.hueIndex : undefined,
        docId:     e.id,
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
