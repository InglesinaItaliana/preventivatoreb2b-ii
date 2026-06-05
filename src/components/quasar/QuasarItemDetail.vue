<script setup lang="ts">
/**
 * QuasarItemDetail — popup di DETTAGLIO (sola lettura) di un elemento del calendario.
 * Click su un item → mostra tutto ciò che è stato inserito (orario, partecipanti,
 * luogo, note, collegamenti cliccabili) + un pulsante per modificarlo:
 *  - appuntamento → emette `edit` (il parent apre la modale di modifica);
 *  - task/deliverable → "Apri in CEPHEID" (deep-link).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../shared/MIcon.vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, type TeamMember } from '../../composables/sidera/useTeamMembers'
import type { CalendarItem } from '../../composables/quasar/useCalendarItems'
import type { AppointmentLink } from '../../composables/sidera/useAllTasks'

const props = defineProps<{
  item: CalendarItem | null
  members: TeamMember[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ (e: 'edit', it: CalendarItem): void }>()

const router = useRouter()
const isAppt = computed(() => props.item?.kind === 'appointment')

function kindLabel(k: CalendarItem['kind']) { return k === 'appointment' ? 'Appuntamento' : k === 'deliverable' ? 'Deliverable' : 'Azione' }
function kindIcon(k: CalendarItem['kind']) { return k === 'appointment' ? 'event' : k === 'deliverable' ? 'inventory_2' : 'check_circle' }
function linkIcon(k: AppointmentLink['kind']) { return k === 'project' ? 'folder' : k === 'doc' ? 'description' : 'check_circle' }

const whenText = computed(() => {
  const it = props.item; if (!it) return ''
  const day = it.start.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (it.allDay) return `${day} · tutto il giorno`
  const t = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${day} · ${t(it.start)}${it.end ? '–' + t(it.end) : ''}`
})

function openLink(link: string) { open.value = false; router.push(link) }
function doEdit() { if (props.item) emit('edit', props.item) }
</script>

<template>
  <Teleport to="body">
    <div v-if="open && item" class="id-backdrop s-scope-quasar" @click.self="open = false">
      <div class="id-dialog">
        <div class="id-head" :style="{ '--c': item.color }">
          <span class="id-ic"><MIcon :name="kindIcon(item.kind)" :size="18" /></span>
          <div class="id-head-txt">
            <span class="id-kind">{{ kindLabel(item.kind) }}</span>
            <span class="id-title" :class="{ 'is-done': item.done }">{{ item.title }}</span>
          </div>
          <button class="id-close" aria-label="Chiudi" @click="open = false"><MIcon name="close" :size="18" /></button>
        </div>

        <div class="id-body">
          <div class="id-row"><MIcon name="schedule" :size="16" class="id-row-ic" /><span>{{ whenText }}</span></div>
          <div v-if="item.projectName" class="id-row"><MIcon name="folder" :size="16" class="id-row-ic" /><span>{{ item.projectName }}</span></div>
          <div v-if="item.location" class="id-row"><MIcon name="place" :size="16" class="id-row-ic" /><span>{{ item.location }}</span></div>

          <div v-if="item.assignees.length" class="id-block">
            <span class="id-label">Partecipanti</span>
            <div class="id-people">
              <span v-for="a in item.assignees" :key="a" class="id-person">
                <StarAvatar v-bind="starAvatarProps(a, members)" :size="20" /> {{ displayName(a, members) }}
              </span>
            </div>
          </div>

          <div v-if="item.notes" class="id-block">
            <span class="id-label">Note</span>
            <p class="id-notes">{{ item.notes }}</p>
          </div>

          <div v-if="item.links.length" class="id-block">
            <span class="id-label">Collegamenti</span>
            <div class="id-links">
              <button v-for="l in item.links" :key="l.kind + l.id" class="id-link" @click="openLink(l.link)">
                <MIcon :name="linkIcon(l.kind)" :size="14" class="id-link-ic" />
                <span class="id-link-label">{{ l.label }}</span>
                <MIcon name="open_in_new" :size="13" class="id-link-go" />
              </button>
            </div>
          </div>
        </div>

        <div class="id-foot">
          <button class="id-btn id-ghost" @click="open = false">Chiudi</button>
          <button v-if="isAppt" class="id-btn id-primary" @click="doEdit"><MIcon name="edit" :size="16" /> Modifica</button>
          <button v-else class="id-btn id-primary" @click="openLink(item.link)"><MIcon name="open_in_new" :size="16" /> Apri in CEPHEID</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.id-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 210; }
.id-dialog {
  position: absolute; bottom: 0; left: 0; right: 0; margin-left: auto; margin-right: auto;
  background: var(--md-sys-color-surface); width: 100%; max-width: 460px; max-height: 90dvh;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0 0;
  display: flex; flex-direction: column; font-family: 'Outfit', sans-serif;
  animation: modal-slide-from-bottom var(--md-sys-motion-duration-medium3, 350ms) var(--md-sys-motion-easing-emphasized-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}
.id-head { display: flex; align-items: flex-start; gap: 10px; padding: 18px 18px 12px; }
.id-ic { width: 34px; height: 34px; flex: 0 0 auto; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
.id-head-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.id-kind { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }
.id-title { font-size: 17px; font-weight: 600; color: var(--md-sys-color-on-surface); }
.id-title.is-done { text-decoration: line-through; opacity: .6; }
.id-close { background: none; border: none; cursor: pointer; color: var(--md-sys-color-on-surface-variant); padding: 2px; flex: 0 0 auto; }
.id-body { padding: 4px 18px 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.id-row { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--md-sys-color-on-surface); }
.id-row-ic { color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; }
.id-block { display: flex; flex-direction: column; gap: 6px; }
.id-label { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }
.id-people { display: flex; flex-wrap: wrap; gap: 8px; }
.id-person { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--md-sys-color-on-surface); }
.id-notes { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: var(--md-sys-color-on-surface); }
.id-links { display: flex; flex-direction: column; gap: 6px; }
.id-link { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: 8px; padding: 8px 10px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--md-sys-color-on-surface); }
.id-link:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface-container)); }
.id-link-ic { color: var(--md-sys-color-primary); flex: 0 0 auto; }
.id-link-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.id-link-go { color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; }
.id-foot { display: flex; gap: 8px; padding: 12px 18px 18px; border-top: 1px solid var(--md-sys-color-outline-variant); }
.id-btn { padding: 11px 14px; border-radius: var(--md-sys-shape-corner-medium); font-size: 14px; font-weight: 600; font-family: 'Outfit', sans-serif; cursor: pointer; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.id-ghost { flex: 1; background: none; border: 1px solid var(--md-sys-color-outline-variant); color: var(--md-sys-color-on-surface-variant); }
.id-primary { flex: 2; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
</style>
