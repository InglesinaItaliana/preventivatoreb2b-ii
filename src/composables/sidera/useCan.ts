import { computed } from 'vue'
import { useCurrentUser } from './useCurrentUser'
import { useCoreAdmins } from './useCoreAdmins'
import { capabilitiesFor, type Role, type Capabilities } from '../../router/permissions'

const SUPER_ADMIN = 'info@inglesinaitaliana.it'

/**
 * Gating UI centralizzato per ruolo (POLARIS Az.9). Sostituisce gli `isAdmin`
 * sparsi nei componenti con un'unica sorgente derivata da `ROLE_CAPABILITIES`.
 * Il super-admin `info@` può tutto. `isCoreAdmin` (accesso sezione CORE) resta
 * ESPOSTO A PARTE e ortogonale al ruolo (allowlist core/admins).
 */
export function useCan() {
  const { currentUser } = useCurrentUser()
  const { isCoreAdmin } = useCoreAdmins()

  const isSuperAdmin = computed(() => currentUser.value?.email === SUPER_ADMIN)
  const caps = computed(() => capabilitiesFor((currentUser.value?.role ?? '') as Role))

  function can(capability: keyof Capabilities): boolean {
    return isSuperAdmin.value || caps.value[capability]
  }

  return { can, caps, isSuperAdmin, isCoreAdmin }
}
