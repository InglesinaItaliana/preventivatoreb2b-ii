<script setup lang="ts">
import { ref, computed } from 'vue'
import { PencilSquareIcon } from '@heroicons/vue/24/outline'
import { useNebulaTeam, POSITION_OPTIONS, CATEGORY_OPTIONS, type NebulaMember } from '../../composables/nebula/useNebulaTeam'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import MdPageHeader from '../../components/shared/MdPageHeader.vue'
import { useAutoHideHeader } from '../../composables/shared/useAutoHideHeader'
// View-switcher pillola riutilizzato da CEPHEID Azioni/Progetti (vive sotto
// components/cepheid/ ma è agnostico — usa solo MIcon + token M3).
import CepheidViewSwitcher from '../../components/cepheid/CepheidViewSwitcher.vue'

const scrollEl = ref<HTMLElement | null>(null)
const { hidden: headerHidden } = useAutoHideHeader(scrollEl)

const viewTabs: { id: 'org' | 'list'; label: string; icon: string }[] = [
  { id: 'org',  label: 'Organigramma', icon: 'account_tree' },
  { id: 'list', label: 'Lista',        icon: 'list' },
]

const { members, loading, updatePosition, updateCategory } = useNebulaTeam()
const { currentUser } = useCurrentUser()

const view          = ref<'org' | 'list'>('org')
const editingMember = ref<NebulaMember | null>(null)
const saving        = ref(false)

const isAdmin = computed(() => currentUser.value?.role === 'ADMIN')

const active = computed(() => members.value.filter(m => m.active !== false))
const all    = computed(() => members.value)

// Organigramma raggruppato per CATEGORIA (6 reparti), piramide a 3 livelli.
const LEVELS: string[][] = [
  ['direzione'],                              // livello 1
  ['amministrazione', 'commerciale'],         // livello 2 — uffici
  ['tecnico', 'produzione', 'logistica'],     // livello 3 — operativi
]

const CATEGORY_ACCENT: Record<string, string> = {
  direzione:       '#BF592A',
  amministrazione: '#4A6B8A',
  commerciale:     '#707D35',
  tecnico:         '#308478',
  produzione:      '#C8821A',
  logistica:       '#7A5CA8',
}

function byCategory(cat: string) {
  return active.value.filter(m => (m.category || 'amministrazione') === cat)
}

function catLabel(cat: string) {
  return CATEGORY_OPTIONS.find(c => c.key === cat)?.label ?? cat
}

function levelHasMembers(li: number) {
  return (LEVELS[li] ?? []).some(c => byCategory(c).length > 0)
}

function fullName(m: NebulaMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email
}

// Props per <StarAvatar> da un membro NEBULA (seed=uid, forma=category, colore=hueIndex).
function memberStar(m: NebulaMember) {
  return {
    seed: m.uid || m.email,
    category: m.category || 'amministrazione',
    hueIndex: m.hueIndex,
  }
}

function openEdit(m: NebulaMember) {
  if (!isAdmin.value) return
  editingMember.value = { ...m }
}

async function confirmPosition(pos: string) {
  if (!editingMember.value) return
  saving.value = true
  await updatePosition(editingMember.value.email, pos)
  saving.value = false
  editingMember.value = null
}

async function confirmCategory(cat: string) {
  if (!editingMember.value) return
  saving.value = true
  await updateCategory(editingMember.value.email, cat)
  editingMember.value.category = cat   // riflette la selezione nel popover
  saving.value = false
}

// Role accents mappati su tonal palettes M3 dei moduli con dominio semantico
// affine (vedi docs/ATLAS.md sez. 14). LOGISTICA resta hex custom: non esiste
// un modulo galattico con accent viola.
const roleAccent: Record<string, string> = {
  ADMIN:       '#BF592A',  // var(--md-ref-palette-nebula-50)  — modulo NEBULA stesso
  COMMERCIALE: '#707D35',  // var(--md-ref-palette-nova-50)    — palette olive M3
  PRODUZIONE:  '#308478',  // var(--md-ref-palette-pulsar-50)  — palette teal M3
  LOGISTICA:   '#7A5CA8',  // custom, nessun modulo viola
}
</script>

<template>
  <div class="nb-shell" ref="scrollEl">

    <!-- ── Header (MdPageHeader: stile coerente con NEBULA-DOCS / CEPHEID Progetti) ── -->
    <MdPageHeader
      title="Squadra"
      :subtitle="`${active.length} membri attivi · ${all.length - active.length} inattivi`"
      sticky
      :hidden="headerHidden"
    >
      <template #tools>
        <CepheidViewSwitcher
          :model-value="view"
          :tabs="viewTabs"
          @update:model-value="(v) => (view = v as 'org' | 'list')"
        />
      </template>
    </MdPageHeader>

    <div v-if="loading" class="nb-loading">Caricamento…</div>

    <!-- ── ORG CHART (piramide per categoria/reparto, 3 livelli) ── -->
    <div v-else-if="view === 'org'" class="nb-org">

      <template v-for="(level, li) in LEVELS" :key="li">
        <!-- connettore verticale tra un livello popolato e il precedente -->
        <div v-if="li > 0 && levelHasMembers(li) && levelHasMembers(li - 1)" class="nb-conn-vert" />

        <div v-if="levelHasMembers(li)" class="nb-level-split">
          <template v-for="cat in level" :key="cat">
            <section v-if="byCategory(cat).length" class="nb-sublevel">
              <div v-if="li > 0" class="nb-sublevel-stub" />
              <span class="nb-level-label" :style="{ color: CATEGORY_ACCENT[cat] }">{{ catLabel(cat) }}</span>
              <div class="nb-level-cards">
                <div v-for="m in byCategory(cat)" :key="m.email" class="nb-card">
                  <StarAvatar v-bind="memberStar(m)" :size="42" />
                  <div class="nb-card-name">{{ fullName(m) }}</div>
                  <button v-if="isAdmin" class="nb-pos-trigger" @click="openEdit(m)">
                    {{ m.position || 'Imposta ruolo' }}
                    <PencilSquareIcon class="nb-pen-icon" />
                  </button>
                  <span v-else class="nb-pos-label">{{ m.position || '—' }}</span>
                </div>
              </div>
            </section>
          </template>
        </div>
      </template>

      <!-- Empty state -->
      <div v-if="!active.length" class="nb-empty">Nessun membro attivo nel team.</div>
    </div>

    <!-- ── LIST VIEW ── -->
    <div v-else class="nb-list">
      <div v-for="m in all" :key="m.email" class="nb-list-card" :class="{ inactive: !m.active }">
        <StarAvatar v-bind="memberStar(m)" :size="40" />
        <div class="nb-list-info">
          <div class="nb-list-name">
            {{ fullName(m) }}
            <span v-if="!m.active" class="nb-badge-inactive">inattivo</span>
          </div>
          <div class="nb-list-pos">{{ m.position || '—' }}</div>
          <div class="nb-list-meta">
            <span>{{ m.email }}</span>
            <span v-if="m.phone">· {{ m.phone }}</span>
          </div>
        </div>
        <span class="nb-role-badge" :style="{ color: roleAccent[m.role] ?? '#9B9590', borderColor: (roleAccent[m.role] ?? '#9B9590') + '40' }">
          {{ m.role }}
        </span>
        <button v-if="isAdmin && m.active" class="nb-list-edit" @click="openEdit(m)">
          <PencilSquareIcon style="width:14px;height:14px" />
        </button>
      </div>
      <div v-if="!all.length" class="nb-empty">Nessun membro nel team.</div>
    </div>

    <!-- ── Position editor overlay ── -->
    <Teleport to="body">
      <div v-if="editingMember" class="nb-overlay" @click.self="editingMember = null">
        <div class="nb-popover">
          <p class="nb-popover-title">Avatar di <strong>{{ editingMember.firstName }}</strong></p>
          <div class="nb-cat-preview">
            <StarAvatar v-bind="memberStar(editingMember)" :size="56" />
            <span class="nb-cat-hint">La forma della stella dipende dalla categoria; il colore è stabile per persona.</span>
          </div>
          <div class="nb-pos-grid">
            <button
              v-for="c in CATEGORY_OPTIONS"
              :key="c.key"
              class="nb-pos-opt"
              :class="{ selected: editingMember.category === c.key }"
              :disabled="saving"
              @click="confirmCategory(c.key)"
            >{{ c.label }}</button>
          </div>

          <p class="nb-popover-title" style="margin-top: 20px;">Ruolo aziendale</p>
          <div class="nb-pos-grid">
            <button
              v-for="p in POSITION_OPTIONS"
              :key="p"
              class="nb-pos-opt"
              :class="{ selected: editingMember.position === p }"
              :disabled="saving"
              @click="confirmPosition(p)"
            >{{ p }}</button>
          </div>
          <button class="nb-pos-clear" :disabled="saving" @click="confirmPosition('')">
            Rimuovi ruolo
          </button>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
/* ─────────────────────────────────────────────────────────────────────
   NEBULA · Team — resa M3 (ATLAS sez. 14).
   Lo scope NEBULA è applicato al s-shell padre da SideraLayout via
   classe .s-scope-nebula, quindi var(--md-sys-color-primary) qui dentro
   risolve già al brand NEBULA on-light (#B85425).
   ───────────────────────────────────────────────────────────────────── */
.nb-shell {
  font-family: var(--md-sys-typescale-body-medium-font);
  color: var(--md-sys-color-on-surface);
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* Page-bg beige caldo (allineato a CEPHEID Progetti + NEBULA-DOCS). */
  --page-bg: #EFE7D9;
  background: var(--page-bg);
}
.s-surface-dark .nb-shell { --page-bg: #0E0C07; }
@media (prefers-color-scheme: dark) {
  .nb-shell { --page-bg: #0E0C07; }
}

/* Header MdPageHeader sticky con bg surface delle card (non page-bg).
   Stesso pattern di NebulaDocsHomeView. */
:deep(.md-page-header) { padding: 18px 16px 14px; }
:deep(.md-page-header.is-sticky) {
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
@media (min-width: 1024px) {
  :deep(.md-page-header) { padding: 24px max(40px, calc(50% - 410px)) 18px; }
}

.nb-loading, .nb-empty {
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  padding: 60px 24px;
}

/* ── Org chart ── */
.nb-org {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px 48px;
  flex: 1;
}

.nb-level {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.nb-level-label {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  font-weight: var(--md-sys-typescale-label-small-weight);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 14px;
}

.nb-level-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

/* ── Member card (org) ── allineata alle card NEBULA-DOCS / CEPHEID Progetti */
.nb-card {
  width: 118px;
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
  padding: 18px 12px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              box-shadow   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.nb-card:hover {
  border-color: color-mix(in srgb, var(--md-sys-color-primary) 30%, var(--md-sys-color-outline-variant));
  background: color-mix(in srgb, var(--md-sys-color-primary) 4%, var(--md-sys-color-surface));
  box-shadow: var(--md-sys-elevation-level-2);
}

.nb-avatar {
  width: 42px;
  height: 42px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: var(--md-sys-typescale-label-large-size);
  line-height: 1;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.nb-avatar--lg {
  width: 40px;
  height: 40px;
  font-size: var(--md-sys-typescale-label-large-size);
}

.nb-card-name {
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: 1.3;
  font-weight: var(--md-sys-typescale-label-medium-weight);
  text-align: center;
  color: var(--md-sys-color-on-surface);
}

.nb-pos-trigger {
  display: flex;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  font-weight: 500;
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  text-align: center;
}

.nb-pos-trigger:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  color: var(--md-sys-color-primary);
}

.nb-pen-icon { width: 10px; height: 10px; opacity: 0.6; }

.nb-pos-label {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  color: var(--md-sys-color-on-surface-variant);
  text-align: center;
}

/* ── Connectors ── */
.nb-conn-vert {
  width: 1px;
  height: 28px;
  background: var(--md-sys-color-outline-variant);
  margin: 0 auto;
}

.nb-conn-branch {
  position: relative;
  width: 100%;
  max-width: 560px;
  height: 40px;
  flex-shrink: 0;
}

.nb-conn-branch::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 20px;
  background: var(--md-sys-color-outline-variant);
}

.nb-conn-branch::after {
  content: '';
  position: absolute;
  top: 20px;
  left: 25%;
  right: 25%;
  height: 1px;
  background: var(--md-sys-color-outline-variant);
}

/* ── Split level ── */
.nb-level-split {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 32px 56px;
  width: 100%;
}

.nb-sublevel {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.nb-sublevel-stub {
  width: 1px;
  height: 20px;
  background: var(--md-sys-color-outline-variant);
  margin: 0 auto 14px;
}

/* ── List view ── */
.nb-list {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nb-list-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 16px;
  box-shadow: var(--md-sys-elevation-level-1);
  padding: 14px 16px;
  transition: border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              background   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              box-shadow   var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.nb-list-card:hover {
  border-color: color-mix(in srgb, var(--md-sys-color-primary) 30%, var(--md-sys-color-outline-variant));
  background: color-mix(in srgb, var(--md-sys-color-primary) 4%, var(--md-sys-color-surface));
  box-shadow: var(--md-sys-elevation-level-2);
}
.nb-list-card.inactive { opacity: 0.45; }

.nb-list-info {
  flex: 1;
  min-width: 0;
}

.nb-list-name {
  font-family: var(--md-sys-typescale-title-small-font);
  font-size: var(--md-sys-typescale-title-small-size);
  line-height: var(--md-sys-typescale-title-small-line-height);
  font-weight: var(--md-sys-typescale-title-small-weight);
  letter-spacing: var(--md-sys-typescale-title-small-tracking);
  color: var(--md-sys-color-on-surface);
  display: flex;
  align-items: center;
  gap: 8px;
}

.nb-list-pos {
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  color: var(--md-sys-color-primary);
  margin-top: 1px;
}

.nb-list-meta {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  color: var(--md-sys-color-on-surface-variant);
  margin-top: 3px;
}

.nb-badge-inactive {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface-variant);
  padding: 2px 6px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  text-transform: uppercase;
}

.nb-role-badge {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid;
  padding: 3px 8px;
  border-radius: var(--md-sys-shape-corner-small);
  flex-shrink: 0;
}

.nb-list-edit {
  background: none;
  border: none;
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--md-sys-shape-corner-small);
  display: flex;
  align-items: center;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink: 0;
}

.nb-list-edit:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  color: var(--md-sys-color-primary);
}

/* ── Position editor (M3 dialog) ── */
.nb-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--md-sys-color-scrim) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: nb-overlay-fade var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
}

@keyframes nb-overlay-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.nb-popover {
  background: var(--md-sys-color-surface-container-high);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-large);
  box-shadow: var(--md-sys-elevation-level-3);
  padding: 24px;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  animation: nb-popover-pop var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate);
}

@keyframes nb-popover-pop {
  from { transform: scale(0.96); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.nb-popover-title {
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 16px;
}

.nb-cat-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.nb-cat-hint {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  color: var(--md-sys-color-on-surface-variant);
}

.nb-pos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 12px;
}

.nb-pos-opt {
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  font-weight: 500;
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  padding: 8px 10px;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
  text-align: left;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color        var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.nb-pos-opt:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  border-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-primary);
}

.nb-pos-opt.selected {
  background: var(--md-sys-color-primary-container);
  border-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary-container);
}

.nb-pos-clear {
  width: 100%;
  background: none;
  border: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  font-weight: 500;
  letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  padding: 8px;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color        var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.nb-pos-clear:hover {
  background: color-mix(in srgb, var(--md-sys-color-error) 8%, transparent);
  border-color: var(--md-sys-color-error);
  color: var(--md-sys-color-error);
}
</style>
