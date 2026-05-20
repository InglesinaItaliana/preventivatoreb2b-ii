<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import MIcon from '../../components/pulsar/MIcon.vue'
import ContextualMobileHeader from '../../components/shared/ContextualMobileHeader.vue'
import ContextualBottomNav from '../../components/shared/ContextualBottomNav.vue'
import ContextualFab from '../../components/shared/ContextualFab.vue'
import { detectScope, getScopeConfig, SCOPE_CONFIGS, type ScopeId } from './scopeConfig'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarColor } from '../../composables/sidera/useTeamMembers'
import { useChats } from '../../composables/pulsar/useChats'
import { useNotifications } from '../../composables/shared/useNotifications'

const route  = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { chats } = useChats()

// ── Adaptive mode detection (standalone / mobile viewport) ──────────────────
const isStandalone = ref(false)
const isMobileViewport = ref(false)
let standaloneMql: MediaQueryList | null = null
let mobileMql: MediaQueryList | null = null

function syncStandalone() {
  isStandalone.value = standaloneMql?.matches === true || (window.navigator as any).standalone === true
}
function syncMobile() {
  isMobileViewport.value = mobileMql?.matches === true
}

const isMobileLayout = computed(() => isStandalone.value || isMobileViewport.value)
const currentScope = computed<ScopeId>(() => detectScope(route.path))
const currentScopeConfig = computed(() => getScopeConfig(currentScope.value))

// ── FCM scope: 'sidera' (wildcard desktop) o lo scope del modulo se in mobile-layout ─
// Determinato al mount-time (non reattivo: useNotifications non supporta swap dinamico).
function pickFcmScope(): 'pulsar' | 'cepheid' | 'sidera' {
  const onMobile = window.matchMedia('(display-mode: standalone)').matches ||
                   (window.navigator as any).standalone === true ||
                   window.matchMedia('(max-width: 768px)').matches
  if (onMobile) {
    const cfg = getScopeConfig(detectScope(route.path))
    if (cfg) return cfg.notificationScope
  }
  return 'sidera'
}
const { requestPermission, notify, setupForegroundMessages } = useNotifications(pickFcmScope())

async function logout() {
  await signOut(auth)
  router.push('/')
}

// ── FAB action handlers (one per scope) ─────────────────────────────────────
// I tick reattivi sono forniti via provide/inject; i view figli del scope li ascoltano.
const newChatTick    = ref(0)
const newTaskTick    = ref(0)
const newProjectTick = ref(0)
const newGoalTick    = ref(0)
provide('pulsar-new-chat-tick',     newChatTick)
provide('cepheid-new-task-tick',    newTaskTick)
provide('cepheid-new-project-tick', newProjectTick)
provide('cepheid-new-goal-tick',    newGoalTick)

function onFabTrigger(action: 'new-chat' | 'new-task' | 'new-project' | 'new-goal' | 'none') {
  if (action === 'new-chat') {
    if (route.path === '/pulsar') {
      newChatTick.value++
    } else {
      sessionStorage.setItem('pulsar-pending-new-chat', '1')
      router.push('/pulsar')
    }
    return
  }
  if (action === 'new-task') {
    // CEPHEID FAB context-aware: in base alla route attiva, dispatcha al
    // tick appropriato. Replica la logica di CepheidLayout.triggerNew.
    const p = route.path
    if (p.startsWith('/cepheid/goal')) {
      // su /cepheid/goals o /cepheid/goal/:id
      if (p === '/cepheid/goals') {
        newGoalTick.value++
      } else {
        sessionStorage.setItem('cepheid-pending-new-goal', '1')
        router.push('/cepheid/goals')
      }
    } else if (p.startsWith('/cepheid/project/')) {
      // dentro un project detail: il componente intercetta newTaskTick
      // e apre il modal del tab attivo (Kanban / Milestone / Deliverable)
      newTaskTick.value++
    } else if (p.startsWith('/cepheid/projects')) {
      if (p === '/cepheid/projects') {
        newProjectTick.value++
      } else {
        sessionStorage.setItem('cepheid-pending-new-project', '1')
        router.push('/cepheid/projects')
      }
    } else if (p === '/cepheid' || p === '/cepheid/due') {
      newTaskTick.value++
    } else {
      sessionStorage.setItem('cepheid-pending-new-task', '1')
      router.push('/cepheid')
    }
  }
}

// Vertici Schlegel: posizioni nel viewBox 680×480
// V1 QUASAR(340,68) V2 NEBULA(155,400) V3 CEPHEID(525,400)
// V4 PULSAR(405,252) V5 NOVA(275,252) V6 MAGNETAR(340,364)
const modules = [
  {
    name: 'QUASAR',   accent: '#98C0D0',
    vx: 340, vy: 68,  vr: 10,
    items: [
      { path: '/sidera', exact: true, label: 'Cruscotto', icon: 'home' },
    ],
  },
  {
    name: 'NEBULA',   accent: '#C46030',
    vx: 155, vy: 400, vr: 10,
    items: [
      { path: '/sidera/nebula', exact: false, label: 'Team', icon: 'group' },
    ],
  },
  {
    name: 'CEPHEID',  accent: '#D4A020',
    vx: 525, vy: 400, vr: 10,
    // Single source of truth con bottom-nav mobile: stessi link CEPHEID-PWA
    // (/cepheid/*) sia nella sidebar desktop che nella pillola mobile.
    items: SCOPE_CONFIGS.cepheid.mobileNav as any[],
  },
  {
    name: 'PULSAR',   accent: '#3AAF98',
    vx: 405, vy: 252, vr: 8,
    // Single source of truth: le voci della sezione PULSAR nella sidebar
    // desktop vengono dalla stessa config del bottom-nav mobile.
    items: SCOPE_CONFIGS.pulsar.mobileNav as any[],
  },
  {
    name: 'NOVA',     accent: '#8FAB35',
    vx: 275, vy: 252, vr: 8,
    items: [
      { path: '/sidera/nova/spedizioni', exact: false, label: 'Spedizioni', icon: 'local_shipping' },
    ] as any[],
  },
  {
    name: 'MAGNETAR', accent: '#B06842',
    vx: 340, vy: 364, vr: 8,
    items: [
      { href: 'https://b2b.inglesinaitaliana.it', label: 'POPS', icon: 'open_in_new' },
    ] as any[],
  },
]

const activeModule = computed(() =>
  modules.find(m => {
    if (m.name === 'QUASAR')
      return route.path === '/sidera' || route.path === '/sidera/hub'
    return m.items.some((item: any) =>
      item.exact ? route.path === item.path : route.path.startsWith(item.path)
    )
  }) ?? null
)

const SIDERA_COLOR      = '#D4C498'
const SIDERA_COLOR_DIM  = '#D4C49880'

const isHub = computed(() => route.path === '/sidera/hub')

function vertexRadius(mod: typeof modules[0]) {
  if (isHub.value) return mod.vr
  return activeModule.value?.name === mod.name ? mod.vr * 1.5 : mod.vr
}

function vertexStyle(mod: typeof modules[0]) {
  if (isHub.value) {
    return { fill: mod.accent, stroke: mod.accent }
  }
  const active = activeModule.value?.name === mod.name
  return {
    fill:   active ? mod.accent : SIDERA_COLOR_DIM,
    stroke: active ? mod.accent : SIDERA_COLOR_DIM,
  }
}

const edgeStroke = computed(() => isHub.value ? SIDERA_COLOR : SIDERA_COLOR_DIM)

const edgeTransition = 'stroke 0.5s ease'

function isActive(path: string, exact: boolean, excludePaths?: string[]) {
  if (excludePaths?.some(ep => route.path.startsWith(ep))) return false
  return exact ? route.path === path : route.path.startsWith(path)
}

function activeStyle(path: string, exact: boolean, accent: string, excludePaths?: string[]) {
  if (!isActive(path, exact, excludePaths)) return {}
  return { background: accent + '1A', color: accent }
}

function activeIconStyle(path: string, exact: boolean, accent: string, excludePaths?: string[]) {
  if (!isActive(path, exact, excludePaths)) return {}
  return { color: accent }
}

function sectionActive(mod: typeof modules[0]) {
  return activeModule.value?.name === mod.name
}

// ── Notifiche browser ────────────────────────────────────────────────────────
const initialized   = ref(false)
const lastSeenTimes = new Map<string, number>()

onMounted(async () => {
  standaloneMql = window.matchMedia('(display-mode: standalone)')
  mobileMql = window.matchMedia('(max-width: 768px)')
  syncStandalone()
  syncMobile()
  standaloneMql.addEventListener('change', syncStandalone)
  mobileMql.addEventListener('change', syncMobile)
  await requestPermission()
  await setupForegroundMessages()
})

onBeforeUnmount(() => {
  standaloneMql?.removeEventListener('change', syncStandalone)
  mobileMql?.removeEventListener('change', syncMobile)
})

watch(chats, (newChats) => {
  if (!initialized.value) {
    for (const c of newChats) {
      lastSeenTimes.set(c.id, c.lastMessageAt?.getTime() ?? 0)
    }
    initialized.value = true
    return
  }

  const myEmail = auth.currentUser?.email ?? ''

  for (const chat of newChats) {
    const prev    = lastSeenTimes.get(chat.id) ?? 0
    const current = chat.lastMessageAt?.getTime() ?? 0

    if (current > prev) {
      lastSeenTimes.set(chat.id, current)
      const chatIsOpen = route.path === `/pulsar/chat/${chat.id}`
      if (!chatIsOpen) {
        const chatName = chat.name || chat.members.find((m: string) => m !== myEmail) || 'Chat'
        notify(`Nuovo messaggio in ${chatName}`, chat.lastMessage)
      }
    }
  }
}, { deep: true })

const roleLabel: Record<string, string> = {
  ADMIN:      'Admin',
  PRODUZIONE: 'Produzione',
  LOGISTICA:  'Logistica',
}
</script>

<template>
  <div
    :class="['s-shell', `s-scope-${currentScope}`, { 's-mobile-layout': isMobileLayout }]"
    :style="{ '--module-accent': activeModule?.accent ?? 'var(--s-green)', '--module-accent-light': (activeModule?.accent ?? 'var(--s-green)') + 'DD' }"
  >
    <!-- ── SIDEBAR ── -->
    <aside class="s-sidebar">
      <div class="s-logo" style="cursor: pointer" @click="router.push('/sidera/hub')">
        <!-- Schlegel diagram ottaedro — 6 vertici, 12 lati -->
        <svg class="s-logo-icon" width="116" height="82" viewBox="0 0 680 480" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- outer edges -->
          <line x1="340" y1="68"  x2="155" y2="400" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="155" y1="400" x2="525" y2="400" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="525" y1="400" x2="340" y2="68"  :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <!-- inner edges -->
          <line x1="275" y1="252" x2="405" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="405" y1="252" x2="340" y2="364" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="340" y1="364" x2="275" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <!-- cross edges -->
          <line x1="340" y1="68"  x2="405" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="340" y1="68"  x2="275" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="155" y1="400" x2="275" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="155" y1="400" x2="340" y2="364" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="525" y1="400" x2="405" y2="252" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <line x1="525" y1="400" x2="340" y2="364" :stroke="edgeStroke" :style="{ transition: edgeTransition }" stroke-width="1.5"/>
          <!-- vertici reattivi: colorati in base al modulo attivo -->
          <circle v-for="mod in modules" :key="mod.name"
            :cx="mod.vx" :cy="mod.vy"
            :r="vertexRadius(mod)"
            v-bind="vertexStyle(mod)"
            stroke-width="1.4"
          />
        </svg>

        <span class="s-logo-wordmark">
          <span class="s-ltr">S</span><span class="s-dot">·</span>
          <span class="s-ltr">I</span><span class="s-dot">·</span>
          <span class="s-ltr">D</span><span class="s-dot">·</span>
          <span class="s-ltr">E</span><span class="s-dot">·</span>
          <span class="s-ltr">R</span><span class="s-dot">·</span>
          <span class="s-ltr">A</span>
        </span>
      </div>

      <nav class="s-nav">
        <template v-for="mod in modules" :key="mod.name">
          <p
            class="s-section-label"
            :style="{ color: sectionActive(mod) ? mod.accent : undefined }"
          >{{ mod.name }}</p>
          <template v-for="item in mod.items" :key="item.path ?? item.href">
            <a
              v-if="item.href"
              :href="item.href"
              target="_blank"
              rel="noopener noreferrer"
              class="s-nav-item"
            >
              <MIcon :name="item.icon" :size="18" class="s-nav-icon" />
              {{ item.label }}
            </a>
            <RouterLink
              v-else
              :to="item.path"
              class="s-nav-item"
              :style="activeStyle(item.path, item.exact, mod.accent, item.excludePaths)"
            >
              <MIcon
                :name="item.icon"
                :size="18"
                :filled="isActive(item.path, item.exact, item.excludePaths)"
                :weight="isActive(item.path, item.exact, item.excludePaths) ? 500 : 400"
                class="s-nav-icon"
                :style="activeIconStyle(item.path, item.exact, mod.accent, item.excludePaths)"
              />
              {{ item.label }}
            </RouterLink>
          </template>
          <div v-if="mod.items.length === 0" class="s-nav-empty">
            <span class="s-soon" :style="{ borderColor: mod.accent + '44', color: mod.accent + 'AA' }">In arrivo</span>
          </div>
        </template>
      </nav>

      <!-- User -->
      <div class="s-user">
        <div
          class="s-user-avatar"
          :style="currentUser?.email ? { background: avatarColor(currentUser.email) } : {}"
        >{{ currentUser?.email ? currentUser.email[0].toUpperCase() : '?' }}</div>
        <div class="s-user-info">
          <div class="s-user-name">{{ currentUser?.email ? displayName(currentUser.email, members) : '…' }}</div>
          <div class="s-user-role">{{ roleLabel[currentUser?.role ?? ''] ?? 'Membro' }}</div>
        </div>
        <button class="s-logout-btn" title="Esci" @click="logout">
          <MIcon name="logout" :size="16" />
        </button>
      </div>
    </aside>

    <!-- ── MAIN ── -->
    <div class="s-main-wrap">
      <!-- Mobile-only: header contestuale del modulo corrente (visibile solo in mobile-layout su scope modulare) -->
      <ContextualMobileHeader
        v-if="isMobileLayout && currentScopeConfig"
        :scope="currentScope as Exclude<ScopeId, 'sidera'>"
        :config="currentScopeConfig"
      />

      <main class="s-main">
        <RouterView />
      </main>

      <!-- Mobile-only: bottom-nav + FAB contestuali -->
      <ContextualBottomNav
        v-if="isMobileLayout && currentScopeConfig"
        :config="currentScopeConfig"
      >
        <template #fab>
          <ContextualFab :config="currentScopeConfig" @trigger="onFabTrigger" />
        </template>
      </ContextualBottomNav>
    </div>
  </div>
</template>

<style scoped>
.s-shell {
  font-family: 'Outfit', sans-serif;
  background: var(--s-bg);
  color: var(--s-text);
  height: 100vh;
  display: flex;
  overflow: hidden;
}

/* ─── Sidebar ─── */
.s-sidebar {
  /* token locali dark per la sidebar */
  --s-sidebar:  #05090F;
  --s-border:   rgba(255,255,255,0.07);
  --s-text:     rgba(255,255,255,0.82);
  --s-text-mid: rgba(255,255,255,0.46);
  --s-text-dim: rgba(255,255,255,0.24);

  width: 220px;
  flex-shrink: 0;
  background: #05090F;
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
}

.s-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 28px;
}

.s-logo-wordmark {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 500;
  font-size: 30px;
  color: var(--s-text);
  line-height: 1;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
}

.s-ltr { display: inline-block; }

.s-dot {
  display: inline-flex;
  align-items: center;
  font-size: 0.4em;
  opacity: 0.35;
  padding: 0 0.28em;
  line-height: 1;
  position: relative;
  top: 0.04em;
}

.s-logo-icon { flex-shrink: 0; }

.s-nav { flex: 1; }

.s-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 12px;
  margin-top: 18px;
  margin-bottom: 6px;
  transition: color 0.15s;
}

.s-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: var(--s-text-dim);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  user-select: none;
  text-decoration: none;
  margin-bottom: 2px;
}

.s-nav-item:hover { background: var(--s-border); color: var(--s-text-mid); }

.s-nav-icon { font-size: 18px; flex-shrink: 0; transition: color 0.15s, font-variation-settings 0.2s; }

.s-nav-empty { padding: 4px 12px 6px; }

.s-soon {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: 4px;
  padding: 2px 6px;
  opacity: 0.7;
}

/* ─── User ─── */
.s-user {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.s-user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--s-green), #1E5038);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.s-user-name { font-size: 12px; font-weight: 500; }
.s-user-role { font-size: 11px; color: var(--s-text-dim); }

.s-logout-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: 5px;
  margin-left: auto;
  transition: color 0.15s;
}

.s-logout-btn:hover { color: #C8521A; }

/* ─── Main ─── */
.s-main-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;  /* permette posizionamento absolute del bottom-nav contextual */
}

.s-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── Mobile-layout adattivo ─── */
/* Quando .s-mobile-layout è attivo (standalone OR viewport ≤ 768px) e c'è uno scope modulare,
   la sidebar SIDERA scompare e il main lascia spazio per il bottom-nav. */
.s-shell.s-mobile-layout .s-sidebar {
  display: none;
}
.s-shell.s-mobile-layout .s-main {
  padding-bottom: calc(110px + env(safe-area-inset-bottom));
}

/* Fallback graceful per viewport ≤ 768px su scope='sidera' (no module chrome): nasconde
   la sidebar che altrimenti taglia il main. SIDERA mobile-style standalone non è ancora
   implementato (sarà esteso quando NEBULA/NOVA/MAGNETAR/QUASAR avranno mobile chrome). */
@media (max-width: 768px) {
  .s-sidebar { display: none; }
}
</style>
