<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount, ref, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import MIcon from '../../components/pulsar/MIcon.vue'
import ScopeBrandIcon from '../../components/shared/ScopeBrandIcon.vue'
import ContextualMobileHeader from '../../components/shared/ContextualMobileHeader.vue'
import ContextualBottomNav from '../../components/shared/ContextualBottomNav.vue'
import ContextualFab from '../../components/shared/ContextualFab.vue'
import { SCOPE_CONFIGS } from '../sidera/scopeConfig'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarColor } from '../../composables/sidera/useTeamMembers'
import { useChats } from '../../composables/pulsar/useChats'
import { useNotifications } from '../../composables/shared/useNotifications'

const route  = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()
const { chats } = useChats()
const { requestPermission, notify, setupForegroundMessages } = useNotifications('pulsar')

const config = SCOPE_CONFIGS.pulsar

async function logout() {
  await signOut(auth)
  router.push('/pulsar/login')
}

const newChatTick = ref(0)
provide('pulsar-new-chat-tick', newChatTick)
function triggerNewChat() {
  if (route.path === '/pulsar') {
    newChatTick.value++
  } else {
    sessionStorage.setItem('pulsar-pending-new-chat', '1')
    router.push('/pulsar')
  }
}

function onFabTrigger(action: 'new-chat' | 'new-task' | 'new-project' | 'new-goal' | 'none') {
  if (action === 'new-chat') triggerNewChat()
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
    // iOS Safari legacy
    (window.navigator as any).standalone === true
}

// ── Notifiche browser ─────────────────────────────────────────────────────
const initialized   = ref(false)
const lastSeenTimes = new Map<string, number>()

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
        const chatName = chat.name || chat.members.find(m => m !== myEmail) || 'Chat'
        notify(`Nuovo messaggio in ${chatName}`, chat.lastMessage)
      }
    }
  }
}, { deep: true })
</script>

<template>
  <div class="p-shell s-scope-pulsar">

    <!-- ── SIDEBAR desktop ── -->
    <aside class="p-sidebar">
      <div class="p-brand">
        <ScopeBrandIcon scope="pulsar" :size="32" />
        <span class="p-brand-text">P<span class="p-brand-dot">·</span>U<span class="p-brand-dot">·</span>L<span class="p-brand-dot">·</span>S<span class="p-brand-dot">·</span>A<span class="p-brand-dot">·</span>R</span>
      </div>

      <nav class="p-nav">
        <p class="p-section-label">Workspace</p>
        <RouterLink
          v-for="item in config.mobileNav"
          :key="item.path"
          :to="item.path"
          class="p-nav-item"
          :class="{ 'is-active': isActive(item.path, item.exact) }"
        >
          <MIcon :name="item.icon" class="p-nav-icon" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Link a SIDERA (nascosto in PWA standalone per preservare lo scope) -->
      <div v-if="!isStandalone" class="p-sidera-section">
        <RouterLink to="/sidera" class="p-sidera-link">
          <MIcon name="open_in_new" class="p-sidera-icon" />
          <span class="p-sidera-wordmark">SIDERA</span>
        </RouterLink>
      </div>

      <!-- User -->
      <div class="p-user">
        <div
          class="p-user-avatar"
          :style="currentUser?.email ? { background: avatarColor(currentUser.email) } : {}"
        >{{ currentUser?.email ? currentUser.email[0].toUpperCase() : '?' }}</div>
        <div class="p-user-info">
          <div class="p-user-name">{{ currentUser?.email ? displayName(currentUser.email, members) : '…' }}</div>
          <div class="p-user-role">PULSAR</div>
        </div>
        <button class="p-logout-btn" title="Esci" @click="logout">
          <MIcon name="logout" :size="16" />
        </button>
      </div>
    </aside>

    <!-- ── CONTENUTO ── -->
    <div class="p-main-wrap">

      <!-- Header solo mobile (contextual: gestito tramite scopeConfig) -->
      <ContextualMobileHeader scope="pulsar" :config="config" />

      <main class="p-main">
        <RouterView />
      </main>

      <!-- Bottom nav + FAB solo mobile (contextual) -->
      <ContextualBottomNav :config="config">
        <template #fab>
          <ContextualFab :config="config" @trigger="onFabTrigger" />
        </template>
      </ContextualBottomNav>

    </div>
  </div>
</template>

<style scoped>
.p-shell {
  height: 100vh;
  display: flex;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
  background: var(--s-bg);
  color: var(--s-text);
}

/* ── Sidebar desktop ── */
.p-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--s-sidebar);
  border-right: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
}

/* Brand unificato: usato sia in sidebar desktop che mobile header */
.p-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
}

.p-sidebar .p-brand { padding: 4px 12px 26px; }

.p-brand-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.p-brand-text {
  font-family: 'Cormorant Garamond', serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--s-text);
  display: inline-block;
}

.p-brand-dot {
  font-weight: 400;
  opacity: 0.4;
  display: inline-block;
  margin: 0 0.06em;
  position: relative;
  top: -0.08em;
}

.p-nav { flex: 1; }

.p-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 12px;
  margin-bottom: 10px;
}

.p-nav-item {
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

.p-nav-item:hover { background: var(--s-border); color: var(--s-text-mid); }

.p-nav-item.is-active {
  background: color-mix(in srgb, var(--md-sys-color-primary) 9%, transparent);
  color: var(--md-sys-color-primary-hover);
}

.p-nav-item.is-active .p-nav-icon { color: var(--md-sys-color-primary); }
.p-nav-icon { font-size: 18px; flex-shrink: 0; }

/* Link SIDERA */
.p-sidera-section {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  margin-bottom: 10px;
}

.p-sidera-link {
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

.p-sidera-link:hover { background: rgba(47, 107, 74, 0.12); }
.p-sidera-wordmark { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.p-sidera-icon { font-size: 14px; opacity: 0.7; }

/* User */
.p-user {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.p-user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, var(--md-sys-color-primary), #265E56);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--md-sys-color-on-primary); flex-shrink: 0;
}

.p-user-name { font-size: 12px; font-weight: 500; }
.p-user-role { font-size: 11px; color: var(--s-text-dim); }

.p-logout-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim);
  display: flex; align-items: center;
  padding: 3px; border-radius: 5px;
  margin-left: auto; transition: color 0.15s;
}

.p-logout-btn:hover { color: #C8521A; }

/* ── Area contenuto ── */
.p-main-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.p-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--s-bg);
}

/* Mobile: lascia spazio in fondo per la bottom bar che galleggia sopra il contenuto */
@media (max-width: 768px) {
  .p-main { padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
  .p-sidebar { display: none; }
}
</style>
