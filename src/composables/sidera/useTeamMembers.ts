import { ref, onUnmounted } from 'vue'
import { collection, doc, getDoc, getDocFromServer, onSnapshot, type DocumentData, type DocumentSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'

export interface TeamMember {
  email: string
  role: string
  name?: string
  firstName?: string
  lastName?: string
  uid?: string          // seed per StarAvatar
  category?: string     // forma della stella
  hueIndex?: number     // colore stabile dal registro
  docId?: string        // chiave reale del doc /team (email-keyed o uid-keyed) — per le scritture
  active?: boolean      // soft-disable (docs/STELLA-GRAFO.md)
}

/**
 * Entry normalizzata di un doc /team dopo la dedup di coesistenza.
 * `id` è la chiave reale del documento esistente (email-keyed o uid-keyed).
 */
export interface NormTeamDoc { id: string; email: string; uid?: string; isUidKeyed: boolean; data: DocumentData }

/**
 * Riduce i doc `/team` a UNO per persona (chiave = email lowercase), preferendo
 * il doc uid-keyed quando coesiste con quello email-keyed. Tollerante alla
 * finestra di coesistenza del re-key (vedi docs/STELLA-GRAFO.md): corretto in
 * tutti gli stati — solo-email (pre-backfill), coesistenza, solo-uid (post-cleanup).
 * `id` è la chiave del doc che ESISTE → usala per le scritture.
 */
export function dedupeTeamDocs(docs: Array<{ id: string; data(): DocumentData }>): NormTeamDoc[] {
  const byEmail = new Map<string, NormTeamDoc>()
  for (const d of docs) {
    const data = d.data()
    const isUidKeyed = !d.id.includes('@')
    const email = String(data.email ?? d.id).toLowerCase().trim()
    const uid = data.uid ?? (isUidKeyed ? d.id : undefined)
    const existing = byEmail.get(email)
    // Preferisci uid-keyed; a parità, mantieni il primo incontrato.
    if (!existing || (isUidKeyed && !existing.isUidKeyed)) {
      byEmail.set(email, { id: d.id, email, uid, isUidKeyed, data })
    }
  }
  return [...byEmail.values()]
}

const DEFAULT_CATEGORY = 'amministrazione'

/**
 * Legge il doc `/team` per UID (identità canonica, docs/STELLA-GRAFO.md).
 * Post re-key `/team` è interamente uid-keyed: nessun fallback necessario.
 */
export async function getTeamDoc(
  uid: string | null | undefined,
): Promise<DocumentSnapshot<DocumentData> | null> {
  if (!uid) return null
  const ref = doc(db, 'team', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap
  // Cache-hit negativo: con persistentLocalCache un not-found dalla cache locale
  // può essere stantio (POLARIS Az.9). Riconferma dal server prima di dichiarare
  // "non esiste" — evita lo staff bloccato con "Utenza non configurata".
  if (snap.metadata.fromCache) {
    try {
      const fresh = await getDocFromServer(ref)
      return fresh.exists() ? fresh : null
    } catch {
      return null   // offline reale → not-found come prima
    }
  }
  return null
}

/**
 * Account di sistema/tecnici da NON mostrare come persone selezionabili:
 * nuova conversazione chat (PULSAR), assegnatari azioni (CEPHEID), albero team (NEBULA).
 * Filtrati alla sorgente. La risoluzione nome/avatar di eventuale attività storica
 * usa comunque il fallback da email. (Richiesta 2026-05-22)
 */
export const HIDDEN_TEAM_EMAILS = new Set([
  'info@inglesinaitaliana.it',
  'lavorazioni.inglesinaitaliana@gmail.com',
])

/** True se l'email è un account di sistema da nascondere dalle liste di persone. */
export function isHiddenTeamEmail(email: string): boolean {
  return HIDDEN_TEAM_EMAILS.has((email ?? '').toLowerCase().trim())
}

/**
 * Risolve un membro per UID (preferito) o email. Dual-tolleranza della migrazione
 * `assignees` email→uid (STELLA-GRAFO): durante la coesistenza una voce può essere
 * un uid (nuovo) o un'email (legacy). Da semplificare ad A5 (solo uid).
 */
export function resolveMember(members: TeamMember[] | undefined, idOrEmail: string): TeamMember | undefined {
  if (!members || !idOrEmail) return undefined
  return members.find(x => x.uid === idOrEmail)
    ?? members.find(x => x.email === idOrEmail)
}

/** Mappa un uid/email -> props per <StarAvatar>. Fallback per voci esterne/sconosciute. */
export function starAvatarProps(
  idOrEmail: string,
  members?: TeamMember[],
): { seed: string; category: string; hueIndex: number | undefined } {
  const m = resolveMember(members, idOrEmail)
  if (m) {
    return {
      seed: m.uid || m.email,                 // uid preferito; email come fallback stabile
      category: m.category || DEFAULT_CATEGORY,
      hueIndex: m.hueIndex,                    // undefined -> il motore deriva l'hue dal seed
    }
  }
  return { seed: idOrEmail, category: DEFAULT_CATEGORY, hueIndex: undefined }
}

const AVATAR_COLORS = ['#2F6B4A', '#4A6B8A', '#C8821A', '#8A4A6B', '#6B4A8A', '#4A7A6B']

export function avatarColor(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

export function avatarInitial(idOrEmail: string, members?: TeamMember[]): string {
  if (members) {
    const m = resolveMember(members, idOrEmail)
    if (m?.firstName && m?.lastName) {
      return (m.firstName.charAt(0) + m.lastName.charAt(0)).toUpperCase()
    }
    if (m?.name) {
      const parts = m.name.trim().split(/\s+/)
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
      }
      return m.name.charAt(0).toUpperCase()
    }
    if (m?.firstName) return m.firstName.charAt(0).toUpperCase()
  }
  return (idOrEmail.charAt(0) || '?').toUpperCase()
}

export function displayName(idOrEmail: string, members: TeamMember[]): string {
  const m = resolveMember(members, idOrEmail)
  if (m) {
    const full = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()
    if (full) return full
    if (m.name) return m.name
  }
  // Fallback: se è un'email mostra il local-part "umanizzato"; se è un uid ignoto
  // (caso che non dovrebbe capitare per i membri noti) lo restituisce com'è.
  if (!idOrEmail.includes('@')) return idOrEmail
  const local = idOrEmail.split('@')[0] ?? idOrEmail
  return local.split(/[._-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}

export function useTeamMembers() {
  const members = ref<TeamMember[]>([])
  const loading = ref(true)

  const unsubscribe = onSnapshot(collection(db, 'team'), (snap) => {
    members.value = dedupeTeamDocs(snap.docs)
      .filter(e => !isHiddenTeamEmail(e.email))
      .filter(e => e.data.active !== false)   // soft-disable: i disabilitati spariscono dalle liste (docs/STELLA-GRAFO.md)
      .map(e => ({
        email:     e.email,
        role:      e.data.role      ?? '',
        name:      e.data.name      ?? undefined,
        firstName: e.data.firstName ?? undefined,
        lastName:  e.data.lastName  ?? undefined,
        uid:       e.uid,
        category:  e.data.category  ?? undefined,
        hueIndex:  typeof e.data.hueIndex === 'number' ? e.data.hueIndex : undefined,
        docId:     e.id,
        active:    e.data.active !== false,
      }))
    loading.value = false
  }, (err) => {
    console.error('[useTeamMembers]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  return { members, loading }
}
