import { ref, onUnmounted } from 'vue'
import { collection, onSnapshot } from 'firebase/firestore'
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
}

const DEFAULT_CATEGORY = 'amministrazione'

/** Mappa un'email -> props per <StarAvatar>. Fallback per email esterne/sconosciute. */
export function starAvatarProps(
  email: string,
  members?: TeamMember[],
): { seed: string; category: string; hueIndex: number | undefined } {
  const m = members?.find(x => x.email === email)
  if (m) {
    return {
      seed: m.uid || m.email,                 // uid preferito; email come fallback stabile
      category: m.category || DEFAULT_CATEGORY,
      hueIndex: m.hueIndex,                    // undefined -> il motore deriva l'hue dal seed
    }
  }
  return { seed: email, category: DEFAULT_CATEGORY, hueIndex: undefined }
}

const AVATAR_COLORS = ['#2F6B4A', '#4A6B8A', '#C8821A', '#8A4A6B', '#6B4A8A', '#4A7A6B']

export function avatarColor(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

export function avatarInitial(email: string, members?: TeamMember[]): string {
  if (members) {
    const m = members.find(x => x.email === email)
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
  return (email.charAt(0) || '?').toUpperCase()
}

export function displayName(email: string, members: TeamMember[]): string {
  const m = members.find(m => m.email === email)
  if (m) {
    const full = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()
    if (full) return full
    if (m.name) return m.name
  }
  const local = email.split('@')[0] ?? email
  return local.split(/[._-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}

export function useTeamMembers() {
  const members = ref<TeamMember[]>([])
  const loading = ref(true)

  const unsubscribe = onSnapshot(collection(db, 'team'), (snap) => {
    members.value = snap.docs.map(d => {
      const data = d.data()
      return {
        email:     d.id,
        role:      data.role      ?? '',
        name:      data.name      ?? undefined,
        firstName: data.firstName ?? undefined,
        lastName:  data.lastName  ?? undefined,
        uid:       data.uid       ?? undefined,
        category:  data.category  ?? undefined,
        hueIndex:  typeof data.hueIndex === 'number' ? data.hueIndex : undefined,
      }
    })
    loading.value = false
  }, (err) => {
    console.error('[useTeamMembers]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  return { members, loading }
}
