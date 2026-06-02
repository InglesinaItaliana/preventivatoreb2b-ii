<script setup lang="ts">
/**
 * CORE · Funzioni — gestione delle etichette-funzione (mansioni): ogni funzione
 * lega un nome a una CATEGORIA-avatar (gruppo di 6) e a un RUOLO-permessi.
 * Alimenta il select "Funzione" nella creazione agente. Gated isCoreAdmin.
 */
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import { useCoreAdmins } from '../../composables/sidera/useCoreAdmins'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useFunzioni } from '../../composables/sidera/useFunzioni'
import { CATEGORY_OPTIONS } from '../../composables/nebula/useNebulaTeam'
import type { Role } from '../../router/permissions'

const router = useRouter()
const { isCoreAdmin, initialized } = useCoreAdmins()
const { currentUser } = useCurrentUser()
const { funzioni, isSeeded, loading, addFunzione, updateFunzione, deleteFunzione, seedDefaults } = useFunzioni()

const canAccessCore = computed(() =>
  isCoreAdmin(currentUser.value?.email) ||
  (!initialized.value && currentUser.value?.role === 'ADMIN'),
)

const ROLES: Role[] = ['ADMIN', 'PRODUZIONE', 'LOGISTICA', 'COMMERCIALE']
const roleLabel: Record<string, string> = {
  ADMIN: 'Admin', PRODUZIONE: 'Produzione', LOGISTICA: 'Logistica', COMMERCIALE: 'Commerciale',
}

const busy = ref('')
const errorMsg = ref('')

async function onField(id: string, patch: Record<string, unknown>) {
  busy.value = id; errorMsg.value = ''
  try { await updateFunzione(id, patch as any) }
  catch (e: any) { console.error('[CoreFunzioni] update', e); errorMsg.value = e?.message || 'Errore aggiornamento.' }
  finally { busy.value = '' }
}

async function onDelete(id: string, label: string) {
  if (!confirm(`Eliminare la funzione "${label}"?`)) return
  busy.value = id; errorMsg.value = ''
  try { await deleteFunzione(id) }
  catch (e: any) { console.error('[CoreFunzioni] delete', e); errorMsg.value = e?.message || 'Errore eliminazione.' }
  finally { busy.value = '' }
}

// --- Nuova funzione ---
const showAdd = ref(false)
const adding = ref(false)
const form = reactive({ label: '', category: 'amministrazione', role: 'PRODUZIONE' as Role })
async function onAdd() {
  errorMsg.value = ''
  if (!form.label.trim()) { errorMsg.value = 'Inserisci il nome della funzione.'; return }
  adding.value = true
  try {
    await addFunzione({ label: form.label.trim(), category: form.category, role: form.role })
    Object.assign(form, { label: '', category: 'amministrazione', role: 'PRODUZIONE' as Role })
    showAdd.value = false
  } catch (e: any) { console.error('[CoreFunzioni] add', e); errorMsg.value = e?.message || 'Errore creazione.' }
  finally { adding.value = false }
}

const seeding = ref(false)
async function onSeed() {
  if (!confirm('Caricare le funzioni predefinite? (operazione una tantum)')) return
  seeding.value = true; errorMsg.value = ''
  try { await seedDefaults() }
  catch (e: any) { console.error('[CoreFunzioni] seed', e); errorMsg.value = e?.message || 'Errore caricamento predefiniti.' }
  finally { seeding.value = false }
}
</script>

<template>
  <div class="m-page s-scope-sidera">
    <header class="m-header">
      <button class="m-back" @click="router.push('/sidera')" aria-label="Indietro">←</button>
      <div>
        <h2 class="m-title">Funzioni</h2>
        <p class="m-sub">CORE · Mansioni → categoria + ruolo</p>
      </div>
    </header>

    <div v-if="!canAccessCore" class="m-empty"><p>Pagina riservata agli amministratori CORE.</p></div>

    <div v-else class="m-task">
      <div class="m-task-head">
        <div>
          <h3 class="m-task-title">Etichette funzione</h3>
          <p class="m-task-desc">Ogni funzione determina, alla creazione di un agente, la <strong>categoria</strong> (forma avatar) e il <strong>ruolo-permessi</strong>.</p>
        </div>
        <button class="m-btn" type="button" @click="showAdd = !showAdd">
          <MIcon name="add" :size="16" /> Nuova funzione
        </button>
      </div>

      <form v-if="showAdd" class="m-add-f" @submit.prevent="onAdd">
        <input v-model="form.label" class="m-input" placeholder="Nome funzione (es. Agente Commerciale)" />
        <select v-model="form.category" class="m-input">
          <option v-for="c in CATEGORY_OPTIONS" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <select v-model="form.role" class="m-input">
          <option v-for="r in ROLES" :key="r" :value="r">{{ roleLabel[r] }}</option>
        </select>
        <button class="m-btn" type="submit" :disabled="adding">{{ adding ? '…' : 'Crea' }}</button>
      </form>

      <div v-if="errorMsg" class="m-error">{{ errorMsg }}</div>

      <div v-if="loading" class="m-task-desc">Caricamento…</div>

      <div v-else-if="!isSeeded" class="m-empty-seed">
        <p>Nessuna funzione personalizzata. Stai usando i <strong>predefiniti</strong>.</p>
        <button class="m-btn" type="button" :disabled="seeding" @click="onSeed">
          <MIcon name="download" :size="16" /> {{ seeding ? 'Carico…' : 'Carica predefiniti per modificarli' }}
        </button>
      </div>

      <ul v-else class="m-list">
        <li v-for="f in funzioni" :key="f.id" class="m-frow" :class="{ 'is-busy': busy === f.id }">
          <input
            class="m-input m-frow-label" :value="f.label"
            @change="onField(f.id, { label: ($event.target as HTMLInputElement).value.trim() })"
          />
          <select class="m-input m-frow-sel" :value="f.category" @change="onField(f.id, { category: ($event.target as HTMLSelectElement).value })">
            <option v-for="c in CATEGORY_OPTIONS" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
          <select class="m-input m-frow-sel" :value="f.role" @change="onField(f.id, { role: ($event.target as HTMLSelectElement).value })">
            <option v-for="r in ROLES" :key="r" :value="r">{{ roleLabel[r] }}</option>
          </select>
          <button class="m-icon-btn" title="Elimina" :disabled="busy === f.id" @click="onDelete(f.id, f.label)">
            <MIcon name="delete" :size="18" />
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
.m-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.m-input {
  min-width: 0; background: var(--md-sys-color-surface-container-lowest, #FFFFFF);
  border: 1px solid var(--md-sys-color-outline-variant, #CEC6B4);
  border-radius: 10px; padding: 9px 12px; font-size: 14px; font-family: inherit;
  color: var(--md-sys-color-on-surface, #1A1917); outline: none;
}
.m-input:focus { border-color: var(--md-sys-color-primary, #C4941C); }

.m-add-f { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; margin-bottom: 16px; }

.m-empty-seed {
  background: var(--md-sys-color-surface-container, #F5EDDF); padding: 20px; border-radius: 12px;
  display: flex; flex-direction: column; gap: 12px; align-items: flex-start; font-size: 14px;
  color: var(--md-sys-color-on-surface-variant, #6A6560);
}

.m-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.m-frow {
  display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; align-items: center;
  padding: 6px 8px; border-radius: 12px; background: var(--md-sys-color-surface-container, #F5EDDF);
}
.m-frow.is-busy { opacity: 0.6; }
.m-frow-label { font-weight: 500; }
.m-frow-sel { text-align: center; text-align-last: center; }
.m-icon-btn {
  flex: 0 0 auto; background: none; border: none; cursor: pointer; padding: 6px; border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface-variant, #6A6560); display: inline-flex; align-items: center;
}
.m-icon-btn:hover:not(:disabled) { background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A); }
.m-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.m-error {
  margin: 12px 0; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: var(--md-sys-color-error-container, #FFDAD6); color: var(--md-sys-color-on-error-container, #93000A);
}
</style>
