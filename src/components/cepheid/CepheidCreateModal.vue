<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, type TeamMember } from '../../composables/sidera/useTeamMembers'
import type { ProjectTask } from '../../composables/sidera/useProjectTasks'

type Kind = 'fase' | 'deliverable' | 'milestone' | 'task'

const props = defineProps<{
  tasks: ProjectTask[]
  members: TeamMember[]
  currentUserEmail: string | null
  createTask: (data: any) => Promise<string>
  createPhaseBundle: (payload: any) => Promise<void>
  updateTask: (id: string, data: any) => Promise<void>
  projectDueIso?: string   // data fine progetto: limite massimo per la scadenza fase/deliverable
  // Modalità EDIT: se valorizzato, la modale modifica questo deliverable/milestone
  // (pre-compila i campi e salva via updateTask) invece di crearne uno nuovo.
  editTask?: ProjectTask | null
}>()

const open = defineModel<boolean>('open', { required: true })
const kind = defineModel<Kind>('kind', { required: true })

const saving = ref(false)
const isEdit = computed(() => !!props.editTask)

const milestones   = computed(() => props.tasks.filter(t => t.type === 'milestone'))
const deliverables = computed(() => props.tasks.filter(t => t.type === 'deliverable'))
const realTasks    = computed(() => props.tasks.filter(t => !t.type || t.type === 'task'))
const orphanTasks  = computed(() => {
  const assigned = new Set<string>()
  deliverables.value.forEach(d => d.deliverableTaskIds.forEach(id => assigned.add(id)))
  return realTasks.value.filter(t => !assigned.has(t.id))
})
function mileTitleOf(id: string | null) { return milestones.value.find(m => m.id === id)?.title ?? '—' }
function delivLabel(d: ProjectTask) { return `${d.title} · ${mileTitleOf(d.milestoneId)}` }

// ── form unico ──────────────────────────────────────────────────────────
const f = ref({
  // milestone (bundle/deliverable/milestone)
  milestoneMode: 'existing' as 'existing' | 'new',
  milestoneId: '' as string,
  mileTitle: '',
  mileDue: '',
  // deliverable
  delivTitle: '',
  delivDue: '',
  // tasks
  newTaskTitles: [''] as string[],
  attachedTaskIds: [] as string[],
  // single task
  taskTitle: '',
  taskPriority: 'media' as 'alta' | 'media' | 'bassa',
  taskDue: '',
  taskAssignees: [] as string[],
  placement: '' as string,   // deliverableId o '' = a livello progetto
})

function toIso(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function blankForm() {
  return {
    milestoneMode: (milestones.value.length ? 'existing' : 'new') as 'existing' | 'new',
    milestoneId: milestones.value[0]?.id ?? '',
    mileTitle: '', mileDue: '',
    delivTitle: '', delivDue: '',
    newTaskTitles: [''] as string[], attachedTaskIds: [] as string[],
    taskTitle: '', taskPriority: 'media' as 'alta' | 'media' | 'bassa', taskDue: '',
    taskAssignees: props.currentUserEmail ? [props.currentUserEmail] : [],
    placement: '',
  }
}

watch([open, kind], ([o]) => {
  if (!o) return
  const base = blankForm()
  const e = props.editTask
  if (e && kind.value === 'deliverable') {
    // Pre-compila dal deliverable da modificare (titolo, data, milestone).
    f.value = { ...base, milestoneId: e.milestoneId ?? base.milestoneId, delivTitle: e.title, delivDue: toIso(e.dueDate) }
  } else if (e && kind.value === 'milestone') {
    f.value = { ...base, mileTitle: e.title }
  } else {
    f.value = base
  }
})

function parseDate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addTaskRow() { f.value.newTaskTitles.push('') }
function removeTaskRow(i: number) { f.value.newTaskTitles.splice(i, 1); if (!f.value.newTaskTitles.length) f.value.newTaskTitles.push('') }
function toggleAttached(id: string) {
  const i = f.value.attachedTaskIds.indexOf(id)
  if (i === -1) f.value.attachedTaskIds.push(id); else f.value.attachedTaskIds.splice(i, 1)
}
function toggleAssignee(email: string) {
  const i = f.value.taskAssignees.indexOf(email)
  if (i === -1) f.value.taskAssignees.push(email); else f.value.taskAssignees.splice(i, 1)
}

const taskCount = computed(() => f.value.newTaskTitles.filter(t => t.trim()).length + f.value.attachedTaskIds.length)
const milestoneValid = computed(() =>
  kind.value === 'deliverable' ? !!f.value.milestoneId
  : f.value.milestoneMode === 'existing' ? !!f.value.milestoneId : !!f.value.mileTitle.trim())

const canSubmit = computed(() => {
  if (saving.value) return false
  if (isEdit.value) {
    // In edit non si toccano le task: bastano titolo (+ milestone per il deliverable).
    if (kind.value === 'milestone') return !!f.value.mileTitle.trim()
    return !!f.value.delivTitle.trim() && !!f.value.milestoneId
  }
  if (kind.value === 'fase')        return !!f.value.delivTitle.trim() && milestoneValid.value && taskCount.value >= 1
  if (kind.value === 'deliverable') return !!f.value.delivTitle.trim() && !!f.value.milestoneId && taskCount.value >= 1
  if (kind.value === 'milestone')   return !!f.value.mileTitle.trim()
  return !!f.value.taskTitle.trim() // task
})

const title = computed(() => {
  if (isEdit.value) return kind.value === 'milestone' ? 'Modifica milestone' : 'Modifica deliverable'
  return { fase: 'Nuova fase', deliverable: 'Nuovo deliverable', milestone: 'Nuova milestone', task: 'Nuova task' }[kind.value]
})

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    // ── EDIT: aggiorna il deliverable/milestone esistente, niente create ──
    if (isEdit.value && props.editTask) {
      if (kind.value === 'milestone') {
        await props.updateTask(props.editTask.id, { title: f.value.mileTitle.trim() })
      } else {
        await props.updateTask(props.editTask.id, {
          title: f.value.delivTitle.trim(),
          dueDate: parseDate(f.value.delivDue),
          milestoneId: f.value.milestoneId || null,
        })
      }
      open.value = false
      return
    }

    if (kind.value === 'fase' || kind.value === 'deliverable') {
      const milestone = (kind.value === 'deliverable' || f.value.milestoneMode === 'existing')
        ? { existingId: f.value.milestoneId }
        : { title: f.value.mileTitle.trim(), dueDate: null }
      await props.createPhaseBundle({
        milestone,
        deliverable: { title: f.value.delivTitle.trim(), dueDate: parseDate(f.value.delivDue) },
        newTaskTitles: f.value.newTaskTitles.map(t => t.trim()).filter(Boolean),
        attachedTaskIds: f.value.attachedTaskIds,
      })
    } else if (kind.value === 'milestone') {
      await props.createTask({ title: f.value.mileTitle.trim(), type: 'milestone', status: 'todo', priority: 'media', dueDate: null, assignees: [] })
    } else {
      const id = await props.createTask({
        title: f.value.taskTitle.trim(), type: 'task', status: 'todo',
        priority: f.value.taskPriority, dueDate: parseDate(f.value.taskDue), assignees: f.value.taskAssignees,
        triaged: true,   // task configurato dal modal completo: non passa dall'inbox
      })
      if (f.value.placement) {
        const d = deliverables.value.find(x => x.id === f.value.placement)
        if (d) await props.updateTask(d.id, { deliverableTaskIds: [...d.deliverableTaskIds, id] })
      }
    }
    open.value = false
  } catch (e) {
    console.error('[CEPHEID] create error', e)
  } finally {
    saving.value = false
  }
}

const PRIO = [
  { id: 'alta', label: 'Alta', color: '#C8521A' },
  { id: 'media', label: 'Media', color: '#D4A020' },
  { id: 'bassa', label: 'Bassa', color: '#7A8FA6' },
] as const
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cm-backdrop s-scope-cepheid" @click.self="open = false">
      <div class="cm-dialog">
        <div class="cm-head">
          <span class="cm-title">{{ title }}</span>
          <button class="cm-close" @click="open = false"><MIcon name="close" :size="18" /></button>
        </div>

        <div class="cm-body">
          <!-- ===== MILESTONE (campo titolo+data) — usato in milestone, e bundle se nuova ===== -->
          <template v-if="kind === 'milestone'">
            <label class="cm-label">Titolo milestone *</label>
            <input v-model="f.mileTitle" class="cm-input" placeholder="Es. Beta" autofocus />
            <div class="cm-hint">La data della milestone è derivata dai suoi deliverable (l'ultimo a chiudersi).</div>
          </template>

          <!-- ===== FASE / DELIVERABLE ===== -->
          <template v-if="kind === 'fase' || kind === 'deliverable'">
            <!-- milestone -->
            <label class="cm-label">Milestone *</label>
            <div v-if="kind === 'fase'" class="cm-seg">
              <button :class="{ on: f.milestoneMode === 'existing' }" :disabled="!milestones.length" @click="f.milestoneMode = 'existing'">Esistente</button>
              <button :class="{ on: f.milestoneMode === 'new' }" @click="f.milestoneMode = 'new'">Nuova</button>
            </div>
            <template v-if="(kind === 'deliverable') || f.milestoneMode === 'existing'">
              <select v-if="milestones.length" v-model="f.milestoneId" class="cm-input">
                <option v-for="m in milestones" :key="m.id" :value="m.id">{{ m.title }}</option>
              </select>
              <div v-else class="cm-hint">Nessuna milestone: creane una col flusso "Nuova fase".</div>
            </template>
            <template v-else>
              <input v-model="f.mileTitle" class="cm-input" placeholder="Titolo nuova milestone" />
            </template>

            <!-- deliverable -->
            <label class="cm-label" style="margin-top:14px">Deliverable *</label>
            <input v-model="f.delivTitle" class="cm-input" placeholder="Es. Prototipo" />
            <label class="cm-label" style="margin-top:8px">Scadenza deliverable</label>
            <input v-model="f.delivDue" type="date" class="cm-input cm-date" :max="projectDueIso || undefined" />
            <div v-if="projectDueIso" class="cm-hint">Il progetto termina il {{ projectDueIso }}: la fase non può andare oltre.</div>

            <!-- tasks: solo in creazione (in edit non si toccano le task collegate) -->
            <template v-if="!isEdit">
            <label class="cm-label" style="margin-top:14px">Task (almeno una) *</label>
            <div v-for="(_, i) in f.newTaskTitles" :key="i" class="cm-taskrow">
              <input v-model="f.newTaskTitles[i]" class="cm-input" placeholder="Titolo task" />
              <button class="cm-iconbtn" title="Rimuovi" @click="removeTaskRow(i)"><MIcon name="close" :size="16" /></button>
            </div>
            <button class="cm-add" @click="addTaskRow"><MIcon name="add" :size="14" /> Aggiungi task</button>

            <template v-if="orphanTasks.length">
              <label class="cm-label" style="margin-top:12px">Oppure aggancia task esistenti (Senza fase)</label>
              <label v-for="t in orphanTasks" :key="t.id" class="cm-check">
                <input type="checkbox" :checked="f.attachedTaskIds.includes(t.id)" @change="toggleAttached(t.id)" />
                <span>{{ t.title }}</span>
              </label>
            </template>
            <div class="cm-count" :class="{ ok: taskCount >= 1 }">{{ taskCount }} task</div>
            </template>
          </template>

          <!-- ===== TASK singola ===== -->
          <template v-if="kind === 'task'">
            <label class="cm-label">Titolo *</label>
            <input v-model="f.taskTitle" class="cm-input" placeholder="Es. Ricerca" autofocus />

            <label class="cm-label" style="margin-top:12px">Priorità</label>
            <div class="cm-prio">
              <button v-for="p in PRIO" :key="p.id" class="cm-prio-opt" :class="{ on: f.taskPriority === p.id }"
                :style="f.taskPriority === p.id ? { borderColor: p.color, color: p.color } : {}" @click="f.taskPriority = p.id">
                <span class="cm-dot" :style="{ background: p.color }" />{{ p.label }}
              </button>
            </div>

            <label class="cm-label" style="margin-top:12px">Scadenza</label>
            <input v-model="f.taskDue" type="date" class="cm-input cm-date" />

            <label class="cm-label" style="margin-top:12px">Collocazione</label>
            <select v-model="f.placement" class="cm-input">
              <option value="">A livello progetto (nessun deliverable)</option>
              <option v-for="d in deliverables" :key="d.id" :value="d.id">{{ delivLabel(d) }}</option>
            </select>

            <label class="cm-label" style="margin-top:12px">Assegna a</label>
            <div class="cm-assignees">
              <div v-for="m in members" :key="m.email" class="cm-chip" :class="{ on: f.taskAssignees.includes(m.email) }"
                :style="f.taskAssignees.includes(m.email) ? { background: 'var(--md-sys-color-primary-container)', borderColor: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary-container)' } : {}"
                @click="toggleAssignee(m.email)">
                <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
                {{ displayName(m.email, members) }}
              </div>
            </div>
          </template>
        </div>

        <div class="cm-foot">
          <button class="cm-btn cm-ghost" @click="open = false">Annulla</button>
          <button class="cm-btn cm-primary" :disabled="!canSubmit" @click="submit">
            {{ saving ? (isEdit ? 'Salvataggio…' : 'Creazione…') : (isEdit ? 'Salva' : 'Crea') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200; }
.cm-dialog {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  background: var(--md-sys-color-surface); width: 100%; max-width: 540px; max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0 0;
  display: flex; flex-direction: column; font-family: 'Outfit', sans-serif;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}
.cm-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.cm-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.cm-close { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 2px; }
.cm-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.cm-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; }
.cm-input {
  width: 100%; box-sizing: border-box; background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 10px 14px; font-size: 14px; font-family: 'Outfit', sans-serif; color: var(--md-sys-color-on-surface); outline: none;
}
.cm-input:focus { border-color: var(--md-sys-color-primary); }
.cm-date { color-scheme: light; }
.cm-hint { font-size: 12px; color: var(--md-sys-color-on-surface-variant); font-style: italic; padding: 4px 0; }
.cm-seg { display: flex; gap: 4px; margin-bottom: 8px; }
.cm-seg button { flex: 1; padding: 7px; border: 1px solid var(--md-sys-color-outline-variant); background: transparent; border-radius: var(--md-sys-shape-corner-small); font-family: inherit; font-size: 12px; cursor: pointer; color: var(--md-sys-color-on-surface-variant); }
.cm-seg button.on { background: var(--md-sys-color-primary-container); border-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary-container); }
.cm-seg button:disabled { opacity: .4; cursor: not-allowed; }
.cm-taskrow { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.cm-iconbtn { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 4px; flex: 0 0 auto; }
.cm-add { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px dashed var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); padding: 6px 12px; font-family: inherit; font-size: 12px; color: var(--md-sys-color-primary); cursor: pointer; }
.cm-check { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; color: var(--md-sys-color-on-surface); cursor: pointer; }
.cm-count { margin-top: 8px; font-size: 11px; font-weight: 600; color: var(--md-sys-color-error); }
.cm-count.ok { color: var(--md-sys-color-primary); }
.cm-prio { display: flex; gap: 6px; }
.cm-prio-opt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid var(--md-sys-color-outline-variant); background: transparent; border-radius: var(--md-sys-shape-corner-small); font-family: inherit; font-size: 13px; cursor: pointer; color: var(--md-sys-color-on-surface-variant); }
.cm-prio-opt.on { font-weight: 600; }
.cm-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.cm-assignees { display: flex; flex-wrap: wrap; gap: 6px; }
.cm-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); font-size: 12px; cursor: pointer; color: var(--md-sys-color-on-surface); }
.cm-foot { display: flex; gap: 8px; padding: 14px 20px 20px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.cm-btn { padding: 12px; border-radius: var(--md-sys-shape-corner-medium); font-size: 14px; font-weight: 600; font-family: 'Outfit', sans-serif; cursor: pointer; }
.cm-ghost { flex: 1; background: none; border: 1px solid var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); }
.cm-primary { flex: 2; background: var(--md-sys-color-primary); border: none; color: var(--md-sys-color-on-primary); }
.cm-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
