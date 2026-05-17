<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import MIcon from '../../components/pulsar/MIcon.vue'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarColor } from '../../composables/sidera/useTeamMembers'
import { useNotifications } from '../../composables/pulsar/useNotifications'

const route  = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { requestPermission, setupForegroundMessages } = useNotifications()

async function logout() {
  await signOut(auth)
  router.push('/cepheid/login')
}

const navItems = [
  { path: '/cepheid',          exact: true,  label: 'Azioni',   icon: 'check_circle' },
  { path: '/cepheid/projects', exact: false, label: 'Progetti', icon: 'grid_view' },
  { path: '/cepheid/due',      exact: false, label: 'Scadenze', icon: 'event_busy' },
]

// ── FAB contestuale (provide/inject ai children) ──────────────────────────
const newTaskTick    = ref(0)
const newProjectTick = ref(0)
provide('cepheid-new-task-tick',    newTaskTick)
provide('cepheid-new-project-tick', newProjectTick)

const fabKind = computed<'task' | 'project'>(() => {
  return route.path.startsWith('/cepheid/projects') ? 'project' : 'task'
})

const fabIcon = computed(() => 'add_circle')
const fabLabel = computed(() => fabKind.value === 'project' ? 'Nuovo progetto' : 'Nuova azione')

function triggerNew() {
  if (fabKind.value === 'project') {
    if (route.path === '/cepheid/projects') {
      newProjectTick.value++
    } else {
      sessionStorage.setItem('cepheid-pending-new-project', '1')
      router.push('/cepheid/projects')
    }
  } else {
    // Apre il modal nuova azione su qualunque rotta /cepheid (Azioni o Scadenze).
    // Per chi non è già su Azioni, naviga lì e apre via sessionStorage.
    if (route.path === '/cepheid' || route.path === '/cepheid/due') {
      newTaskTick.value++
    } else {
      sessionStorage.setItem('cepheid-pending-new-task', '1')
      router.push('/cepheid')
    }
  }
}

function isActive(path: string, exact: boolean) {
  return exact ? route.path === path : route.path.startsWith(path)
}

// ── PWA standalone mode (nasconde la chrome legata a SIDERA) ──────────────
const isStandalone = ref(false)
let standaloneMql: MediaQueryList | null = null
function syncStandalone() {
  isStandalone.value =
    standaloneMql?.matches === true ||
    (window.navigator as any).standalone === true
}

onMounted(async () => {
  standaloneMql = window.matchMedia('(display-mode: standalone)')
  syncStandalone()
  standaloneMql.addEventListener('change', syncStandalone)
  await requestPermission()
  await setupForegroundMessages()
})

onBeforeUnmount(() => {
  standaloneMql?.removeEventListener('change', syncStandalone)
})
</script>

<template>
  <div class="c-shell">

    <!-- ── SIDEBAR desktop ── -->
    <aside class="c-sidebar">
      <div class="c-brand">
        <svg class="c-brand-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:#D4A020">
          <circle cx="16" cy="16" r="8"   fill="currentColor" opacity="0.10"/>
          <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
            <line x1="16" y1="16" x2="9"    y2="3.4"/>
            <line x1="16" y1="16" x2="11.5" y2="10.4"/>
            <line x1="16" y1="16" x2="9"    y2="14.6"/>
            <line x1="16" y1="16" x2="2"    y2="16"/>
          </g>
          <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28"/>
          <circle cx="16" cy="16" r="2.9" fill="currentColor"/>
        </svg>
        <span class="c-brand-text">C<span class="c-brand-dot">·</span>E<span class="c-brand-dot">·</span>P<span class="c-brand-dot">·</span>H<span class="c-brand-dot">·</span>E<span class="c-brand-dot">·</span>I<span class="c-brand-dot">·</span>D</span>
      </div>

      <nav class="c-nav">
        <p class="c-section-label">Workspace</p>
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="c-nav-item"
          :class="{ 'is-active': isActive(item.path, item.exact) }"
        >
          <MIcon :name="item.icon" class="c-nav-icon" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Link a SIDERA (nascosto in PWA standalone per preservare lo scope) -->
      <div v-if="!isStandalone" class="c-sidera-section">
        <RouterLink to="/sidera" class="c-sidera-link">
          <MIcon name="open_in_new" class="c-sidera-icon" />
          <span class="c-sidera-wordmark">SIDERA</span>
        </RouterLink>
      </div>

      <!-- User -->
      <div class="c-user">
        <div
          class="c-user-avatar"
          :style="currentUser?.email ? { background: avatarColor(currentUser.email) } : {}"
        >{{ currentUser?.email ? currentUser.email[0].toUpperCase() : '?' }}</div>
        <div class="c-user-info">
          <div class="c-user-name">{{ currentUser?.email ? displayName(currentUser.email, members) : '…' }}</div>
          <div class="c-user-role">CEPHEID</div>
        </div>
        <button class="c-logout-btn" title="Esci" @click="logout">
          <MIcon name="logout" :size="16" />
        </button>
      </div>
    </aside>

    <!-- ── CONTENUTO ── -->
    <div class="c-main-wrap">

      <!-- Header solo mobile -->
      <header class="c-mobile-header">
        <button
          v-if="route.path !== '/cepheid' && route.path !== '/cepheid/projects' && route.path !== '/cepheid/due'"
          class="c-back-btn"
          @click="router.back()"
        >
          <MIcon name="arrow_back" :size="20" />
        </button>
        <div class="c-brand">
          <svg class="c-brand-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:#D4A020">
            <circle cx="16" cy="16" r="8"   fill="currentColor" opacity="0.10"/>
            <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
              <line x1="16" y1="16" x2="9"    y2="3.4"/>
              <line x1="16" y1="16" x2="11.5" y2="10.4"/>
              <line x1="16" y1="16" x2="9"    y2="14.6"/>
              <line x1="16" y1="16" x2="2"    y2="16"/>
            </g>
            <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28"/>
            <circle cx="16" cy="16" r="2.9" fill="currentColor"/>
          </svg>
          <span class="c-brand-text">C<span class="c-brand-dot">·</span>E<span class="c-brand-dot">·</span>P<span class="c-brand-dot">·</span>H<span class="c-brand-dot">·</span>E<span class="c-brand-dot">·</span>I<span class="c-brand-dot">·</span>D</span>
        </div>
      </header>

      <main class="c-main">
        <RouterView />
      </main>

      <!-- Bottom nav solo mobile -->
      <nav class="c-bottom-nav">
        <div class="c-nav-pill">
          <button
            v-for="item in navItems"
            :key="item.path"
            class="c-pill-btn"
            :class="{ 'is-active': isActive(item.path, item.exact) }"
            :aria-label="item.label"
            @click="router.push(item.path)"
          >
            <MIcon
              :name="item.icon"
              :filled="isActive(item.path, item.exact)"
              class="c-pill-icon"
            />
          </button>
        </div>

        <button
          class="c-fab-btn"
          :aria-label="fabLabel"
          :title="fabLabel"
          @click="triggerNew"
        >
          <MIcon :name="fabIcon" filled :size="28" />
        </button>
      </nav>

    </div>
  </div>
</template>

<style scoped>
.c-shell {
  height: 100vh;
  display: flex;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
  background: var(--s-bg);
  color: var(--s-text);
}

/* ── Sidebar desktop ── */
.c-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--s-sidebar);
  border-right: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
}

/* Brand unificato: usato sia in sidebar desktop che mobile header */
.c-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
}

.c-sidebar .c-brand { padding: 4px 12px 26px; }

.c-brand-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-brand-text {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--s-text);
  display: inline-block;
}

.c-brand-dot {
  font-weight: 400;
  opacity: 0.4;
  display: inline-block;
  margin: 0 0.06em;
  position: relative;
  top: -0.08em;
}

.c-nav { flex: 1; }

.c-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 12px;
  margin-bottom: 10px;
}

.c-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--s-text-dim);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  user-select: none;
  text-decoration: none;
  margin-bottom: 2px;
}

.c-nav-item:hover { background: var(--s-border); color: var(--s-text-mid); }

.c-nav-item.is-active {
  background: rgba(212, 160, 32, 0.10);
  color: #8C6A14;
}

.c-nav-item.is-active .c-nav-icon { color: #D4A020; }
.c-nav-icon { font-size: 18px; flex-shrink: 0; }

/* Link SIDERA */
.c-sidera-section {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  margin-bottom: 10px;
}

.c-sidera-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--s-green-glow);
  border: 1px solid var(--s-border);
  color: var(--s-green-text);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.c-sidera-link:hover { background: rgba(47, 107, 74, 0.12); }
.c-sidera-wordmark { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.c-sidera-icon { font-size: 14px; opacity: 0.7; }

/* User */
.c-user {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #D4A020, #8C6A14);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
}

.c-user-name { font-size: 12px; font-weight: 500; }
.c-user-role { font-size: 11px; color: var(--s-text-dim); }

.c-logout-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim);
  display: flex; align-items: center;
  padding: 3px; border-radius: 5px;
  margin-left: auto; transition: color 0.15s;
}

.c-logout-btn:hover { color: #C8521A; }

/* ── Area contenuto ── */
.c-main-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.c-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--s-bg);
}

/* Mobile: lascia spazio in fondo per la bottom bar che galleggia sopra il contenuto */
@media (max-width: 768px) {
  .c-main { padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
}

/* ── Mobile: header e bottom nav, nascosti su desktop ── */
.c-mobile-header {
  display: none;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--s-surface);
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.c-back-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); display: flex; align-items: center;
  padding: 4px; border-radius: 8px; transition: background 0.15s;
}

.c-back-btn:hover { background: var(--s-border); }

.c-bottom-nav {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px calc(30px + env(safe-area-inset-bottom));
  background: transparent;
  flex-shrink: 0;
  pointer-events: none;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
}

.c-bottom-nav > * { pointer-events: auto; }

.c-nav-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #F1EEE8;
  border-radius: 999px;
  padding: 9px 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.c-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 52px;
  border-radius: 999px;
  background: none;
  border: none;
  cursor: pointer;
  color: #D4A020;
  transition: background 0.18s ease, color 0.18s ease;
  padding: 0;
}

.c-pill-btn:hover { background: rgba(212, 160, 32, 0.10); }

.c-pill-btn.is-active {
  background: rgba(212, 160, 32, 0.22);
  color: #B8870E;
}

.c-pill-icon { font-size: 36px; }

.c-fab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66px;
  height: 66px;
  border-radius: 20px;
  background: #D4A020;
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(212, 160, 32, 0.40);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}

.c-fab-btn:hover {
  background: #B8870E;
  box-shadow: 0 4px 14px rgba(212, 160, 32, 0.50);
}

.c-fab-btn:active { transform: scale(0.96); }

/* ── Mobile ≤ 768px ── */
@media (max-width: 768px) {
  .c-sidebar       { display: none; }
  .c-mobile-header { display: flex; }
  .c-bottom-nav    { display: flex; }
}
</style>
