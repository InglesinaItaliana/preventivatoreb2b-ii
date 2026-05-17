<script setup lang="ts">
import { ref, computed } from 'vue'
import { ListBulletIcon, RectangleGroupIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'
import { useNebulaTeam, POSITION_OPTIONS, type NebulaMember } from '../../composables/nebula/useNebulaTeam'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'

const { members, loading, updatePosition } = useNebulaTeam()
const { currentUser } = useCurrentUser()

const view          = ref<'org' | 'list'>('org')
const editingMember = ref<NebulaMember | null>(null)
const saving        = ref(false)

const isAdmin = computed(() => currentUser.value?.role === 'ADMIN')

const active = computed(() => members.value.filter(m => m.active !== false))
const all    = computed(() => members.value)

function byRole(role: string) {
  return active.value.filter(m => m.role === role)
}

function initials(m: NebulaMember) {
  return ((m.firstName?.[0] ?? '') + (m.lastName?.[0] ?? '')).toUpperCase() || '?'
}

function fullName(m: NebulaMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email
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

const roleAccent: Record<string, string> = {
  ADMIN:       '#C46030',
  COMMERCIALE: '#98A830',
  PRODUZIONE:  '#3A8C80',
  LOGISTICA:   '#7A5CA8',
}
</script>

<template>
  <div class="nb-shell">

    <!-- ── Header ── -->
    <header class="nb-header">
      <div>
        <h1 class="nb-title">Team</h1>
        <p class="nb-sub">{{ active.length }} membri attivi · {{ all.length - active.length }} inattivi</p>
      </div>
      <div class="nb-toggle">
        <button class="nb-toggle-btn" :class="{ active: view === 'org' }" @click="view = 'org'">
          <RectangleGroupIcon class="nb-toggle-icon" />
          Organigramma
        </button>
        <button class="nb-toggle-btn" :class="{ active: view === 'list' }" @click="view = 'list'">
          <ListBulletIcon class="nb-toggle-icon" />
          Lista
        </button>
      </div>
    </header>

    <div v-if="loading" class="nb-loading">Caricamento…</div>

    <!-- ── ORG CHART ── -->
    <div v-else-if="view === 'org'" class="nb-org">

      <!-- ADMIN -->
      <section v-if="byRole('ADMIN').length" class="nb-level">
        <span class="nb-level-label" :style="{ color: roleAccent.ADMIN }">ADMIN</span>
        <div class="nb-level-cards">
          <div v-for="m in byRole('ADMIN')" :key="m.email" class="nb-card">
            <div class="nb-avatar" :style="{ background: roleAccent.ADMIN }">{{ initials(m) }}</div>
            <div class="nb-card-name">{{ fullName(m) }}</div>
            <button v-if="isAdmin" class="nb-pos-trigger" @click="openEdit(m)">
              {{ m.position || 'Imposta ruolo' }}
              <PencilSquareIcon class="nb-pen-icon" />
            </button>
            <span v-else class="nb-pos-label">{{ m.position || '—' }}</span>
          </div>
        </div>
      </section>

      <div v-if="byRole('ADMIN').length" class="nb-conn-vert" />

      <!-- COMMERCIALE -->
      <section v-if="byRole('COMMERCIALE').length" class="nb-level">
        <span class="nb-level-label" :style="{ color: roleAccent.COMMERCIALE }">COMMERCIALE</span>
        <div class="nb-level-cards">
          <div v-for="m in byRole('COMMERCIALE')" :key="m.email" class="nb-card">
            <div class="nb-avatar" :style="{ background: roleAccent.COMMERCIALE }">{{ initials(m) }}</div>
            <div class="nb-card-name">{{ fullName(m) }}</div>
            <button v-if="isAdmin" class="nb-pos-trigger" @click="openEdit(m)">
              {{ m.position || 'Imposta ruolo' }}
              <PencilSquareIcon class="nb-pen-icon" />
            </button>
            <span v-else class="nb-pos-label">{{ m.position || '—' }}</span>
          </div>
        </div>
      </section>

      <!-- Connector: branch or single -->
      <template v-if="byRole('PRODUZIONE').length || byRole('LOGISTICA').length">
        <div
          v-if="byRole('PRODUZIONE').length && byRole('LOGISTICA').length"
          class="nb-conn-branch"
        />
        <div v-else class="nb-conn-vert" />
      </template>

      <!-- PRODUZIONE + LOGISTICA -->
      <div
        v-if="byRole('PRODUZIONE').length || byRole('LOGISTICA').length"
        class="nb-level-split"
      >
        <section v-if="byRole('PRODUZIONE').length" class="nb-sublevel">
          <div class="nb-sublevel-stub" />
          <span class="nb-level-label" :style="{ color: roleAccent.PRODUZIONE }">PRODUZIONE</span>
          <div class="nb-level-cards">
            <div v-for="m in byRole('PRODUZIONE')" :key="m.email" class="nb-card">
              <div class="nb-avatar" :style="{ background: roleAccent.PRODUZIONE }">{{ initials(m) }}</div>
              <div class="nb-card-name">{{ fullName(m) }}</div>
              <button v-if="isAdmin" class="nb-pos-trigger" @click="openEdit(m)">
                {{ m.position || 'Imposta ruolo' }}
                <PencilSquareIcon class="nb-pen-icon" />
              </button>
              <span v-else class="nb-pos-label">{{ m.position || '—' }}</span>
            </div>
          </div>
        </section>

        <section v-if="byRole('LOGISTICA').length" class="nb-sublevel">
          <div class="nb-sublevel-stub" />
          <span class="nb-level-label" :style="{ color: roleAccent.LOGISTICA }">LOGISTICA</span>
          <div class="nb-level-cards">
            <div v-for="m in byRole('LOGISTICA')" :key="m.email" class="nb-card">
              <div class="nb-avatar" :style="{ background: roleAccent.LOGISTICA }">{{ initials(m) }}</div>
              <div class="nb-card-name">{{ fullName(m) }}</div>
              <button v-if="isAdmin" class="nb-pos-trigger" @click="openEdit(m)">
                {{ m.position || 'Imposta ruolo' }}
                <PencilSquareIcon class="nb-pen-icon" />
              </button>
              <span v-else class="nb-pos-label">{{ m.position || '—' }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Empty state -->
      <div v-if="!active.length" class="nb-empty">Nessun membro attivo nel team.</div>
    </div>

    <!-- ── LIST VIEW ── -->
    <div v-else class="nb-list">
      <div v-for="m in all" :key="m.email" class="nb-list-card" :class="{ inactive: !m.active }">
        <div class="nb-avatar nb-avatar--lg" :style="{ background: m.active ? (roleAccent[m.role] ?? '#9B9590') : '#3A3E45' }">
          {{ initials(m) }}
        </div>
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
          <p class="nb-popover-title">Ruolo per <strong>{{ editingMember.firstName }}</strong></p>
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
.nb-shell {
  font-family: 'Outfit', sans-serif;
  background: var(--s-bg);
  color: var(--s-text);
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Header ── */
.nb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 32px 20px;
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.nb-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 0 0 2px;
}

.nb-sub {
  font-size: 12px;
  color: var(--s-text-dim);
}

.nb-toggle {
  display: flex;
  gap: 4px;
  background: var(--s-border);
  padding: 3px;
  border-radius: 10px;
}

.nb-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  background: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--s-text-dim);
  font-family: 'Outfit', sans-serif;
  cursor: pointer;
  transition: all 0.15s;
}

.nb-toggle-btn.active {
  background: var(--s-sidebar);
  color: var(--s-text);
}

.nb-toggle-icon { width: 14px; height: 14px; }

.nb-loading, .nb-empty {
  text-align: center;
  color: var(--s-text-dim);
  font-size: 13px;
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
  font-size: 10px;
  font-weight: 700;
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

/* ── Member card (org) ── */
.nb-card {
  width: 118px;
  background: var(--s-sidebar);
  border: 1px solid var(--s-border);
  border-radius: 14px;
  padding: 18px 12px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: border-color 0.15s;
}

.nb-card:hover { border-color: #C46030; }

.nb-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.nb-avatar--lg {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.nb-card-name {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.3;
  color: var(--s-text);
}

.nb-pos-trigger {
  display: flex;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  font-size: 10px;
  color: var(--s-text-dim);
  font-family: 'Outfit', sans-serif;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
  transition: background 0.12s, color 0.12s;
  text-align: center;
}

.nb-pos-trigger:hover { background: var(--s-border); color: #C46030; }

.nb-pen-icon { width: 10px; height: 10px; opacity: 0.6; }

.nb-pos-label {
  font-size: 10px;
  color: var(--s-text-dim);
  text-align: center;
}

/* ── Connectors ── */
.nb-conn-vert {
  width: 1px;
  height: 28px;
  background: var(--s-border);
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
  background: var(--s-border);
}

.nb-conn-branch::after {
  content: '';
  position: absolute;
  top: 20px;
  left: 25%;
  right: 25%;
  height: 1px;
  background: var(--s-border);
}

/* ── Split level ── */
.nb-level-split {
  display: flex;
  justify-content: center;
  gap: 80px;
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
  background: var(--s-border);
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
  background: var(--s-sidebar);
  border: 1px solid var(--s-border);
  border-radius: 12px;
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.nb-list-card:hover { border-color: #C4603050; }
.nb-list-card.inactive { opacity: 0.45; }

.nb-list-info {
  flex: 1;
  min-width: 0;
}

.nb-list-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.nb-list-pos {
  font-size: 12px;
  color: #C46030;
  margin-top: 1px;
}

.nb-list-meta {
  font-size: 11px;
  color: var(--s-text-dim);
  margin-top: 3px;
}

.nb-badge-inactive {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: var(--s-border);
  color: var(--s-text-dim);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.nb-role-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid;
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.nb-list-edit {
  background: none;
  border: none;
  color: var(--s-text-dim);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}

.nb-list-edit:hover { background: var(--s-border); color: #C46030; }

/* ── Position editor ── */
.nb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.nb-popover {
  background: var(--s-sidebar);
  border: 1px solid var(--s-border);
  border-radius: 16px;
  padding: 24px;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
}

.nb-popover-title {
  font-size: 13px;
  color: var(--s-text-dim);
  margin-bottom: 16px;
}

.nb-pos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 12px;
}

.nb-pos-opt {
  background: var(--s-bg);
  border: 1px solid var(--s-border);
  color: var(--s-text);
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
}

.nb-pos-opt:hover { border-color: #C46030; color: #C46030; }
.nb-pos-opt.selected { background: #C4603018; border-color: #C46030; color: #C46030; }

.nb-pos-clear {
  width: 100%;
  background: none;
  border: 1px solid var(--s-border);
  color: var(--s-text-dim);
  font-family: 'Outfit', sans-serif;
  font-size: 12px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
}

.nb-pos-clear:hover { border-color: #C8521A; color: #C8521A; }
</style>
