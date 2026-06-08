<script setup lang="ts">
/**
 * QUASAR · Calendario (EPHEMERIS) — B2: vista Mese.
 * Pesca le entità datate da useCalendarItems (task/deliverable all-day; gli
 * appuntamenti veri arrivano in B3) e le dispone in una griglia mensile M3,
 * lunedì-prima. Ogni chip è cliccabile → deep-link al modulo d'origine.
 */
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
import { useCalendarItems, type CalendarItem } from '../../composables/quasar/useCalendarItems'
import { useTeamMembers } from '../../composables/sidera/useTeamMembers'
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'
import QuasarAppointmentModal from '../../components/quasar/QuasarAppointmentModal.vue'
import QuasarItemDetail from '../../components/quasar/QuasarItemDetail.vue'

const router = useRouter()
const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { items, loading } = useCalendarItems()
const { members } = useTeamMembers()

// ── Filtro per sorgente: Tutto / QUASAR (appuntamenti+obiettivi) / CEPHEID (azioni+deliverable)
type SourceFilter = 'all' | 'quasar' | 'cepheid' | 'nebula'
const sourceFilter = ref<SourceFilter>('all')
const filterTabs = [
  { id: 'all',     label: 'Tutto',   icon: 'apps' },
  { id: 'quasar',  label: 'QUASAR',  icon: 'event' },
  { id: 'cepheid', label: 'CEPHEID', icon: 'check_circle' },
  { id: 'nebula',  label: 'NEBULA',  icon: 'directions_car' },
]
const visibleItems = computed(() =>
  sourceFilter.value === 'all' ? items.value : items.value.filter(i => i.source === sourceFilter.value),
)

// ── CRUD appuntamenti (B3) ───────────────────────────────────────────────────
const apptOpen = ref(false)
const apptEdit = ref<CalendarItem | null>(null)
const apptDate = ref<Date | null>(null)
function newAppointment(date?: Date) { apptEdit.value = null; apptDate.value = date ?? null; apptOpen.value = true }
function editAppointment(it: CalendarItem) { apptEdit.value = it; apptDate.value = null; apptOpen.value = true }

// Trigger dal FAB mobile del layout (vedi SideraLayout.onFabTrigger 'new-appointment').
const newAppointmentTick = inject<Ref<number>>('quasar-new-appointment-tick', null as any)
if (newAppointmentTick) watch(newAppointmentTick, () => newAppointment())
onMounted(() => {
  if (sessionStorage.getItem('quasar-pending-new-appointment') === '1') {
    sessionStorage.removeItem('quasar-pending-new-appointment')
    nextTick(() => newAppointment())
  }
})

// vista corrente + cursore (giorno di riferimento)
type CalView = 'mese' | 'settimana' | 'giorno' | 'agenda'
const view = ref<CalView>('mese')
const viewTabs = [
  { id: 'mese',      label: 'Mese',      icon: 'calendar_month' },
  { id: 'settimana', label: 'Settimana', icon: 'calendar_view_week' },
  { id: 'giorno',    label: 'Giorno',    icon: 'calendar_view_day' },
  { id: 'agenda',    label: 'Agenda',    icon: 'view_agenda' },
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
  if (view.value === 'agenda') return 'Prossimi impegni'
  const s = startOfWeek(cursor.value), e = addDays(s, 6)
  return `${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('it-IT', { month: 'short' })}`
})

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calendarDayKey(it: CalendarItem): string {
  if (it.allDay) {
    const d = it.start
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  return dayKey(it.start)
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
  for (const it of visibleItems.value) {
    const k = calendarDayKey(it)
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
// Click su un item → popup di DETTAGLIO (read-only). Da lì: "Modifica" (appuntamento
// → modale edit) o "Apri in CEPHEID" (task/deliverable).
const detailOpen = ref(false)
const detailItem = ref<CalendarItem | null>(null)
function openItem(it: CalendarItem) { detailItem.value = it; detailOpen.value = true }
function onDetailEdit(it: CalendarItem) {
  detailOpen.value = false
  if (it.kind === 'appointment') editAppointment(it)
  else router.push(it.link)
}
function iconOf(kind: CalendarItem['kind']): string {
  // CEPHEID distinto per icona: check = azioni/task, scatola = deliverable.
  // QUASAR: event = appuntamento, flag = obiettivo.
  if (kind === 'vehicle_deadline') return 'directions_car'
  if (kind === 'deliverable') return 'inventory_2'
  if (kind === 'appointment') return 'event'
  if (kind === 'goal') return 'flag'
  return 'check_circle'
}

const periodTotal = computed(() => {
  if (view.value === 'agenda') return agendaDays.value.reduce((n, g) => n + g.items.length, 0)
  if (view.value === 'giorno') return itemsOf(cursorKey.value).length
  const days = view.value === 'settimana' ? weekDays.value : gridDays.value.filter(g => g.inMonth)
  return days.reduce((n, g) => n + itemsOf(g.key).length, 0)
})
const periodNoun = computed(() =>
  view.value === 'agenda' ? 'in arrivo' : view.value === 'giorno' ? 'oggi' : view.value === 'settimana' ? 'questa settimana' : 'questo mese')
const dayTitle = computed(() => cursor.value.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

// ── Griglia a fasce orarie (Settimana / Giorno) ─────────────────────────────
const HOUR_START = 7, HOUR_END = 22, HOUR_H = 44   // px per ora
const hours = computed(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i))
const tgDays = computed(() => {
  if (view.value === 'giorno') {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const d = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), cursor.value.getDate())
    return [{ date: d, today: d.getTime() === t.getTime(), key: dayKey(d) }]
  }
  return weekDays.value
})
const gridColsStyle = computed(() => ({ gridTemplateColumns: `54px repeat(${tgDays.value.length}, minmax(0, 1fr))` }))
const tgGutterStyle = { gridColumn: '1' }
function tgColStyle(index: number) { return { gridColumn: String(index + 2) } }
function allDayOf(key: string) { return itemsOf(key).filter(i => i.allDay) }
function timedOf(key: string) { return itemsOf(key).filter(i => !i.allDay) }
function eventStyle(it: CalendarItem) {
  const startMin = it.start.getHours() * 60 + it.start.getMinutes()
  const endMin = it.end ? it.end.getHours() * 60 + it.end.getMinutes() : startMin + 60
  const top = Math.max(0, (startMin - HOUR_START * 60) / 60 * HOUR_H)
  const height = Math.max(20, (Math.max(endMin, startMin + 30) - startMin) / 60 * HOUR_H)
  return { top: `${top}px`, height: `${height}px` }
}
function newAtSlot(date: Date, hour: number) {
  newAppointment(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0))
}

// ── Agenda: impegni da oggi in poi, raggruppati per giorno ───────────────────
const agendaDays = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const groups = new Map<string, { date: Date; key: string; items: CalendarItem[] }>()
  for (const it of visibleItems.value) {
    const d = new Date(it.start.getFullYear(), it.start.getMonth(), it.start.getDate())
    if (d.getTime() < today.getTime()) continue
    const k = dayKey(d)
    const g = groups.get(k)
    if (g) g.items.push(it); else groups.set(k, { date: d, key: k, items: [it] })
  }
  const arr = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const g of arr) g.items.sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? 1 : -1))
  return arr
})
function agendaLabel(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}
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
          <div class="cal-tools__filters">
            <CepheidViewSwitcher :model-value="sourceFilter" :tabs="filterTabs" @update:model-value="(v) => (sourceFilter = v as SourceFilter)" />
          </div>
          <div class="cal-tools__view">
            <CepheidViewSwitcher :model-value="view" :tabs="viewTabs" @update:model-value="(v) => (view = v as CalView)" />
            <button class="cal-new" @click="newAppointment()"><MIcon name="add" :size="16" /> Appuntamento</button>
          </div>
        </div>
      </template>
    </MdPageHeader>

    <div class="cal-content">
      <div v-if="view !== 'agenda'" class="cal-period-nav">
        <button class="cal-navbtn" aria-label="Precedente" @click="prev"><MIcon name="chevron_left" :size="20" /></button>
        <span class="cal-month">{{ periodLabel }}</span>
        <button class="cal-navbtn" aria-label="Successivo" @click="next"><MIcon name="chevron_right" :size="20" /></button>
        <button class="cal-today" @click="goToday">Oggi</button>
      </div>
      <!-- ── MESE: griglia mensile ── -->
      <template v-if="view === 'mese'">
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
                <MIcon :name="iconOf(it.kind)" :size="12" filled class="cal-chip-ic" />
                <span v-if="!it.allDay" class="cal-chip-time">{{ timeOf(it.start) }}</span>
                <span class="cal-chip-text"><span class="cal-chip-title">{{ it.title }}</span><span v-if="it.projectName" class="cal-chip-proj"> · {{ it.projectName }}</span></span>
              </button>
              <span v-if="itemsOf(g.key).length > 3" class="cal-more" @click.stop>+{{ itemsOf(g.key).length - 3 }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ── SETTIMANA / GIORNO: griglia a fasce orarie ── -->
      <div v-else-if="view === 'settimana' || view === 'giorno'" class="cal-tg" :class="{ 'is-day': view === 'giorno' }">
        <div class="cal-tg-head" :style="gridColsStyle">
          <div class="cal-tg-gutter" :style="tgGutterStyle" />
          <div v-for="(d, i) in tgDays" :key="d.key" class="cal-tg-dh" :style="tgColStyle(i)" :class="{ 'is-today': d.today }">
            <span class="cal-tg-dh-wd">{{ d.date.toLocaleDateString('it-IT', { weekday: 'short' }) }}</span>
            <span class="cal-tg-dh-num">{{ d.date.getDate() }}</span>
          </div>
        </div>
        <div class="cal-tg-allday" :style="gridColsStyle">
          <div class="cal-tg-gutter cal-tg-adlabel" :style="tgGutterStyle">giorno</div>
          <div v-for="(d, i) in tgDays" :key="d.key" class="cal-tg-adcol" :style="tgColStyle(i)">
            <button v-for="it in allDayOf(d.key)" :key="it.id" class="cal-chip" :class="{ 'is-done': it.done }" :style="{ '--c': it.color }"
              :title="it.projectName ? it.title + ' · ' + it.projectName : it.title" @click="openItem(it)">
              <MIcon :name="iconOf(it.kind)" :size="12" filled class="cal-chip-ic" />
              <span class="cal-chip-text">{{ it.title }}</span>
            </button>
          </div>
        </div>
        <div class="cal-tg-body" :style="gridColsStyle">
          <div class="cal-tg-gutter" :style="tgGutterStyle">
            <div v-for="h in hours" :key="h" class="cal-tg-hr"><span v-if="h > HOUR_START">{{ h }}:00</span></div>
          </div>
          <div v-for="(d, i) in tgDays" :key="d.key" class="cal-tg-col" :style="tgColStyle(i)" :class="{ 'is-today': d.today }">
            <div v-for="h in hours" :key="h" class="cal-tg-slot" @click="newAtSlot(d.date, h)" />
            <button v-for="it in timedOf(d.key)" :key="it.id" class="cal-tg-ev" :class="{ 'is-done': it.done }"
              :style="{ ...eventStyle(it), '--c': it.color }" :title="it.title" @click.stop="openItem(it)">
              <MIcon :name="iconOf(it.kind)" :size="11" filled class="cal-tg-ev-ic" />
              <div class="cal-tg-ev-body">
                <span class="cal-tg-ev-t">{{ timeOf(it.start) }}<template v-if="it.end">–{{ timeOf(it.end) }}</template></span>
                <span class="cal-tg-ev-title">{{ it.title }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- ── AGENDA: prossimi impegni ── -->
      <div v-else class="cal-agenda">
        <div v-if="!agendaDays.length" class="cal-day-empty">Nessun impegno in arrivo. <button class="cal-day-add" @click="newAppointment()">+ Aggiungi appuntamento</button></div>
        <div v-for="g in agendaDays" :key="g.key" class="cal-ag-group">
          <div class="cal-ag-date">{{ agendaLabel(g.date) }}</div>
          <button
            v-for="it in g.items"
            :key="it.id"
            class="cal-day-item"
            :class="{ 'is-done': it.done }"
            :style="{ '--c': it.color }"
            @click="openItem(it)"
          >
            <MIcon :name="iconOf(it.kind)" :size="18" filled class="cal-di-ic" />
            <span class="cal-di-time">{{ it.allDay ? 'Tutto il giorno' : (timeOf(it.start) + (it.end ? '–' + timeOf(it.end) : '')) }}</span>
            <span class="cal-di-title">{{ it.title }}</span>
            <span v-if="it.projectName" class="cal-di-proj">{{ it.projectName }}</span>
          </button>
        </div>
      </div>

      <!-- Legenda sorgenti (QUASAR = primary, CEPHEID = oro; distinte per icona) -->
      <div class="cal-legend">
        <span class="cal-leg"><MIcon name="event" :size="15" filled style="color: var(--md-sys-color-primary)" />Appuntamenti</span>
        <span class="cal-leg"><MIcon name="flag" :size="15" filled style="color: var(--md-sys-color-primary)" />Obiettivi</span>
        <span class="cal-leg"><MIcon name="check_circle" :size="15" filled style="color: #D4A020" />Azioni</span>
        <span class="cal-leg"><MIcon name="inventory_2" :size="15" filled style="color: #D4A020" />Deliverable</span>
      </div>
    </div>

    <QuasarItemDetail
      v-model:open="detailOpen"
      :item="detailItem"
      :members="members"
      @edit="onDetailEdit"
    />

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
  overflow-x: clip;
  max-width: 100%;
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .cal { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .cal { --page-bg: #0E0C07; } }

:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) { background: #FFF8F0; }
.s-surface-dark :deep(.md-page-header.is-sticky) { background: #16130B; }
@media (prefers-color-scheme: dark) { :deep(.md-page-header.is-sticky) { background: #16130B; } }
@media (min-width: 1024px) { :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 540px)) 18px; } }

.cal-navbtn, .cal-today {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full); cursor: pointer;
  color: var(--md-sys-color-on-surface); font-family: inherit;
}
.cal-navbtn { width: 32px; height: 32px; }
.cal-today { height: 32px; padding: 0 14px; font-size: 13px; font-weight: 600; border-radius: var(--md-sys-shape-corner-small); }
.cal-navbtn:hover, .cal-today:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent); }
.cal-period-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 12px;
}
.cal-new {
  display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 14px;
  border: none; border-radius: var(--md-sys-shape-corner-small); cursor: pointer;
  background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);
  font-family: inherit; font-size: 13px; font-weight: 600;
}
.cal-new:hover { background: var(--md-sys-color-primary-hover, var(--md-sys-color-primary)); }
.cal-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cal-tools__filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cal-tools__view { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

@media (max-width: 768px) {
  :deep(.md-page-header) {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 8px 12px;
    align-items: start;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  :deep(.md-page-header__text) {
    grid-column: 1;
    grid-row: 1 / 3;
    min-width: 0;
    align-self: center;
  }
  :deep(.md-page-header__subtitle) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :deep(.md-page-header__tools) {
    display: contents;
    min-width: 0;
  }
  .cal-tools__filters {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
  .cal-tools__view {
    grid-column: 2;
    grid-row: 2;
    justify-self: end;
  }
  .cal-new { display: none; }
}

@media (min-width: 769px) {
  .cal-tools__filters { order: 1; }
  .cal-tools__view { order: 2; }
}

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

/* ── Griglia a fasce orarie (Settimana / Giorno) ── */
.cal-tg { background: var(--md-sys-color-surface); border-radius: 14px; overflow: hidden; }
.s-surface-dark .cal-tg { background: #16130B; }
.cal-tg-head, .cal-tg-allday, .cal-tg-body { display: grid; }
.cal-tg-head { border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.cal-tg-dh { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 0; border-left: 1px solid var(--md-sys-color-outline-variant); }
.cal-tg-dh-wd { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--md-sys-color-on-surface-variant); }
.cal-tg-dh-num { font-size: 16px; font-weight: 700; }
.cal-tg-dh.is-today .cal-tg-dh-num { color: var(--md-sys-color-primary); }
.cal-tg-allday { border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.cal-tg-adlabel { font-size: 9px; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; justify-content: center; }
.cal-tg-adcol {
  border-left: 1px solid var(--md-sys-color-outline-variant);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 32px;
  align-items: stretch;
}
.cal-tg-adcol .cal-chip {
  align-items: flex-start;
  padding: 4px 6px;
  min-height: 24px;
  height: auto;
  overflow: visible;
}
.cal-tg-adcol .cal-chip-text {
  overflow: visible;
  white-space: normal;
  line-height: 1.25;
  word-break: break-word;
}
.cal-tg-body { position: relative; }
.cal-tg-hr { height: 44px; position: relative; }
.cal-tg-hr span { position: absolute; top: -7px; right: 6px; font-size: 10px; color: var(--md-sys-color-on-surface-variant); }
.cal-tg-col { position: relative; border-left: 1px solid var(--md-sys-color-outline-variant); }
.cal-tg-col.is-today { background: color-mix(in srgb, var(--md-sys-color-primary) 4%, transparent); }
.cal-tg-slot { height: 44px; box-sizing: border-box; border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 55%, transparent); cursor: pointer; }
.cal-tg-slot:first-child { border-top: none; }
.cal-tg-slot:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent); }
.cal-tg-ev {
  position: absolute; left: 2px; right: 2px; z-index: 1;
  background: color-mix(in srgb, var(--c) 22%, var(--md-sys-color-surface));
  border: none; border-left: 3px solid var(--c); border-radius: 5px;
  padding: 2px 6px; cursor: pointer; overflow: hidden;
  display: flex; flex-direction: row; align-items: flex-start; gap: 4px; text-align: left;
  font-family: inherit; color: var(--md-sys-color-on-surface);
}
.cal-tg-ev:hover { background: color-mix(in srgb, var(--c) 34%, var(--md-sys-color-surface)); }
.cal-tg-ev.is-done { opacity: .55; text-decoration: line-through; }
.cal-tg-ev-ic { flex: 0 0 auto; color: var(--c); margin-top: 1px; }
.cal-tg-ev-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.cal-tg-ev-t { font-size: 10px; font-weight: 700; }
.cal-tg-ev-title { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Agenda ── */
.cal-agenda { max-width: 720px; }
.cal-ag-group { margin-bottom: 16px; }
.cal-ag-date { font-size: 13px; font-weight: 700; text-transform: capitalize; color: var(--md-sys-color-primary); margin: 0 4px 8px; }
.cal-month { min-width: 130px; text-align: center; font-weight: 600; font-size: 14px; text-transform: capitalize; }

.cal-content { max-width: 1100px; margin: 0 auto; padding: 12px 16px 28px; width: 100%; box-sizing: border-box; }
@media (max-width: 768px) {
  .cal-tg { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
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
  display: flex; align-items: flex-start; gap: 4px; width: 100%; text-align: left;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  border: none; border-left: 3px solid var(--c); border-radius: 5px;
  padding: 3px 5px; cursor: pointer; font-family: inherit; font-size: 11px;
  color: var(--md-sys-color-on-surface); overflow: hidden;
}
.cal-chip:hover { background: color-mix(in srgb, var(--c) 28%, transparent); }
.cal-chip.is-done { opacity: 0.5; text-decoration: line-through; }
.cal-chip-ic { flex: 0 0 auto; color: var(--c); }
.cal-chip-time { font-weight: 700; flex: 0 0 auto; }
.cal-chip-text {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cal-cell .cal-chip-text {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.2;
}
.cal-chip-proj { color: var(--md-sys-color-on-surface-variant); opacity: 0.75; }
.cal-more { font-size: 10px; font-weight: 600; color: var(--md-sys-color-on-surface-variant); padding-left: 4px; }

.cal-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; padding: 0 4px; }
.cal-leg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--md-sys-color-on-surface-variant); }
.cal-leg i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
</style>
