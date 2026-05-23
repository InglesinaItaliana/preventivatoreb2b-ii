<script setup lang="ts">
/**
 * QUASAR · Attività — Registro attività in tempo reale.
 * Porting del prototipo risorseesterneperclaude/sidera-log_1.html.
 * Feed alimentato da `activityLog` (scritto dalle Cloud Functions). Piano: docs + steady-mixing-pebble.
 */
import { computed, ref } from 'vue'
import MIcon from '../../components/shared/MIcon.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useActivityLog, type ActivityEvent } from '../../composables/quasar/useActivityLog'
import { useTeamMembers, displayName } from '../../composables/sidera/useTeamMembers'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const { events, loading } = useActivityLog(100)
const { members } = useTeamMembers()

// ── Risoluzione attore ──────────────────────────────────────────────────────
// Priorità: membro del team (email/uid) → actorName (es. cliente POPS) → "Sistema".
function resolveMember(e: ActivityEvent) {
  if (e.actorEmail) return members.value.find(m => m.email === e.actorEmail) ?? null
  if (e.actorUid)   return members.value.find(m => m.uid === e.actorUid) ?? null
  return null
}
function actorLabel(e: ActivityEvent): string {
  const m = resolveMember(e)
  if (m) return displayName(m.email, members.value)
  if (e.actorName) return e.actorName
  if (e.actorEmail) return displayName(e.actorEmail, members.value)
  return 'Sistema'
}
// Override di presentazione (indipendenti dal dato storico scritto dai trigger):
// - "completato" → check ; "confermato ordine" → carrello.
function iconFor(e: ActivityEvent): string {
  if (e.eventType === 'completed') return 'check'
  if (e.eventType === 'confirmed') return 'shopping_cart'
  return e.icon
}
// Gli eventi di produzione usano il colore primario QUASAR (#98C0D0) come gli eventi "oro".
function toneFor(e: ActivityEvent): string {
  return e.eventType === 'in_produzione' ? 'gold' : e.tone
}

// ── Date helpers (port dal prototipo) ────────────────────────────────────────
const MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const WD = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function dayLabel(d: Date): string {
  const now = new Date()
  if (sameDay(d, now)) return 'Oggi'
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (sameDay(d, y)) return 'Ieri'
  const diff = Math.floor((startDay(now).getTime() - startDay(d).getTime()) / 86400000)
  if (diff < 7) return WD[d.getDay()]!
  return `${d.getDate()} ${MO[d.getMonth()]}`
}
function relTime(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'ora'
  if (min < 60) return `${min} min fa`
  const h = Math.floor(min / 60)
  if (h < 24 && sameDay(d, new Date())) return `${h} h fa`
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Raggruppa gli eventi (già ordinati desc) per etichetta-giorno.
const grouped = computed(() => {
  const out: { label: string; items: ActivityEvent[] }[] = []
  let cur: { label: string; items: ActivityEvent[] } | null = null
  for (const e of events.value) {
    const label = dayLabel(e.ts)
    if (!cur || cur.label !== label) { cur = { label, items: [] }; out.push(cur) }
    cur.items.push(e)
  }
  return out
})
</script>

<template>
  <div class="qd s-scope-quasar" ref="scrollEl">
    <div class="qd-content">
      <div class="panel">
        <MdPageHeader
          title="Registro attività"
          subtitle="tutto ciò che accade su SIDERA e POPS, in tempo reale"
          borderless
          sticky
          :hidden="headerHidden"
        />

        <div v-if="loading" class="lg-loading">
          <div v-for="i in 5" :key="i" class="lg-skel" />
        </div>

        <div v-else class="feed">
          <div class="spine" />
          <div class="live">
            <div class="rail"><span class="livedot" /></div>
            <span class="livelbl">in tempo reale</span>
          </div>

          <div v-if="!events.length" class="lg-empty">
            Nessuna attività ancora — comparirà qui in tempo reale.
          </div>

          <template v-for="g in grouped" :key="g.label">
            <div class="dayhd"><span>{{ g.label }}</span></div>
            <div v-for="e in g.items" :key="e.id" class="ev">
              <div class="rail"><div class="node" :class="toneFor(e)"><MIcon :name="iconFor(e)" :size="16" /></div></div>
              <div class="body">
                <div class="line">
                  <span class="txt"><b>{{ actorLabel(e) }}</b> {{ e.verb }} «<span class="obj">{{ e.objectLabel }}</span>»</span>
                </div>
                <div class="meta">
                  <span class="sys" :class="e.system === 'SIDERA' ? 'sidera' : 'pops'">{{ e.system }}</span>
                  · {{ relTime(e.ts) }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qd {
  font-family: 'Outfit', sans-serif;
  color: var(--md-sys-color-on-surface);
  --page-bg: #EFE7D9;
  background: var(--page-bg);
  /* Pattern Cruscotto: scroll sul root → padding-bottom 110px+safe (da SideraLayout)
     lascia spazio alla pillola fluttuante e il bg copre la zona della pillola. */
  height: 100%;
  overflow: auto;
}
.s-surface-dark .qd { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) { .qd { --page-bg: #0E0C07; } }

.qd-content { padding: 16px; }
@media (min-width: 1024px) { .qd-content { padding: 24px 40px; } }

.panel {
  max-width: 560px;
  margin: 0 auto;
  background: #FFF8F0;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
  padding: 14px 16px 22px;
}
.s-surface-dark .panel { background: #16130B; }
@media (prefers-color-scheme: dark) { .panel { background: #16130B; } }
.panel :deep(.md-page-header) { background: transparent; padding: 4px 2px 12px; }

/* ── Feed ── */
.feed { position: relative; }
.spine {
  position: absolute; left: 18px; top: 6px; bottom: 14px; width: 2px;
  transform: translateX(-50%); background: var(--md-sys-color-outline-variant); z-index: 0;
}

.live { display: flex; align-items: center; height: 30px; position: relative; z-index: 1; margin-bottom: 4px; }
.live .rail { width: 36px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.livedot { position: relative; width: 10px; height: 10px; border-radius: 50%; background: var(--md-sys-color-primary); }
.livedot::after {
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: var(--md-sys-color-primary); animation: lgpulse 2.2s ease-out infinite;
}
@keyframes lgpulse { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(3.2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .livedot::after { animation: none; } }
.livelbl { font-size: 11px; font-weight: 500; letter-spacing: .6px; text-transform: uppercase; color: var(--md-sys-color-primary); }

.dayhd { display: flex; align-items: center; gap: 10px; margin: 14px 0 8px; padding-left: 36px; position: relative; z-index: 1; }
.dayhd span { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }
.dayhd::after { content: ''; flex: 1; height: 1px; background: var(--md-sys-color-outline-variant); opacity: .5; }

.ev { display: flex; gap: 0; position: relative; z-index: 1; padding: 5px 0; animation: lgin .45s ease backwards; }
@keyframes lgin { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ev { animation: none; } }
.ev .rail { width: 36px; flex: 0 0 auto; display: flex; justify-content: center; align-self: flex-start; }
.node { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; background: var(--md-sys-color-surface); }
.node.gold { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.node.neutral { background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant); border: 1px solid var(--md-sys-color-outline-variant); }
.node.red { background: #E5534B; color: #fff; }
.s-surface-dark .node.red { color: #3a0a06; }

.body { flex: 1; min-width: 0; padding-bottom: 2px; }
.line { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.txt { font-size: 13.5px; line-height: 1.35; color: var(--md-sys-color-on-surface-variant); }
.txt b { color: var(--md-sys-color-on-surface); font-weight: 500; }
.obj { color: var(--md-sys-color-on-surface); }
.meta { display: flex; align-items: center; gap: 7px; margin: 3px 0 0; font-size: 11px; color: var(--md-sys-color-on-surface-variant); }
.sys { font-size: 9px; font-weight: 600; letter-spacing: .7px; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
/* badge col colore-accento del sistema: SIDERA oro tenue #D4C498, POPS amber #FBBF24 */
.sys.sidera { background: color-mix(in srgb, #D4C498 28%, transparent); color: #8a7633; }
.sys.pops { background: color-mix(in srgb, #FBBF24 26%, transparent); color: #9a6b0c; }
.s-surface-dark .sys.sidera { color: #D4C498; }
.s-surface-dark .sys.pops { color: #FBBF24; }

/* ── Loading / vuoto ── */
.lg-loading { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
.lg-skel { height: 40px; border-radius: 10px; background: var(--md-sys-color-surface-variant); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.lg-empty { font-size: 13px; color: var(--md-sys-color-on-surface-variant); padding: 18px 0 6px 36px; }
</style>
