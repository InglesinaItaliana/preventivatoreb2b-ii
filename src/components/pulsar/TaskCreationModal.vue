<script setup lang="ts">
/**
 * Modal "Crea azione da messaggio" condiviso fra PulsarMessageView e
 * PulsarPendingView (prima duplicato ~150 righe in entrambe).
 *
 * Crea un task standalone (con back-link alla chat/messaggio d'origine) e
 * delega al chiamante il forward-link sul messaggio via evento `created`.
 */
import { ref, watch } from 'vue'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { displayName, starAvatarProps, toUids, type TeamMember } from '../../composables/sidera/useTeamMembers'
import { createStandaloneTask } from '../../composables/sidera/useAllTasks'
import type { Project } from '../../composables/sidera/useProjects'

const props = defineProps<{
  open: boolean
  /** Messaggio sorgente: serve id+testo (prefill titolo) e chatId (back-link). */
  message: { id: string; text: string; chatId: string } | null
  members: TeamMember[]
  projects: Project[]
  /** Riga di contesto opzionale (chat + autore), mostrata se presente. */
  context?: { chatName: string; fromLabel: string } | null
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', taskId: string): void
  (e: 'reject'): void
}>()

const saving = ref(false)
const form = ref({
  title: '',
  projectId: '',
  priority: 'media' as 'alta' | 'media' | 'bassa',
  dueDate: '',
  assignees: [] as string[],
})

const prioOptions = [
  { id: 'alta',  label: 'Alta',  color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const

// reset del form a ogni apertura (prefill titolo dal messaggio)
watch(() => props.open, (v) => {
  if (v) {
    form.value = {
      title: (props.message?.text ?? '').slice(0, 80),
      projectId: '',
      priority: 'media',
      dueDate: '',
      assignees: [],
    }
  }
})

function close() { emit('update:open', false) }

function toggleAssignee(email: string) {
  const idx = form.value.assignees.indexOf(email)
  if (idx === -1) form.value.assignees.push(email)
  else form.value.assignees.splice(idx, 1)
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

async function submit() {
  if (!props.message || !form.value.title.trim() || saving.value) return
  saving.value = true
  try {
    const dueDate = form.value.dueDate ? parseDateInput(form.value.dueDate) : null
    const taskId = await createStandaloneTask({
      title:     form.value.title.trim(),
      projectId: form.value.projectId || null,
      priority:  form.value.priority,
      dueDate,
      assignees: toUids(form.value.assignees, props.members),
      source:    { chatId: props.message.chatId, messageId: props.message.id },
    })
    emit('created', taskId)
    close()
  } catch (e) {
    console.error('[TaskCreationModal] create error', e)
  } finally {
    saving.value = false
  }
}

function reject() {
  if (saving.value) return
  emit('reject')
  close()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop md-modal-backdrop" @click.self="close">
      <div class="task-modal" @click.stop>
        <div class="modal-header md-modal-header">
          <span class="modal-title">Crea azione</span>
          <button class="modal-close md-modal-close" @click="close"><MIcon name="close" :size="18" /></button>
        </div>
        <div class="modal-body md-modal-body">
          <p v-if="context" class="modal-context">
            Dalla chat <b>{{ context.chatName }}</b> · {{ context.fromLabel }}
          </p>

          <label class="field-label md-text-field-label">Titolo *</label>
          <input v-model="form.title" class="field-input md-text-field-input" autofocus />

          <label class="field-label md-text-field-label" style="margin-top:12px">Progetto</label>
          <select v-model="form.projectId" class="field-input md-text-field-input">
            <option value="">— Nessun progetto —</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>

          <label class="field-label md-text-field-label" style="margin-top:12px">Assegna a</label>
          <div class="assignees-chips">
            <div
              v-for="m in members"
              :key="m.email"
              class="assignee-chip"
              :class="{ 'is-selected': form.assignees.includes(m.email) }"
              :style="form.assignees.includes(m.email)
                ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' }
                : {}"
              @click="toggleAssignee(m.email)"
            >
              <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
              {{ displayName(m.email, members) }}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div>
              <label class="field-label md-text-field-label">Priorità</label>
              <div class="prio-picker">
                <button
                  v-for="p in prioOptions"
                  :key="p.id"
                  class="prio-opt"
                  :class="{ 'is-sel': form.priority === p.id }"
                  :style="form.priority === p.id ? { borderColor: p.color, color: p.color } : {}"
                  type="button"
                  @click="form.priority = p.id"
                >
                  <span class="prio-dot" :style="{ background: p.color }" />
                  {{ p.label }}
                </button>
              </div>
            </div>
            <div>
              <label class="field-label md-text-field-label">Scadenza</label>
              <input v-model="form.dueDate" type="date" class="field-input field-date" />
            </div>
          </div>
        </div>
        <div class="modal-footer md-modal-footer">
          <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="close">Annulla</button>
          <button class="btn-reject" :disabled="saving" @click="reject">{{ saving ? '…' : 'Rifiuta' }}</button>
          <button
            class="btn-primary md-btn md-btn--filled md-btn--rounded"
            :disabled="!form.title.trim() || saving"
            @click="submit"
          >{{ saving ? 'Creazione…' : 'Crea azione' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 20px;
}
.task-modal {
  background: #fff;
  border-radius: var(--md-sys-shape-corner-large);
  width: 100%; max-width: 420px;
  font-family: 'Outfit', sans-serif;
}
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }
.modal-close { background: none; border: none; cursor: pointer; color: #9B9590; padding: 2px; }
.modal-body { padding: 16px 20px; }
.modal-context { font-size: 11px; color: #9B9590; margin-bottom: 14px; }

.field-label {
  display: block; font-size: 10px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #9B9590; margin-bottom: 6px;
}
.field-input {
  width: 100%; box-sizing: border-box;
  background: #F4F2EE; border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-small); padding: 9px 12px;
  font-size: 16px; font-family: 'Outfit', sans-serif;
  color: #1A1917; outline: none;
}
.field-date { cursor: pointer; color-scheme: light; }

.prio-picker { display: flex; gap: 4px; }
.prio-opt {
  flex: 1; display: flex; align-items: center; gap: 5px;
  padding: 7px 6px; border-radius: var(--md-sys-shape-corner-small);
  border: 1.5px solid #E8E5DF; background: #F4F2EE;
  font-size: 11px; font-weight: 500; cursor: pointer;
  font-family: 'Outfit', sans-serif; color: #6A6560;
  transition: all 0.15s; justify-content: center;
}
.prio-opt:hover { border-color: #C8C5C0; color: #1A1917; }
.prio-opt.is-sel { font-weight: 700; background: transparent; }
.prio-dot { width: 8px; height: 8px; border-radius: var(--md-sys-shape-corner-full); flex-shrink: 0; }

.assignees-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }
.assignee-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 5px; border-radius: 20px;
  border: 1.5px solid #E8E5DF; background: #F4F2EE;
  font-size: 12px; color: #6A6560;
  cursor: pointer; transition: all 0.15s; user-select: none;
}
.assignee-chip:hover { border-color: #C8C5C0; color: #1A1917; }
.assignee-chip.is-selected { font-weight: 600; }

.modal-footer { display: flex; gap: 8px; padding: 14px 20px 18px; border-top: 1px solid #E8E5DF; }
.btn-ghost {
  flex: 1; padding: 10px; background: none;
  border: 1px solid #E8E5DF; border-radius: 10px;
  font-size: 13px; cursor: pointer; color: #6A6560;
  font-family: 'Outfit', sans-serif;
}
.btn-primary {
  flex: 2; padding: 10px; background: var(--md-sys-color-primary);
  border: none; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; color: #fff;
  font-family: 'Outfit', sans-serif;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-reject {
  flex: 1.2; padding: 10px; background: none;
  border: 1px solid #E8E5DF; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; color: #6A6560;
  font-family: 'Outfit', sans-serif;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.btn-reject:hover:not(:disabled) { border-color: #C8521A; color: #C8521A; }
.btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
