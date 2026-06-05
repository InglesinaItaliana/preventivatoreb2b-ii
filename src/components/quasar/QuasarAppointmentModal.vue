<script setup lang="ts">
/**
 * QuasarAppointmentModal — crea/modifica/elimina un appuntamento (B3).
 * Bottom-sheet M3 (pattern Cepheid/Quasar). Draft assegnatari per email
 * (chip), convertiti a UID al salvataggio (toUids) coerentemente con il modello.
 */
import { ref, computed, watch } from 'vue'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, toUids, toEmails, type TeamMember } from '../../composables/sidera/useTeamMembers'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { createAppointment, updateAppointment, deleteAppointment } from '../../composables/quasar/useAppointments'
import type { CalendarItem } from '../../composables/quasar/useCalendarItems'

const props = defineProps<{
  members: TeamMember[]
  editItem?: CalendarItem | null   // appuntamento da modificare; null = crea
  defaultDate?: Date | null        // data preselezionata in creazione (click su un giorno)
}>()

const open = defineModel<boolean>('open', { required: true })

const { currentUser } = useCurrentUser()
const saving = ref(false)
const isEdit = computed(() => !!props.editItem)

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const f = ref({
  title: '', date: '', startTime: '09:00', endTime: '10:00',
  assignees: [] as string[], location: '', notes: '',
})

watch(open, (o) => {
  if (!o) return
  const e = props.editItem
  if (e) {
    f.value = {
      title: e.title,
      date: isoDate(e.start),
      startTime: hhmm(e.start),
      endTime: e.end ? hhmm(e.end) : hhmm(new Date(e.start.getTime() + 3600_000)),
      assignees: toEmails(e.assignees, props.members),
      location: e.location,
      notes: e.notes,
    }
  } else {
    const dd = props.defaultDate ?? new Date()
    const hasTime = dd.getHours() !== 0 || dd.getMinutes() !== 0   // click su una fascia oraria
    f.value = {
      title: '', date: isoDate(dd),
      startTime: hasTime ? hhmm(dd) : '09:00',
      endTime: hasTime ? hhmm(new Date(dd.getTime() + 3600_000)) : '10:00',
      assignees: currentUser.value?.email ? [currentUser.value.email] : [],
      location: '', notes: '',
    }
  }
})

function toggleAssignee(email: string) {
  const i = f.value.assignees.indexOf(email)
  if (i === -1) f.value.assignees.push(email); else f.value.assignees.splice(i, 1)
}

const canSubmit = computed(() => !saving.value && !!f.value.title.trim() && !!f.value.date && !!f.value.startTime)

function parseDT(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    const startAt = parseDT(f.value.date, f.value.startTime)
    const endAt = f.value.endTime ? parseDT(f.value.date, f.value.endTime) : null
    const assignees = toUids(f.value.assignees, props.members)
    const payload = { title: f.value.title.trim(), startAt, endAt, assignees, location: f.value.location.trim(), notes: f.value.notes.trim() }
    if (props.editItem) await updateAppointment(props.editItem.id, payload)
    else await createAppointment(payload)
    open.value = false
  } catch (e) {
    console.error('[QUASAR] appointment save error', e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.editItem || saving.value) return
  if (!confirm('Eliminare questo appuntamento?')) return
  saving.value = true
  try {
    await deleteAppointment(props.editItem.id)
    open.value = false
  } catch (e) {
    console.error('[QUASAR] appointment delete error', e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="am-backdrop s-scope-quasar" @click.self="open = false">
      <div class="am-dialog">
        <div class="am-head">
          <span class="am-title">{{ isEdit ? 'Modifica appuntamento' : 'Nuovo appuntamento' }}</span>
          <button class="am-close" @click="open = false"><MIcon name="close" :size="18" /></button>
        </div>

        <div class="am-body">
          <label class="am-label">Titolo *</label>
          <input v-model="f.title" class="am-input" placeholder="Es. Riunione commerciale" autofocus />

          <label class="am-label" style="margin-top:12px">Data *</label>
          <input v-model="f.date" type="date" class="am-input am-date" />

          <div class="am-row2">
            <div>
              <label class="am-label">Inizio *</label>
              <input v-model="f.startTime" type="time" class="am-input am-date" />
            </div>
            <div>
              <label class="am-label">Fine</label>
              <input v-model="f.endTime" type="time" class="am-input am-date" />
            </div>
          </div>

          <label class="am-label" style="margin-top:12px">Partecipanti</label>
          <div class="am-assignees">
            <div v-for="m in members" :key="m.email" class="am-chip" :class="{ on: f.assignees.includes(m.email) }"
              @click="toggleAssignee(m.email)">
              <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="20" />
              {{ displayName(m.email, members) }}
            </div>
          </div>

          <label class="am-label" style="margin-top:12px">Luogo</label>
          <input v-model="f.location" class="am-input" placeholder="Es. Sala riunioni / link call" />

          <label class="am-label" style="margin-top:12px">Note</label>
          <textarea v-model="f.notes" class="am-input am-textarea" rows="3" placeholder="Dettagli, ordine del giorno…" />
        </div>

        <div class="am-foot">
          <button v-if="isEdit" class="am-btn am-del" @click="remove"><MIcon name="delete" :size="16" /></button>
          <button class="am-btn am-ghost" @click="open = false">Annulla</button>
          <button class="am-btn am-primary" :disabled="!canSubmit" @click="submit">
            {{ saving ? 'Salvataggio…' : (isEdit ? 'Salva' : 'Crea') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.am-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200; }
.am-dialog {
  position: absolute; bottom: 0; left: 0; right: 0; margin-left: auto; margin-right: auto;
  background: var(--md-sys-color-surface); width: 100%; max-width: 540px; max-height: 92dvh;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0 0;
  display: flex; flex-direction: column; font-family: 'Outfit', sans-serif;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}
.am-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 0; }
.am-title { font-size: 16px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.am-close { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 2px; }
.am-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.am-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); margin-bottom: 6px; }
.am-input {
  width: 100%; box-sizing: border-box; background: var(--md-sys-color-surface-container);
  border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 10px 14px; font-size: 14px; font-family: 'Outfit', sans-serif; color: var(--md-sys-color-on-surface); outline: none;
}
.am-input:focus { border-color: var(--md-sys-color-primary); }
.am-date { color-scheme: light; }
.am-textarea { resize: vertical; min-height: 64px; }
.am-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.am-assignees { display: flex; flex-wrap: wrap; gap: 6px; }
.am-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); font-size: 12px; cursor: pointer; color: var(--md-sys-color-on-surface); }
.am-chip.on { background: var(--md-sys-color-primary-container); border-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary-container); }
.am-foot { display: flex; gap: 8px; padding: 14px 20px 20px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.am-btn { padding: 12px; border-radius: var(--md-sys-shape-corner-medium); font-size: 14px; font-weight: 600; font-family: 'Outfit', sans-serif; cursor: pointer; border: none; }
.am-del { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); flex: 0 0 auto; display: inline-flex; align-items: center; }
.am-ghost { flex: 1; background: none; border: 1px solid var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); }
.am-primary { flex: 2; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.am-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
