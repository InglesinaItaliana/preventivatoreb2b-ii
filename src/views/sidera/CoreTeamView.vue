<script setup lang="ts">
/**
 * CORE · Gestione team — la "porta d'ingresso" all'identità degli agenti.
 * SIDERA possiede l'identità; i moduli proiettano. Gated isCoreAdmin.
 * Crea / ruolo / Admin CORE / disabilita (soft) / cambia email.
 * Dati: /team uid-keyed (docs/STELLA-GRAFO.md). Agenti + Account di sistema separati.
 */
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { httpsCallable } from 'firebase/functions'
import { sendPasswordResetEmail } from 'firebase/auth'
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore'
import { db, auth, functions } from '../../firebase'
import MIcon from '../../components/shared/MIcon.vue'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useFunzioni } from '../../composables/sidera/useFunzioni'
import { displayName, starAvatarProps, isHiddenTeamEmail, dedupeTeamDocs, type TeamMember } from '../../composables/sidera/useTeamMembers'

const router = useRouter()
const { isCoreAdmin, addAdmin, removeAdmin, initialized, SUPER_ADMIN } = useCoreAdmins()
const { currentUser } = useCurrentUser()

interface Member {
  email: string; firstName: string; lastName: string; role: string; position?: string
  active: boolean; uid?: string; category?: string; hueIndex?: number; docId: string
  managerUid?: string   // STELLA-GRAFO: da chi dipende (uid del responsabile)
}

// Carica TUTTI i doc /team (anche disabilitati e di sistema), deduplicati per uid.
const allMembers = ref<Member[]>([])
const loading = ref(true)
const unsub = onSnapshot(collection(db, 'team'), (snap) => {
  allMembers.value = dedupeTeamDocs(snap.docs).map(e => ({
    email:     e.email,
    firstName: e.data.firstName ?? '',
    lastName:  e.data.lastName  ?? '',
    role:      e.data.role      ?? '',
    position:  e.data.position  ?? undefined,
    active:    e.data.active !== false,
    uid:       e.uid,
    category:   e.data.category  ?? undefined,
    hueIndex:   typeof e.data.hueIndex === 'number' ? e.data.hueIndex : undefined,
    docId:      e.id,
    managerUid: e.data.managerUid ?? undefined,
  }))
  loading.value = false
}, (err) => { console.error('[CoreTeam]', err); loading.value = false })
onUnmounted(unsub)

// Agenti = persone reali. Account di sistema = HIDDEN_TEAM_EMAILS (info@, lavorazioni@):
// mostrati a parte, fuori dal concetto di "agente", sola lettura.
// Ordine dei gruppi-funzione (le 6 categorie avatar) per l'elenco agenti.
const CATEGORY_ORDER = ['direzione', 'amministrazione', 'produzione', 'tecnico', 'logistica', 'commerciale']
function catRank(c?: string): number {
  const i = CATEGORY_ORDER.indexOf(c ?? '')
  return i === -1 ? CATEGORY_ORDER.length : i
}
// Agenti ordinati per gruppo-funzione (categoria) poi alfabetico per nome.
const agents = computed(() =>
  allMembers.value
    .filter(m => !isHiddenTeamEmail(m.email))
    .slice()
    .sort((a, b) =>
      catRank(a.category) - catRank(b.category) ||
      displayName(a.email, teamLike.value).localeCompare(displayName(b.email, teamLike.value), 'it'),
    ),
)
const systemAccounts = computed(() => allMembers.value.filter(m => isHiddenTeamEmail(m.email)))

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),   // bootstrap
)

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin', PRODUZIONE: 'Produzione', LOGISTICA: 'Logistica', COMMERCIALE: 'Commerciale',
}
// Cosa comporta ciascun ruolo (permessi). Mostrato nel form per chi crea/modifica.
const roleDescriptions: Record<string, string> = {
  ADMIN:       'Accesso completo: progetti, tutte le task, smistamento. (SIDERA CORE si concede a parte con lo scudo.)',
  COMMERCIALE: 'PULSAR completo · CEPHEID ampio: crea/vede/modifica tutte le task + smistamento. Niente gestione progetti.',
  PRODUZIONE:  'PULSAR completo · CEPHEID: crea task, vede e completa solo le proprie assegnate. Niente smistamento.',
  LOGISTICA:   'PULSAR completo · CEPHEID: vede e completa solo le proprie task (sola lettura, niente creazione).',
}

// Per StarAvatar/displayName: tutti i membri (agenti + sistema).
const teamLike = computed<TeamMember[]>(() =>
  allMembers.value.map(m => ({
    email: m.email, role: m.role, firstName: m.firstName, lastName: m.lastName,
    uid: m.uid, category: m.category, hueIndex: m.hueIndex, docId: m.docId, active: m.active,
  })),
)

// Etichetta descrittiva per gli account di sistema.
function systemLabel(email: string): string {
  if (email === SUPER_ADMIN) return 'super-admin · intoccabile'
  return 'uso interno'
}

const busy = ref('')          // docId in lavorazione (disabilita pulsanti riga)
const errorMsg = ref('')
const okMsg = ref('')

function flash(msg: string) { okMsg.value = msg; setTimeout(() => { if (okMsg.value === msg) okMsg.value = '' }, 3000) }

// --- Cambio funzione dell'agente (deriva categoria-avatar + ruolo-permessi) ---
// Handler del select riga: conferma e ripristina la selezione se annulli.
async function onFunzioneChange(m: Member, e: Event) {
  const sel = e.target as HTMLSelectElement
  const newLabel = sel.value
  if (newLabel === (m.position ?? '')) return
  const f = funzioniOptions.value.find(x => x.label === newLabel)
  if (!f) { sel.value = m.position ?? ''; return }
  if (!confirm(
    `Cambiare la funzione di ${displayName(m.email, teamLike.value)} in "${newLabel}"?\n\n`
    + `Ruolo-permessi: ${roleLabel[f.role] ?? f.role}. Categoria/avatar: ${f.category}.`
  )) {
    sel.value = m.position ?? ''   // ripristina
    return
  }
  if (!m.docId) return
  busy.value = m.docId; errorMsg.value = ''
  try {
    // Funzione → position + categoria-avatar + ruolo-permessi (derivato).
    await updateDoc(doc(db, 'team', m.docId), { position: newLabel, category: f.category, role: f.role })
    // §4: se cambio la MIA funzione, forzo il refresh del token; altrimenti l'utente
    // vedrà i nuovi permessi al prossimo login (non forzabile da qui).
    if (m.uid && m.uid === currentUser.value?.uid) {
      await auth.currentUser?.getIdToken(true)
      flash('Funzione aggiornata. Token rinfrescato (il tuo).')
    } else {
      flash(`Funzione aggiornata. ${displayName(m.email, teamLike.value)} vedrà i nuovi permessi al prossimo login.`)
    }
  } catch (err: any) {
    console.error('[CoreTeam] changeFunzione', err)
    errorMsg.value = err?.message || 'Errore nel cambio funzione.'
  } finally {
    busy.value = ''
  }
}

// --- Responsabile (STELLA-GRAFO: managerUid) ---
// Opzioni = altri agenti con uid (escluso sé stesso, niente auto-riferimento).
function managerOptions(m: Member): Member[] {
  return agents.value.filter(a => a.uid && a.uid !== m.uid)
}
async function onManagerChange(m: Member, e: Event) {
  const sel = e.target as HTMLSelectElement
  const newMgr = sel.value || ''
  if (newMgr === (m.managerUid ?? '')) return
  if (newMgr && newMgr === m.uid) { sel.value = m.managerUid ?? ''; return }   // mai sé stesso
  if (!m.docId) return
  busy.value = m.docId; errorMsg.value = ''
  try {
    await updateDoc(doc(db, 'team', m.docId), { managerUid: newMgr || null })
    flash('Responsabile aggiornato.')
  } catch (err: any) {
    console.error('[CoreTeam] managerChange', err)
    errorMsg.value = err?.message || 'Errore nel cambio responsabile.'
    sel.value = m.managerUid ?? ''
  } finally {
    busy.value = ''
  }
}

// --- Soft-disable / enable ---
async function toggleActive(m: Member) {
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
async function toggleCoreAdmin(m: Member) {
  if (!m.email || m.email === SUPER_ADMIN) return
  const wasAdmin = isCoreAdmin(m.email)
  // Conferma esplicita quando si CONCEDE (azione sensibile: accesso a manutenzione,
  // gestione team, integrazioni).
  if (!wasAdmin && !confirm(
    `Concedere a ${displayName(m.email, teamLike.value)} l'accesso Admin CORE?\n\n`
    + 'Potrà entrare in Manutenzione, Gestione team e Integrazioni.'
  )) return
  busy.value = m.docId || m.email; errorMsg.value = ''
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

// --- Reset password: invia all'agente l'email per reimpostarla ---
// (Firebase gestisce il link sicuro; l'agente può anche usare "Password
// dimenticata?" dalla schermata di login.)
async function resetPassword(m: Member) {
  if (!confirm(`Inviare a ${m.email} un'email per reimpostare la password?`)) return
  busy.value = m.docId || m.email; errorMsg.value = ''
  try {
    await sendPasswordResetEmail(auth, m.email)
    flash(`Email di reset password inviata a ${m.email}.`)
  } catch (e: any) {
    console.error('[CoreTeam] resetPassword', e)
    errorMsg.value = e?.message || 'Errore invio reset password.'
  } finally {
    busy.value = ''
  }
}

// --- Cambio email (CF: preserva UID) ---
async function changeEmail(m: Member) {
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
const form = reactive({ firstName: '', lastName: '', email: '', password: '', role: '', phone: '', position: '', category: '', managerUid: '' })
function resetForm() { Object.assign(form, { firstName: '', lastName: '', email: '', password: '', role: '', phone: '', position: '', category: '', managerUid: '' }) }

// Possibili responsabili = tutti gli agenti con uid (per il form di creazione).
const allManagers = computed(() => agents.value.filter(a => a.uid))

// Elenco funzioni gestibili (collezione Firestore, fallback ai default).
const { effective: funzioniOptions } = useFunzioni()

// Funzione-first: la funzione (= label) determina role + category-avatar.
// Il ruolo-permessi è in sola lettura qui; si aggiusta semmai dopo, dalla lista.
function onFunzione() {
  const f = funzioniOptions.value.find(x => x.label === form.position)
  if (f) { form.role = f.role; form.category = f.category }
  else { form.role = ''; form.category = '' }
}

async function createMember() {
  errorMsg.value = ''
  if (!form.position || !form.role) { errorMsg.value = 'Scegli una funzione.'; return }
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
          <p class="m-task-desc">Crea, cambia ruolo, concedi accesso <strong>Admin CORE</strong>, disabilita agente o cambia email.</p>
        </div>
        <button class="m-btn" type="button" @click="showCreate = !showCreate">
          <MIcon name="add" :size="16" /> Nuovo agente
        </button>
      </div>

      <form v-if="showCreate" class="m-create" @submit.prevent="createMember">
        <select v-model="form.position" @change="onFunzione" class="m-input m-input--full">
          <option value="">Funzione… (determina ruolo e avatar)</option>
          <option v-for="f in funzioniOptions" :key="f.label" :value="f.label">{{ f.label }}</option>
        </select>
        <div class="m-create-grid">
          <input v-model="form.firstName" class="m-input" placeholder="Nome" />
          <input v-model="form.lastName" class="m-input" placeholder="Cognome" />
          <input v-model="form.email" type="email" class="m-input" placeholder="email@dominio.it" autocomplete="off" />
          <input v-model="form.password" type="password" class="m-input" placeholder="Password (min 6)" autocomplete="new-password" />
          <input v-model="form.phone" class="m-input m-input--full" placeholder="Telefono (opz.)" />
        </div>
        <select v-model="form.managerUid" class="m-input m-input--full">
          <option value="">Responsabile… (opzionale)</option>
          <option v-for="a in allManagers" :key="a.uid" :value="a.uid">{{ displayName(a.email, teamLike) }}</option>
        </select>
        <p v-if="form.role" class="m-role-desc">
          <strong>Ruolo: {{ roleLabel[form.role] }}</strong> — {{ roleDescriptions[form.role] }}
        </p>
        <p class="m-create-hint">Il <strong>ruolo-permessi</strong> è determinato dalla funzione. Lo puoi aggiustare dopo, dalla lista. L'accesso <strong>Admin CORE</strong> si concede separatamente (scudo).</p>
        <button class="m-btn" type="submit" :disabled="creating">
          <MIcon name="person_add" :size="16" /> {{ creating ? 'Creazione…' : 'Crea agente' }}
        </button>
      </form>

      <div v-if="errorMsg" class="m-error">{{ errorMsg }}</div>
      <div v-if="okMsg" class="m-ok">{{ okMsg }}</div>

      <div v-if="loading" class="m-task-desc">Caricamento…</div>

      <ul v-else class="m-list">
        <li v-for="m in agents" :key="m.docId || m.uid || m.email" class="m-row" :class="{ 'is-off': m.active === false }">
          <StarAvatar v-bind="starAvatarProps(m.email, teamLike)" :size="36" class="m-avatar" />
          <div class="m-row-text">
            <div class="m-row-name">
              {{ displayName(m.email, teamLike) }}
              <span v-if="isCoreAdmin(m.email)" class="m-badge m-badge--admin">admin CORE</span>
              <span v-if="m.active === false" class="m-badge m-badge--off">disabilitato</span>
            </div>
            <div class="m-row-email">{{ m.email }}</div>
            <div class="m-row-mgr">
              <MIcon name="account_tree" :size="13" class="m-row-mgr-icon" />
              <select class="m-mgr" :value="m.managerUid ?? ''" :disabled="busy === m.docId" title="Responsabile (da chi dipende)" @change="onManagerChange(m, $event)">
                <option value="">— nessun responsabile (vertice) —</option>
                <option v-for="a in managerOptions(m)" :key="a.uid" :value="a.uid">{{ displayName(a.email, teamLike) }}</option>
              </select>
            </div>
          </div>

          <select
            class="m-funz" :value="m.position ?? ''" :disabled="busy === m.docId"
            title="Funzione (determina avatar e ruolo-permessi)"
            @change="onFunzioneChange(m, $event)"
          >
            <option value="" disabled>— funzione —</option>
            <option v-if="m.position && !funzioniOptions.some(f => f.label === m.position)" :value="m.position">{{ m.position }} (fuori lista)</option>
            <option v-for="f in funzioniOptions" :key="f.label" :value="f.label">{{ f.label }}</option>
          </select>
          <span class="m-role-chip" :title="roleDescriptions[m.role]">{{ roleLabel[m.role] || m.role || '—' }}</span>

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
          <button class="m-icon-btn" title="Invia reset password" :disabled="busy === (m.docId || m.email)" @click="resetPassword(m)">
            <MIcon name="lock_reset" :size="18" />
          </button>
          <button
            class="m-icon-btn" :title="m.active === false ? 'Riattiva' : 'Disabilita'"
            :disabled="busy === m.docId" @click="toggleActive(m)"
          >
            <MIcon :name="m.active === false ? 'person' : 'person_off'" :size="18" />
          </button>
        </li>
      </ul>

      <!-- Account di sistema: NON agenti (info@ super-admin, lavorazioni@ uso interno). Sola lettura. -->
      <div v-if="!loading && systemAccounts.length" class="m-sys">
        <h3 class="m-task-title m-sys-title">
          <MIcon name="settings_account_box" :size="16" /> Account di sistema
        </h3>
        <p class="m-task-desc">Non sono agenti: esclusi dalle liste selezionabili e dalla gestione. Mostrati per trasparenza.</p>
        <ul class="m-list">
          <li v-for="s in systemAccounts" :key="s.docId || s.email" class="m-row m-row--sys">
            <StarAvatar v-bind="starAvatarProps(s.email, teamLike)" :size="36" class="m-avatar" />
            <div class="m-row-text">
              <div class="m-row-name">
                {{ displayName(s.email, teamLike) }}
                <span class="m-badge" :class="s.email === SUPER_ADMIN ? 'm-badge--super' : 'm-badge--sys'">{{ systemLabel(s.email) }}</span>
              </div>
              <div class="m-row-email">{{ s.email }}</div>
            </div>
            <MIcon :name="s.email === SUPER_ADMIN ? 'lock' : 'smart_toy'" :size="18" class="m-sys-lock" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-page {
  font-family: 'Outfit', sans-serif;
  background: var(--md-sys-color-surface, #FFF8F0);
  color: var(--md-sys-color-on-surface, #1A1917);
  /* La shell SIDERA (.s-main) ha overflow:hidden → lo scroll vive sul root della view */
  height: 100%; min-height: 0; overflow-y: auto;
  padding: 24px 32px; padding-bottom: calc(24px + env(safe-area-inset-bottom));
  box-sizing: border-box;
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
.m-input--full { width: 100%; margin-bottom: 8px; }
.m-role-desc {
  font-size: 12px; line-height: 1.5; margin: 0 0 8px; padding: 8px 12px; border-radius: 8px;
  background: color-mix(in srgb, var(--md-sys-color-primary, #C4941C) 10%, transparent);
  color: var(--md-sys-color-on-surface, #1A1917);
}
.m-create-hint { font-size: 12px; line-height: 1.5; color: var(--md-sys-color-on-surface-variant, #6A6560); margin: 0 0 12px; }
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
.m-row-mgr { display: flex; align-items: center; gap: 4px; margin-top: 3px; }
.m-row-mgr-icon { color: var(--md-sys-color-on-surface-variant, #6A6560); flex: 0 0 auto; }
.m-mgr {
  max-width: 100%; background: transparent; border: none; cursor: pointer;
  font-size: 11px; font-family: inherit; color: var(--md-sys-color-on-surface-variant, #6A6560);
  padding: 1px 2px; border-radius: 4px; outline: none;
}
.m-mgr:hover:not(:disabled) { background: var(--md-sys-color-surface-container-high, #EFE7DA); }

.m-funz {
  flex: 0 0 auto; background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4); border-radius: 8px;
  padding: 6px 8px; font-size: 12px; font-family: inherit; color: inherit; cursor: pointer;
  text-align-last: center; min-width: 150px; max-width: 180px;
}
.m-role-chip {
  flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
  padding: 3px 8px; border-radius: var(--md-sys-shape-corner-full); min-width: 78px; text-align: center;
  background: color-mix(in srgb, var(--md-sys-color-primary, #C4941C) 14%, transparent);
  color: var(--md-sys-color-primary, #C4941C);
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

.m-sys { margin-top: 20px; padding-top: 16px; border-top: 1px dashed var(--md-sys-color-outline-variant, #CEC6B4); }
.m-sys-title { display: flex; align-items: center; gap: 6px; }
.m-row--sys { opacity: 0.85; }
.m-sys-lock { flex: 0 0 auto; color: var(--md-sys-color-on-surface-variant, #6A6560); }
.m-badge--super { background: color-mix(in srgb, var(--md-sys-color-primary, #C4941C) 18%, transparent); color: var(--md-sys-color-primary, #C4941C); }
.m-badge--sys { background: var(--md-sys-color-surface-container-high, #EFE7DA); color: var(--md-sys-color-on-surface-variant, #6A6560); }

.m-error {
  margin: 12px 0 0; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A);
}
.m-ok {
  margin: 12px 0 0; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: color-mix(in srgb, #2F6B4A 14%, transparent); color: #2F6B4A;
}
</style>
