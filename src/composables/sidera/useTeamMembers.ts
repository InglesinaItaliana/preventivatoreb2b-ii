import { ref, onUnmounted } from 'vue'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'

export interface TeamMember {
  email: string
  role: string
  name?: string
  firstName?: string
  lastName?: string
}

const AVATAR_COLORS = ['#2F6B4A', '#4A6B8A', '#C8821A', '#8A4A6B', '#6B4A8A', '#4A7A6B']

export function avatarColor(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

export function avatarInitial(email: string, members?: TeamMember[]): string {
  if (members) {
    const m = members.find(x => x.email === email)
    if (m?.firstName) return m.firstName.charAt(0).toUpperCase()
    if (m?.name) return m.name.charAt(0).toUpperCase()
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
