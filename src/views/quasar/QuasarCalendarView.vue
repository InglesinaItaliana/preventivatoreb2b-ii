<script setup lang="ts">
/**
 * QUASAR · Calendario (EPHEMERIS) — B2: vista Mese.
 * Pesca le entità datate da useCalendarItems (task/deliverable all-day; gli
 * appuntamenti veri arrivano in B3) e le dispone in una griglia mensile M3,
 * lunedì-prima. Ogni chip è cliccabile → deep-link al modulo d'origine.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useCalendarItems, type CalendarItem } from '../../composables/quasar/useCalendarItems'
import { useTeamMembers } from '../../composables/sidera/useTeamMembers'
import QuasarAppointmentModal from '../../components/quasar/QuasarAppointmentModal.vue'

const router = useRouter()
const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { items, loading } = useCalendarItems()
const { members } = useTeamMembers()

// ── CRUD appuntamenti (B3) ───────────────────────────────────────────────────
const apptOpen = ref(false)
const apptEdit = ref<CalendarItem | null>(null)
const apptDate = ref<Date | null>(null)
function newAppointment(date?: Date) { apptEdit.value = null; apptDate.value = date ?? null; apptOpen.value = true }
function editAppointment(it: CalendarItem) { apptEdit.value = it; apptDate.value = null; apptOpen.value = true }

// cursore = giorno qualsiasi nel mese mostrato
const cursor = ref(new Date())
const monthLabel = computed(() =>
  cursor.value.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }))

function prevMonth() { cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1) }
function nextMonth() { cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 1) }
function goToday()   { cursor.value = new Date() }

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 42 celle (6 settimane), partendo dal lunedì della settimana che contiene il 1°.
const gridDays = computed(() => {
  const y = cursor.value.getFullYear(), m = cursor.value.getMonth()
  const first = new Date(y, m, 1)
  const offset = (first.getDay() + 6) % 7          // lun=0 … dom=6
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out: { date: Date; inMonth: boolean; today: boolean; key: string }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - offset + i)
    out.push({ date: d, inMonth: d.getMonth() === m, today: d.getTime() === today.getTime(), key: dayKey(d) })
  }
  return out
})

// Mappa giorno → items (costruita una volta per render).
const byDay = computed(() => {
  const map = new Map<string, CalendarItem[]>()
  for (const it of items.value) {
    const k = dayKey(it.start)
    const arr = map.get(k); if (arr) arr.push(it); else map.set(k, [it])
  }
  // ordina: appuntamenti (con orario) prima, poi all-day per titolo
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? 1 : -1))
  }
  return map
})

function itemsOf(key: string): CalendarItem[] { return byDay.value.get(key) ?? [] }
function timeOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function openItem(it: CalendarItem) {
  if (it.kind === 'appointment') editAppointment(it)   // appuntamento → modale edit
  else router.push(it.link)                            // task/deliverable → CEPHEID
}
function iconOf(kind: CalendarItem['kind']): string {
  // CEPHEID distinto per icona: check = azioni/task, scatola = deliverable.
  return kind === 'deliverable' ? 'inventory_2' : kind === 'appointment' ? 'event' : 'check_circle'
}

const totalThisMonth = computed(() =>
  gridDays.value.filter(g => g.inMonth).reduce((n, g) => n + itemsOf(g.key).length, 0))
</script>

<template>
  <div class="cal s-scope-quasar" ref="scrollEl">
    <MdPageHeader
      title="Calendario"
      :subtitle="loading ? 'Caricamento…' : `${totalThisMonth} elementi questo mese`"
      sticky borderless :hidden="headerHidden"
    >
      <template #tools>
        <div class="cal-nav">
          <button class="cal-navbtn" aria-label="Mese precedente" @click="prevMonth"><MIcon name="chevron_left" :size="20" /></button>
          <span class="cal-month">{{ monthLabel }}</span>
          <button class="cal-navbtn" aria-label="Mese successivo" @click="nextMonth"><MIcon name="chevron_right" :size="20" /></button>
          <button class="cal-today" @click="goToday">Oggi</button>
          <button class="cal-new" @click="newAppointment()"><MIcon name="add" :size="16" /> Appuntamento</button>
        </div>
      </template>
    </MdPageHeader>

    <div class="cal-content">
      <div class="cal-grid cal-weekhead">
        <div v-for="w in WEEKDAYS" :key="w" class="cal-wd">{{ w }}</div>
      </div>
      <div class="cal-grid cal-body">
        <div
          v-for="g in gridDays"
          :key="g.key"
          class="cal-cell"
          :class="{ 'is-out': !g.inMonth, 'is-today': g.today }"
          @click="newAppointment(g.date)"
        >
          <span class="cal-daynum">{{ g.date.getDate() }}</span>
          <div class="cal-items">
            <button
              v-for="it in itemsOf(g.key).slice(0, 3)"
              :key="it.id"
              class="cal-chip"
              :class="{ 'is-done': it.done }"
              :style="{ '--c': it.color }"
              :title="it.projectName ? it.title + ' · ' + it.projectName : it.title"
              @click.stop="openItem(it)"
            >
              <MIcon :name="iconOf(it.kind)" :size="12" class="cal-chip-ic" />
              <span v-if="!it.allDay" class="cal-chip-time">{{ timeOf(it.start) }}</span>
              <span class="cal-chip-text"><span class="cal-chip-title">{{ it.title }}</span><span v-if="it.projectName" class="cal-chip-proj"> · {{ it.projectName }}</span></span>
            </button>
            <span v-if="itemsOf(g.key).length > 3" class="cal-more" @click.stop>+{{ itemsOf(g.key).length - 3 }}</span>
          </div>
        </div>
      </div>

      <!-- Legenda sorgenti (CEPHEID = oro, distinto per icona) -->
      <div class="cal-legend">
        <span class="cal-leg"><MIcon name="event" :size="15" style="color: var(--md-sys-color-primary)" />Appuntamenti</span>
        <span class="cal-leg"><MIcon name="check_circle" :size="15" style="color: #D4A020" />Azioni</span>
        <span class="cal-leg"><MIcon name="inventory_2" :size="15" style="color: #D4A020" />Deliverable</span>
      </div>
    </div>

    <QuasarAppointmentModal
      v-model:open="apptOpen"
      :members="members"
      :edit-item="apptEdit"
      :default-date="apptDate"
    />
  </div>
</template>

<style scoped>
.cal {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  height: 100%;
  overflow: auto;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .cal { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .cal { --page-bg: #0E0C07; } }

:deep(.md-page-header) { padding: 18px 16px 14px; }
@media (min-width: 1024px) { :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 540px)) 18px; } }

.cal-nav { display: flex; align-items: center; gap: 6px; }
.cal-navbtn, .cal-today {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full); cursor: pointer;
  color: var(--md-sys-color-on-surface); font-family: inherit;
}
.cal-navbtn { width: 32px; height: 32px; }
.cal-today { height: 32px; padding: 0 12px; font-size: 13px; font-weight: 600; }
.cal-navbtn:hover, .cal-today:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent); }
.cal-new {
  display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 12px;
  border: none; border-radius: var(--md-sys-shape-corner-full); cursor: pointer;
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
  font-family: inherit; font-size: 13px; font-weight: 600;
}
.cal-new:hover { background: var(--md-sys-color-primary-hover, var(--md-sys-color-primary)); }
.cal-month { min-width: 130px; text-align: center; font-weight: 600; font-size: 14px; text-transform: capitalize; }

.cal-content { max-width: 1100px; margin: 0 auto; padding: 12px 16px 28px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cal-weekhead { margin-bottom: 6px; }
.cal-wd { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); padding: 4px 0; }

.cal-cell {
  min-height: 96px; background: var(--md-sys-color-surface);
  border-radius: 12px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden;
  cursor: pointer;   /* click su area vuota → nuovo appuntamento in quel giorno */
}
.cal-cell:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 4%, var(--md-sys-color-surface)); }
.s-surface-dark .cal-cell { background: #16130B; }
.cal-cell.is-out { opacity: 0.45; }
.cal-cell.is-today { outline: 2px solid var(--md-sys-color-primary); }
.cal-daynum { font-size: 12px; font-weight: 600; color: var(--md-sys-color-on-surface-variant); align-self: flex-end; }
.cal-cell.is-today .cal-daynum { color: var(--md-sys-color-primary); }

.cal-items { display: flex; flex-direction: column; gap: 3px; min-height: 0; }
.cal-chip {
  display: flex; align-items: center; gap: 4px; width: 100%; text-align: left;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  border: none; border-left: 3px solid var(--c); border-radius: 5px;
  padding: 2px 5px; cursor: pointer; font-family: inherit; font-size: 11px;
  color: var(--md-sys-color-on-surface); overflow: hidden;
}
.cal-chip:hover { background: color-mix(in srgb, var(--c) 28%, transparent); }
.cal-chip.is-done { opacity: 0.5; text-decoration: line-through; }
.cal-chip-ic { flex: 0 0 auto; color: var(--c); }
.cal-chip-time { font-weight: 700; flex: 0 0 auto; }
.cal-chip-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-chip-proj { color: var(--md-sys-color-on-surface-variant); opacity: 0.75; }
.cal-more { font-size: 10px; font-weight: 600; color: var(--md-sys-color-on-surface-variant); padding-left: 4px; }

.cal-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; padding: 0 4px; }
.cal-leg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--md-sys-color-on-surface-variant); }
.cal-leg i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
</style>
