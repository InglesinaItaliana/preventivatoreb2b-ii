import { computed, type Ref } from 'vue'
import { useTeamMembers, type TeamMember } from '../sidera/useTeamMembers'

/**
 * useUserMini — lookup membro team per email senza creare nuove subscription.
 *
 * Riusa `useTeamMembers()` (singleton de-facto: tutte le views che chiamano
 * questo composable condividono lo stesso subscribe). Filter computed sul
 * member matching l'email passata.
 *
 * Stati:
 *  - data: TeamMember | null
 *  - loading: true finché members ref non popolato (cold init)
 *  - notFound: true se members caricato ma email non in lista
 *
 * Usato da UserMentionNode.vue per chip live (nome/avatar/category).
 */

export interface UserMini {
  email: string
  displayName: string
  category: string
  hueIndex?: number
  active: boolean
}

export function useUserMini(email: Ref<string | null> | string) {
  const { members } = useTeamMembers()
  const emailRef = typeof email === 'string'
    ? computed(() => email)
    : email

  const loading = computed(() => members.value.length === 0)
  const data = computed<UserMini | null>(() => {
    if (!emailRef.value) return null
    const key = emailRef.value.toLowerCase().trim()
    const m = members.value.find((x: TeamMember) => (x.email ?? '').toLowerCase().trim() === key)
    if (!m) return null
    const fullName = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email
    return {
      email: m.email,
      displayName: fullName,
      category: m.category ?? 'amministrazione',
      hueIndex: typeof m.hueIndex === 'number' ? m.hueIndex : undefined,
      active: m.active !== false,
    }
  })
  const notFound = computed(() => !loading.value && !data.value && !!emailRef.value)

  return { data, loading, notFound }
}
