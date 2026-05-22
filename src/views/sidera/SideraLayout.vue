<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import MIcon from '../../components/shared/MIcon.vue'
import ContextualMobileHeader from '../../components/shared/ContextualMobileHeader.vue'
import ContextualBottomNav from '../../components/shared/ContextualBottomNav.vue'
import ContextualFab from '../../components/shared/ContextualFab.vue'
import { detectScope, getScopeConfig, SCOPE_CONFIGS, type ScopeId } from './scopeConfig'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName } from '../../composables/sidera/useTeamMembers'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { useChats } from '../../composables/pulsar/useChats'
import { useNotifications, type NotificationScope } from '../../composables/shared/useNotifications'
import { useTriageCount } from '../../composables/cepheid/useTriageCount'

const route  = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { chats } = useChats()
const { triageCount } = useTriageCount()

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
function pickFcmScope(): NotificationScope {
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
    } else if (p === '/cepheid' || p === '/cepheid/smistamento') {
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
      // Single source of truth con il bottom-nav mobile QUASAR (/quasar/*).
      ...(SCOPE_CONFIGS.quasar.mobileNav as any[]),
    ],
  },
  {
    name: 'NEBULA',   accent: '#C46030',
    vx: 155, vy: 400, vr: 10,
    // Single source of truth con bottom-nav mobile NEBULA: stessi link (/nebula/*)
    // sia nella sidebar desktop che nella pillola mobile.
    items: SCOPE_CONFIGS.nebula.mobileNav as any[],
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
      return route.path === '/sidera'   // SOLO /sidera (Cruscotto) — /sidera/hub è all-mode
    return m.items.some((item: any) =>
      item.exact ? route.path === item.path : route.path.startsWith(item.path)
    )
  }) ?? null
)

// Logo "all-mode": SOLO su /sidera/hub mostriamo tutti i vertici accesi
// col color SIDERA uniforme (come la pagina HubView). Su /sidera (Cruscotto)
// e' attivo QUASAR come modulo singolo (vertice illuminato + wordmark color).
const isAllMode = computed(() => route.path === '/sidera/hub')
const activeLogoModule = computed(() => isAllMode.value ? null : activeModule.value)

// ── Edges Schlegel per il logo "ricco" della sidebar (replica HubView) ─────
// 12 edges per nome modulo. Coordinate dei vertici prese da modules[].vx/vy.
const EDGES_HUB: [string, string][] = [
  ['QUASAR', 'NEBULA'], ['NEBULA', 'CEPHEID'], ['CEPHEID', 'QUASAR'],
  ['NOVA', 'PULSAR'], ['PULSAR', 'MAGNETAR'], ['MAGNETAR', 'NOVA'],
  ['QUASAR', 'PULSAR'], ['QUASAR', 'NOVA'],
  ['NEBULA', 'NOVA'], ['NEBULA', 'MAGNETAR'],
  ['CEPHEID', 'PULSAR'], ['CEPHEID', 'MAGNETAR'],
]
const NE_COLOR = '#2A3F52'   // edge inattivo / fade-out gradient end
const NV_COLOR = '#243648'   // vertice inattivo fill
const NS_COLOR = '#364F66'   // vertice inattivo stroke

function moduleByName(name: string) {
  return modules.find(m => m.name === name)
}

// Edges adiacenti al modulo attivo, normalizzati col modulo attivo come "from".
// Gradient 0% color, 75% color, 100% color@0.45 — l'edge mantiene il SUO color
// fino al vertice opposto, solo fadeato in opacity. Risolve il bug 'edges che
// sfumano in NE si confondono con gli edges base' (es. NEBULA-CEPHEID orizzontale).
const activeEdges = computed(() => {
  const am = activeLogoModule.value
  if (!am) return []
  return EDGES_HUB
    .filter(([a, b]) => a === am.name || b === am.name)
    .map(([a, b], i) => {
      const from = moduleByName(a === am.name ? a : b)!
      const to   = moduleByName(a === am.name ? b : a)!
      return { id: `s-hv-g${i}`, from, to }
    })
})

// Stroke per il base edge EDGES_HUB[i] = [a, b]:
// - se attivo (adiacente al modulo attivo) → url(#gradient) con fade m.color → NE
// - altrimenti → NE_COLOR (gray-blu fisso)
// Replica esatta del pattern HubView: niente layer separato "glow" sovrapposto,
// è il base edge stesso che cambia stroke quando il modulo è attivo.
function edgeStrokeFor(a: string, b: string): string {
  const am = activeLogoModule.value
  if (!am) return NE_COLOR
  if (a !== am.name && b !== am.name) return NE_COLOR
  const ae = activeEdges.value.find(e =>
    (e.from.name === a && e.to.name === b) || (e.from.name === b && e.to.name === a)
  )
  return ae ? `url(#${ae.id})` : NE_COLOR
}

// Width per il base edge: edge attivi più spessi per compensare il fatto che
// la sidebar SVG è renderizzata piccola (116×82 su viewBox 680×480 → fattore ~0.17).
function edgeWidthFor(a: string, b: string): number {
  const am = activeLogoModule.value
  if (!am) return 1.2
  return (a === am.name || b === am.name) ? 2.5 : 1.2
}

// Dimensioni halo per il vertice attivo: outer più grandi, inner più piccoli
// (replica HubView: outer halo-lg=42 / md=24, inner halo-lg=34 / md=19).
const activeHaloLg = computed(() => {
  const am = activeLogoModule.value
  if (!am) return 0
  // outer = QUASAR/NEBULA/CEPHEID (vr 10), inner = PULSAR/NOVA/MAGNETAR (vr 8)
  return am.vr === 10 ? 42 : 34
})
const activeHaloMd = computed(() => {
  const am = activeLogoModule.value
  if (!am) return 0
  return am.vr === 10 ? 24 : 19
})
function haloMdSize(mod: typeof modules[0]) {
  return mod.vr === 10 ? 24 : 19
}

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
        <!-- Schlegel diagram ricco — replica HubView (no cycle, attivo in base alla route) -->
        <svg class="s-logo-icon" width="116" height="82" viewBox="0 0 680 480" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow: visible">
          <defs>
            <!-- filterUnits=userSpaceOnUse: regione del filtro in coord viewBox.
                 Le % default sono relative al bbox dell'elemento, che ha altezza 0
                 per le linee perfettamente orizzontali (NEBULA-CEPHEID, NOVA-PULSAR)
                 → il blur veniva clippato e le linee sparivano in all-mode. -->
            <filter id="s-hv-gf-sm" filterUnits="userSpaceOnUse" x="0" y="0" width="680" height="480">
              <feGaussianBlur stdDeviation="4.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="s-hv-gf-md" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="9" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="s-hv-gf-lg" x="-180%" y="-180%" width="460%" height="460%">
              <feGaussianBlur stdDeviation="18" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <!-- Gradient per ogni edge attivo: 0%/75% color modulo, 100% NE_COLOR.
                 Replica del pattern HubView: fade-to-NE color a piena opacità.
                 Il gradient viene applicato direttamente al base edge (non a un
                 layer "glow" sovrapposto), così che l'edge rimanga visibile
                 end-to-end anche sugli edges lunghi orizzontali (NEBULA-CEPHEID,
                 NOVA-PULSAR). -->
            <linearGradient
              v-for="e in activeEdges" :key="e.id"
              :id="e.id"
              gradientUnits="userSpaceOnUse"
              :x1="e.from.vx" :y1="e.from.vy" :x2="e.to.vx" :y2="e.to.vy"
            >
              <stop offset="0%"   :stop-color="activeLogoModule!.accent"/>
              <stop offset="75%"  :stop-color="activeLogoModule!.accent"/>
              <stop offset="100%" :stop-color="NE_COLOR"/>
            </linearGradient>
          </defs>

          <!-- Edges base: stroke gradient se adiacente al modulo attivo, NE altrimenti.
               Replica HubView: niente layer "glow" sovrapposto — il base edge
               stesso cambia stroke quando il modulo è attivo.
               shape-rendering=geometricPrecision evita aliasing visibile per le
               linee sottili (1.2px in viewBox 680×480 renderizzato a 116×82). -->
          <line
            v-for="([a, b], i) in EDGES_HUB" :key="`e-${i}`"
            :x1="moduleByName(a)!.vx" :y1="moduleByName(a)!.vy"
            :x2="moduleByName(b)!.vx" :y2="moduleByName(b)!.vy"
            :stroke="edgeStrokeFor(a, b)" :stroke-width="edgeWidthFor(a, b)"
            shape-rendering="geometricPrecision"
            style="transition: stroke 0.5s ease, stroke-width 0.5s ease"
          />

          <!-- Halo grande (vertice attivo, modulo singolo) — SOTTO l'edge glow -->
          <circle
            v-if="activeLogoModule"
            :cx="activeLogoModule.vx" :cy="activeLogoModule.vy" :r="activeHaloLg"
            :fill="activeLogoModule.accent" fill-opacity="0.11"
            filter="url(#s-hv-gf-lg)"
            style="transition: fill 0.6s ease, fill-opacity 0.6s ease"
          />
          <!-- Halo medio (vertice attivo, modulo singolo) — SOTTO l'edge glow -->
          <circle
            v-if="activeLogoModule"
            :cx="activeLogoModule.vx" :cy="activeLogoModule.vy" :r="activeHaloMd"
            :fill="activeLogoModule.accent" fill-opacity="0.28"
            filter="url(#s-hv-gf-md)"
            style="transition: fill 0.5s ease, fill-opacity 0.5s ease"
          />

          <!-- All-mode (route /sidera/hub): tutti gli edges glow color SIDERA +
               halo md SIDERA su ogni vertice (replica HubView "cycle null" branch). -->
          <g v-if="isAllMode" style="opacity: 0.65">
            <line
              v-for="([a, b], i) in EDGES_HUB" :key="`ea-${i}`"
              :x1="moduleByName(a)!.vx" :y1="moduleByName(a)!.vy"
              :x2="moduleByName(b)!.vx" :y2="moduleByName(b)!.vy"
              stroke="#D4C498" stroke-width="4" filter="url(#s-hv-gf-sm)"
            />
          </g>
          <!-- Halo md SIDERA su ogni vertice in all-mode (sotto i vertici, dopo gli edges) -->
          <template v-if="isAllMode">
            <circle
              v-for="mod in modules" :key="`alm-${mod.name}`"
              :cx="mod.vx" :cy="mod.vy" :r="haloMdSize(mod)"
              fill="#D4C498" fill-opacity="0.18"
              filter="url(#s-hv-gf-md)"
            />
          </template>

          <!-- Vertici: all-mode → tutti SIDERA / single → solo attivo color modulo -->
          <circle
            v-for="mod in modules" :key="mod.name"
            :cx="mod.vx" :cy="mod.vy"
            :r="mod.vr === 10 ? 14 : 12"
            :fill="isAllMode ? '#D4C498' : (activeLogoModule?.name === mod.name ? mod.accent : NV_COLOR)"
            :stroke="isAllMode ? '#D4C498' : (activeLogoModule?.name === mod.name ? mod.accent : NS_COLOR)"
            stroke-width="0.8"
            filter="url(#s-hv-gf-sm)"
            style="transition: fill 0.5s ease, stroke 0.5s ease"
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
              <span
                v-if="item.path === '/cepheid/smistamento' && triageCount > 0"
                class="s-triage-star"
                aria-label="Task da smistare"
              >★</span>
            </RouterLink>
          </template>
          <div v-if="mod.items.length === 0" class="s-nav-empty">
            <span class="s-soon" :style="{ borderColor: mod.accent + '44', color: mod.accent + 'AA' }">In arrivo</span>
          </div>
        </template>
      </nav>

      <!-- User -->
      <div class="s-user">
        <StarAvatar
          v-if="currentUser?.email"
          :seed="currentUser.uid || currentUser.email"
          :category="currentUser.category || 'amministrazione'"
          :hueIndex="currentUser.hueIndex"
          :size="36"
        />
        <div v-else class="s-user-avatar">?</div>
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
        :triage-count="triageCount"
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

.s-nav {
  flex: 1;
  min-height: 0;        /* consente lo scroll dentro il flex-column */
  overflow-y: auto;
  overflow-x: hidden;
}

.s-section-label {
  /* M3 label-small: 11px, ma qui 10px per dare aria al letter-spacing maggiorato (0.1em) */
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 12px;
  margin-top: 18px;
  margin-bottom: 6px;
  transition: color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

.s-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: var(--md-sys-shape-corner-small);
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              color      var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  color: var(--s-text-dim);
  font-family: var(--md-sys-typescale-label-large-font);
  font-size: 13px; /* leggermente sotto label-large (14) per coerenza density sidebar */
  font-weight: 500;
  letter-spacing: 0.01em;
  user-select: none;
  text-decoration: none;
  margin-bottom: 2px;
}

.s-nav-item:hover { background: var(--s-border); color: var(--s-text-mid); }

/* indicatore "c'è lavoro": stella oro CEPHEID che pulsa quando ci sono task da smistare */
.s-triage-star {
  margin-left: auto;
  color: #D4A020;
  font-size: 13px;
  line-height: 1;
  text-shadow: 0 0 6px rgba(212, 160, 32, 0.5);
  animation: cph-star-pulse 1.6s ease-in-out infinite;
}
@keyframes cph-star-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%      { transform: scale(1.25); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .s-triage-star { animation: none; }
}

.s-nav-icon {
  font-size: 18px;
  flex-shrink: 0;
  transition: color                var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
              font-variation-settings var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.s-nav-empty { padding: 4px 12px 6px; }

.s-soon {
  display: inline-block;
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid;
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 2px 6px;
  opacity: 0.7;
}

/* ─── User ─── */
.s-user {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  margin-top: 8px;
  flex-shrink: 0;        /* resta sempre visibile in fondo, non viene compresso */
  display: flex;
  align-items: center;
  gap: 10px;
}

.s-user-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--md-sys-shape-corner-full);
  background: linear-gradient(135deg, var(--s-green), #1E5038);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.s-user-name {
  font-family: var(--md-sys-typescale-label-medium-font);
  font-size: 12px;
  font-weight: 500;
}
.s-user-role {
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: 11px;
  color: var(--s-text-dim);
}

.s-logout-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-dim);
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  margin-left: auto;
  transition: color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
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
