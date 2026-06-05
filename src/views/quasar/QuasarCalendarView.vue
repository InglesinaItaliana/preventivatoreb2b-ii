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
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
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

// vista corrente + cursore (giorno di riferimento)
type CalView = 'mese' | 'settimana' | 'giorno'
const view = ref<CalView>('mese')
const viewTabs = [
  { id: 'mese',      label: 'Mese',      icon: 'calendar_month' },
  { id: 'settimana', label: 'Settimana', icon: 'calendar_view_week' },
  { id: 'giorno',    label: 'Giorno',    icon: 'calendar_view_day' },
]
const cursor = ref(new Date())

function addDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function startOfWeek(d: Date): Date { return addDays(d, -((d.getDay() + 6) % 7)) }   // lunedì

function prev() {
  if (view.value === 'mese') cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1)
  else cursor.value = addDays(cursor.value, view.value === 'settimana' ? -7 : -1)
}
function next() {
  if (view.value === 'mese') cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 1)
  else cursor.value = addDays(cursor.value, view.value === 'settimana' ? 7 : 1)
}
function goToday() { cursor.value = new Date() }

const periodLabel = computed(() => {
  if (view.value === 'mese') return cursor.value.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  if (view.value === 'giorno') return cursor.value.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const s = startOfWeek(cursor.value), e = addDays(s, 6)
  return `${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('it-IT', { month: 'short' })}`
})

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

// Settimana: 7 giorni dal lunedì che contiene il cursore.
const weekDays = computed(() => {
  const start = startOfWeek(cursor.value)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    return { date: d, inMonth: true, today: d.getTime() === today.getTime(), key: dayKey(d) }
  })
})
const cursorKey = computed(() => dayKey(cursor.value))

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

const periodTotal = computed(() => {
  if (view.value === 'giorno') return itemsOf(cursorKey.value).length
  const days = view.value === 'settimana' ? weekDays.value : gridDays.value.filter(g => g.inMonth)
  return days.reduce((n, g) => n + itemsOf(g.key).length, 0)
})
const periodNoun = computed(() => view.value === 'giorno' ? 'oggi' : view.value === 'settimana' ? 'questa settimana' : 'questo mese')
const dayTitle = computed(() => cursor.value.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

// griglia Mese (42 celle) o Settimana (7); la vista Giorno è una lista a parte.
const displayDays = computed(() => view.value === 'settimana' ? weekDays.value : gridDays.value)
const cellMax = computed(() => view.value === 'settimana' ? 8 : 3)
</script>

<template>
  <div class="cal s-scope-quasar" ref="scrollEl">
    <MdPageHeader
      title="Calendario"
      :subtitle="loading ? 'Caricamento…' : `${periodTotal} elementi ${periodNoun}`"
      sticky borderless :hidden="headerHidden"
    >
      <template #tools>
        <div class="cal-tools">
          <CepheidViewSwitcher labels :model-value="view" :tabs="viewTabs" @update:model-value="(v) => (view = v as CalView)" />
          <div class="cal-nav">
            <button class="cal-navbtn" aria-label="Precedente" @click="prev"><MIcon name="chevron_left" :size="20" /></button>
            <span class="cal-month">{{ periodLabel }}</span>
            <button class="cal-navbtn" aria-label="Successivo" @click="next"><MIcon name="chevron_right" :size="20" /></button>
            <button class="cal-today" @click="goToday">Oggi</button>
            <button class="cal-new" @click="newAppointment()"><MIcon name="add" :size="16" /> Appuntamento</button>
          </div>
        </div>
      </template>
    </MdPageHeader>

    <div class="cal-content">
      <!-- ── MESE / SETTIMANA: griglia ── -->
      <template v-if="view !== 'giorno'">
        <div class="cal-grid cal-weekhead">
          <div v-for="w in WEEKDAYS" :key="w" class="cal-wd">{{ w }}</div>
        </div>
        <div class="cal-grid cal-body" :class="{ 'is-week': view === 'settimana' }">
          <div
            v-for="g in displayDays"
            :key="g.key"
            class="cal-cell"
            :class="{ 'is-out': !g.inMonth, 'is-today': g.today }"
            @click="newAppointment(g.date)"
          >
            <span class="cal-daynum">{{ g.date.getDate() }}</span>
            <div class="cal-items">
              <button
                v-for="it in itemsOf(g.key).slice(0, cellMax)"
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
              <span v-if="itemsOf(g.key).length > cellMax" class="cal-more" @click.stop>+{{ itemsOf(g.key).length - cellMax }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── GIORNO: lista ── -->
      <div v-else class="cal-day">
        <div class="cal-day-head">{{ dayTitle }}</div>
        <div v-if="!itemsOf(cursorKey).length" class="cal-day-empty">Nessun impegno. <button class="cal-day-add" @click="newAppointment(cursor)">+ Aggiungi appuntamento</button></div>
        <button
          v-for="it in itemsOf(cursorKey)"
          :key="it.id"
          class="cal-day-item"
          :class="{ 'is-done': it.done }"
          :style="{ '--c': it.color }"
          @click="openItem(it)"
        >
          <MIcon :name="iconOf(it.kind)" :size="18" class="cal-di-ic" />
          <span class="cal-di-time">{{ it.allDay ? 'Tutto il giorno' : (timeOf(it.start) + (it.end ? '–' + timeOf(it.end) : '')) }}</span>
          <span class="cal-di-title">{{ it.title }}</span>
          <span v-if="it.projectName" class="cal-di-proj">{{ it.projectName }}</span>
        </button>
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
.cal-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* Settimana: celle più alte (più item visibili) */
.cal-body.is-week .cal-cell { min-height: 180px; }

/* Vista Giorno */
.cal-day { max-width: 720px; background: var(--md-sys-color-surface); border-radius: 14px; padding: 14px 16px; }
.s-surface-dark .cal-day { background: #16130B; }
.cal-day-head { font-size: 15px; font-weight: 700; text-transform: capitalize; margin-bottom: 12px; }
.cal-day-empty { color: var(--md-sys-color-on-surface-variant); font-size: 14px; padding: 12px 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cal-day-add { background: none; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-full); padding: 6px 12px; font-family: inherit; font-size: 13px; cursor: pointer; color: var(--md-sys-color-primary); }
.cal-day-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: color-mix(in srgb, var(--c) 10%, transparent); border: none; border-left: 4px solid var(--c); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; font-family: inherit; font-size: 14px; color: var(--md-sys-color-on-surface); }
.cal-day-item:hover { background: color-mix(in srgb, var(--c) 20%, transparent); }
.cal-day-item.is-done { opacity: 0.5; text-decoration: line-through; }
.cal-di-ic { color: var(--c); flex: 0 0 auto; }
.cal-di-time { font-weight: 700; font-size: 12px; min-width: 96px; flex: 0 0 auto; }
.cal-di-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-di-proj { font-size: 12px; color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; }
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
