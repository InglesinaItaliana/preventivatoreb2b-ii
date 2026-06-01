<script setup lang="ts">
/**
 * CORE · Gestione team — la "porta d'ingresso" all'identità degli agenti
 * (accesso-e-gestione §1). SIDERA possiede l'identità; i moduli proiettano.
 * Gated isCoreAdmin. Crea / cambia ruolo / disabilita (soft) / cambia email.
 * Dati: /team uid-keyed (docs/STELLA-GRAFO.md). Tutti i membri, anche disabilitati.
 */
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { httpsCallable } from 'firebase/functions'
import { doc, updateDoc } from 'firebase/firestore'
import { db, auth, functions } from '../../firebase'
import MIcon from '../../components/shared/MIcon.vue'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useNebulaTeam } from '../../composables/nebula/useNebulaTeam'
import { displayName, starAvatarProps, type TeamMember } from '../../composables/sidera/useTeamMembers'

const router = useRouter()
const { isCoreAdmin, addAdmin, removeAdmin, initialized, SUPER_ADMIN } = useCoreAdmins()
const { currentUser } = useCurrentUser()
const { members, loading } = useNebulaTeam()   // carica TUTTI (no filtro active)

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),   // bootstrap
)

const ROLES = ['ADMIN', 'PRODUZIONE', 'LOGISTICA', 'COMMERCIALE'] as const
const roleLabel: Record<string, string> = {
  ADMIN: 'Admin', PRODUZIONE: 'Produzione', LOGISTICA: 'Logistica', COMMERCIALE: 'Commerciale',
}

// I membri come TeamMember-like per StarAvatar/displayName (richiede email + uid + category).
const teamLike = computed<TeamMember[]>(() =>
  members.value.map(m => ({
    email: m.email, role: m.role, firstName: m.firstName, lastName: m.lastName,
    uid: m.uid, category: m.category, hueIndex: m.hueIndex, docId: m.docId, active: m.active,
  })),
)

const busy = ref('')          // docId in lavorazione (disabilita pulsanti riga)
const errorMsg = ref('')
const okMsg = ref('')

function flash(msg: string) { okMsg.value = msg; setTimeout(() => { if (okMsg.value === msg) okMsg.value = '' }, 3000) }

// --- Cambio ruolo (+ refresh token §4) ---
async function changeRole(m: typeof members.value[number], role: string) {
  if (!m.docId || m.role === role) return
  busy.value = m.docId; errorMsg.value = ''
  try {
    await updateDoc(doc(db, 'team', m.docId), { role })
    // §4: se cambio il MIO ruolo, forzo il refresh del token; altrimenti l'utente
    // vedrà i nuovi permessi al suo prossimo login/refresh (non forzabile da qui).
    if (m.uid && m.uid === currentUser.value?.uid) {
      await auth.currentUser?.getIdToken(true)
      flash('Ruolo aggiornato. Token rinfrescato (il tuo).')
    } else {
      flash(`Ruolo aggiornato. ${displayName(m.email, teamLike.value)} vedrà i nuovi permessi al prossimo login.`)
    }
  } catch (e: any) {
    console.error('[CoreTeam] changeRole', e)
    errorMsg.value = e?.message || 'Errore nel cambio ruolo.'
  } finally {
    busy.value = ''
  }
}

// --- Soft-disable / enable ---
async function toggleActive(m: typeof members.value[number]) {
  if (!m.docId) return
  const next = !(m.active !== false)
  if (!next && !confirm(`Disabilitare ${displayName(m.email, teamLike.value)}? Sparirà dalle liste, lo storico resta.`)) return
  busy.value = m.docId; errorMsg.value = ''
  try {
    await updateDoc(doc(db, 'team', m.docId), { active: next })
    flash(next ? 'Membro riattivato.' : 'Membro disabilitato (soft).')
  } catch (e: any) {
    console.error('[CoreTeam] toggleActive', e)
    errorMsg.value = e?.message || 'Errore nel cambio stato.'
  } finally {
    busy.value = ''
  }
}

// --- Toggle Admin CORE (allowlist core/admins, accesso sezione CORE) ---
async function toggleCoreAdmin(m: typeof members.value[number]) {
  if (!m.email || m.email === SUPER_ADMIN) return
  busy.value = m.docId || m.email; errorMsg.value = ''
  const wasAdmin = isCoreAdmin(m.email)
  try {
    if (wasAdmin) await removeAdmin(m.email)
    else await addAdmin(m.email)
    flash(wasAdmin ? 'Rimosso dagli Admin CORE.' : 'Aggiunto agli Admin CORE.')
  } catch (e: any) {
    console.error('[CoreTeam] toggleCoreAdmin', e)
    errorMsg.value = e?.message || 'Errore Admin CORE.'
  } finally {
    busy.value = ''
  }
}

// --- Cambio email (CF: preserva UID) ---
async function changeEmail(m: typeof members.value[number]) {
  if (!m.uid) { errorMsg.value = 'Manca uid: doc non uid-keyed.'; return }
  const newEmail = prompt(`Nuova email per ${displayName(m.email, teamLike.value)} (attuale: ${m.email}):`, m.email)?.trim().toLowerCase()
  if (!newEmail || newEmail === m.email) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { errorMsg.value = 'Email non valida.'; return }
  busy.value = m.docId || m.uid; errorMsg.value = ''
  try {
    const fn = httpsCallable(functions, 'changeTeamMemberEmail')
    await fn({ uid: m.uid, newEmail })
    flash(`Email aggiornata a ${newEmail}. L'UID è preservato.`)
  } catch (e: any) {
    console.error('[CoreTeam] changeEmail', e)
    errorMsg.value = e?.message || 'Errore nel cambio email.'
  } finally {
    busy.value = ''
  }
}

// --- Creazione membro ---
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ firstName: '', lastName: '', email: '', password: '', role: 'PRODUZIONE', phone: '' })
function resetForm() { Object.assign(form, { firstName: '', lastName: '', email: '', password: '', role: 'PRODUZIONE', phone: '' }) }

async function createMember() {
  errorMsg.value = ''
  if (!form.firstName || !form.lastName || !form.email) { errorMsg.value = 'Nome, cognome ed email obbligatori.'; return }
  if (form.password.length < 6) { errorMsg.value = 'Password di almeno 6 caratteri.'; return }
  creating.value = true
  try {
    const fn = httpsCallable(functions, 'createTeamMember')
    await fn({ ...form, email: form.email.toLowerCase().trim() })
    flash(`Agente ${form.email} creato (uid-keyed).`)
    resetForm(); showCreate.value = false
  } catch (e: any) {
    console.error('[CoreTeam] createMember', e)
    errorMsg.value = e?.message || 'Errore nella creazione.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Gestione team</h2>
        <p class="m-sub">CORE · Identità agenti</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty"><p>Pagina riservata agli amministratori CORE.</p></div>

    <div v-else class="m-task">
      <div class="m-task-head">
        <div>
          <h3 class="m-task-title">Agenti</h3>
          <p class="m-task-desc">SIDERA possiede l'identità (uid). Crea, cambia ruolo, concedi accesso <strong>Admin CORE</strong> (scudo), disabilita (soft) o cambia email.</p>
        </div>
        <button class="m-btn" type="button" @click="showCreate = !showCreate">
          <MIcon name="add" :size="16" /> Nuovo agente
        </button>
      </div>

      <form v-if="showCreate" class="m-create" @submit.prevent="createMember">
        <div class="m-create-grid">
          <input v-model="form.firstName" class="m-input" placeholder="Nome" />
          <input v-model="form.lastName" class="m-input" placeholder="Cognome" />
          <input v-model="form.email" type="email" class="m-input" placeholder="email@dominio.it" autocomplete="off" />
          <input v-model="form.password" type="password" class="m-input" placeholder="Password (min 6)" autocomplete="new-password" />
          <input v-model="form.phone" class="m-input" placeholder="Telefono (opz.)" />
          <select v-model="form.role" class="m-input">
            <option v-for="r in ROLES" :key="r" :value="r">{{ roleLabel[r] }}</option>
          </select>
        </div>
        <button class="m-btn" type="submit" :disabled="creating">
          <MIcon name="person_add" :size="16" /> {{ creating ? 'Creazione…' : 'Crea agente' }}
        </button>
      </form>

      <div v-if="errorMsg" class="m-error">{{ errorMsg }}</div>
      <div v-if="okMsg" class="m-ok">{{ okMsg }}</div>

      <div v-if="loading" class="m-task-desc">Caricamento…</div>

      <ul v-else class="m-list">
        <li v-for="m in members" :key="m.docId || m.uid || m.email" class="m-row" :class="{ 'is-off': m.active === false }">
          <StarAvatar v-bind="starAvatarProps(m.email, teamLike)" :size="36" class="m-avatar" />
          <div class="m-row-text">
            <div class="m-row-name">
              {{ displayName(m.email, teamLike) }}
              <span v-if="isCoreAdmin(m.email)" class="m-badge m-badge--admin">admin CORE</span>
              <span v-if="m.active === false" class="m-badge m-badge--off">disabilitato</span>
            </div>
            <div class="m-row-email">{{ m.email }}</div>
          </div>

          <select
            class="m-role" :value="m.role" :disabled="busy === m.docId"
            @change="changeRole(m, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="r in ROLES" :key="r" :value="r">{{ roleLabel[r] }}</option>
          </select>

          <button
            class="m-icon-btn" :class="{ 'is-admin': isCoreAdmin(m.email) }"
            :title="isCoreAdmin(m.email) ? 'Togli accesso Admin CORE' : 'Rendi Admin CORE'"
            :disabled="busy === (m.docId || m.email)" @click="toggleCoreAdmin(m)"
          >
            <MIcon :name="isCoreAdmin(m.email) ? 'shield_person' : 'shield'" :size="18" />
          </button>

          <button class="m-icon-btn" title="Cambia email" :disabled="busy === m.docId" @click="changeEmail(m)">
            <MIcon name="alternate_email" :size="18" />
          </button>
          <button
            class="m-icon-btn" :title="m.active === false ? 'Riattiva' : 'Disabilita'"
            :disabled="busy === m.docId" @click="toggleActive(m)"
          >
            <MIcon :name="m.active === false ? 'person' : 'person_off'" :size="18" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.m-page {
  font-family: 'Outfit', sans-serif;
  background: var(--md-sys-color-surface, #FFF8F0);
  color: var(--md-sys-color-on-surface, #1A1917);
  min-height: 100vh; padding: 24px 32px;
}
.m-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.m-back {
  background: none; border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  width: 36px; height: 36px; border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer; font-size: 18px; color: inherit;
}
.m-back:hover { background: var(--md-sys-color-surface-container, #F5EDDF); }
.m-title { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
.m-sub { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 2px 0 0; }
.m-empty { background: var(--md-sys-color-surface-container, #F5EDDF); padding: 32px; border-radius: 14px; text-align: center; }

.m-task {
  background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  border-radius: 14px; padding: 24px; max-width: 720px;
}
.m-task-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.m-task-title { font-size: 16px; font-weight: 700; margin: 0 0 6px; }
.m-task-desc { font-size: 14px; line-height: 1.5; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 0; }

.m-btn {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  background: var(--md-sys-color-primary, #C4941C); color: var(--md-sys-color-on-primary, #FFFFFF);
  border: none; border-radius: 10px; padding: 9px 16px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s; font-family: inherit;
}
.m-btn:hover:not(:disabled) { background: var(--md-sys-color-primary-hover, #B0A580); }
.m-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.m-create { background: var(--md-sys-color-surface-container, #F5EDDF); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.m-create-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.m-input {
  min-width: 0; background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  border-radius: 10px; padding: 9px 12px; font-size: 14px; font-family: inherit;
  color: var(--md-sys-color-on-surface, #1A1917); outline: none;
}
.m-input:focus { border-color: var(--md-sys-color-primary, #C4941C); }

.m-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.m-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 12px;
  background: var(--md-sys-color-surface-container, #F5EDDF);
}
.m-row.is-off { opacity: 0.55; }
.m-avatar { flex: 0 0 auto; border-radius: 50%; }
.m-row-text { flex: 1; min-width: 0; }
.m-row-name { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
.m-row-email { font-size: 11px; color: var(--md-sys-color-on-surface-variant, #6A6560); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.m-role {
  flex: 0 0 auto; background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4); border-radius: 8px;
  padding: 6px 8px; font-size: 12px; font-family: inherit; color: inherit; cursor: pointer;
}
.m-icon-btn {
  flex: 0 0 auto; background: none; border: none; cursor: pointer; padding: 6px; border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface-variant, #6A6560); display: inline-flex; align-items: center;
}
.m-icon-btn:hover:not(:disabled) { background: var(--md-sys-color-surface-container-high, #EFE7DA); }
.m-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.m-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 7px; border-radius: var(--md-sys-shape-corner-full);
}
.m-badge--off { background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A); }
.m-badge--admin { background: color-mix(in srgb, var(--md-sys-color-primary, #C4941C) 18%, transparent); color: var(--md-sys-color-primary, #C4941C); }
.m-icon-btn.is-admin { color: var(--md-sys-color-primary, #C4941C); }

.m-error {
  margin: 12px 0 0; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A);
}
.m-ok {
  margin: 12px 0 0; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: color-mix(in srgb, #2F6B4A 14%, transparent); color: #2F6B4A;
}
</style>
