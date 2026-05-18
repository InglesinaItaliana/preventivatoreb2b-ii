<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount, ref, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import MIcon from '../../components/pulsar/MIcon.vue'
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

async function logout() {
  await signOut(auth)
  router.push('/pulsar/login')
}

const navItems = [
  { path: '/pulsar',           exact: true,  label: 'Chat',      icon: 'forum' },
  { path: '/pulsar/sequentia', exact: false, label: 'Azioni',    icon: 'check_circle' },
  { path: '/pulsar/pending',   exact: false, label: 'Pendenze',  icon: 'notifications' },
  { path: '/pulsar/tags',      exact: false, label: 'Etichette', icon: 'sell' },
]

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
  <div class="p-shell">

    <!-- ── SIDEBAR desktop ── -->
    <aside class="p-sidebar">
      <div class="p-brand">
        <svg class="p-brand-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:#3A8C80">
          <circle cx="16" cy="16" r="8"   fill="currentColor" opacity="0.10"/>
          <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
            <line x1="16" y1="16" x2="12"   y2="4.7"/>
            <line x1="16" y1="16" x2="23.6" y2="25.3"/>
            <line x1="16" y1="16" x2="4"    y2="16"/>
            <line x1="16" y1="16" x2="10"   y2="26.4"/>
          </g>
          <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28"/>
          <circle cx="16" cy="16" r="2.9" fill="currentColor"/>
        </svg>
        <span class="p-brand-text">P<span class="p-brand-dot">·</span>U<span class="p-brand-dot">·</span>L<span class="p-brand-dot">·</span>S<span class="p-brand-dot">·</span>A<span class="p-brand-dot">·</span>R</span>
      </div>

      <nav class="p-nav">
        <p class="p-section-label">Workspace</p>
        <RouterLink
          v-for="item in navItems"
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

      <!-- Header solo mobile -->
      <header class="p-mobile-header">
        <button
          v-if="route.path !== '/pulsar' && route.path !== '/pulsar/sequentia' && route.path !== '/pulsar/pending' && route.path !== '/pulsar/tags'"
          class="p-back-btn"
          @click="router.back()"
        >
          <MIcon name="arrow_back" :size="20" />
        </button>
        <div class="p-brand">
          <svg class="p-brand-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:#3A8C80">
            <circle cx="16" cy="16" r="8"   fill="currentColor" opacity="0.10"/>
            <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
              <line x1="16" y1="16" x2="12"   y2="4.7"/>
              <line x1="16" y1="16" x2="23.6" y2="25.3"/>
              <line x1="16" y1="16" x2="4"    y2="16"/>
              <line x1="16" y1="16" x2="10"   y2="26.4"/>
            </g>
            <circle cx="16" cy="16" r="4.4" fill="currentColor" opacity="0.28"/>
            <circle cx="16" cy="16" r="2.9" fill="currentColor"/>
          </svg>
          <span class="p-brand-text">P<span class="p-brand-dot">·</span>U<span class="p-brand-dot">·</span>L<span class="p-brand-dot">·</span>S<span class="p-brand-dot">·</span>A<span class="p-brand-dot">·</span>R</span>
        </div>
      </header>

      <main class="p-main">
        <RouterView />
      </main>

      <!-- Bottom nav solo mobile -->
      <nav class="p-bottom-nav">
        <div class="p-nav-pill">
          <button
            v-for="item in navItems"
            :key="item.path"
            class="p-pill-btn"
            :class="{ 'is-active': isActive(item.path, item.exact) }"
            :aria-label="item.label"
            @click="router.push(item.path)"
          >
            <MIcon
              :name="item.icon"
              :filled="isActive(item.path, item.exact)"
              class="p-pill-icon"
            />
          </button>
        </div>

        <button
          class="p-new-chat-btn"
          aria-label="Nuova conversazione"
          @click="triggerNewChat"
        >
          <MIcon name="chat_add_on" filled :size="28" />
        </button>
      </nav>

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
  background: rgba(58, 140, 128, 0.09);
  color: #2E7268;
}

.p-nav-item.is-active .p-nav-icon { color: #3A8C80; }
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
  background: linear-gradient(135deg, #3A8C80, #265E56);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
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
}

/* ── Mobile: header e bottom nav, nascosti su desktop ── */
.p-mobile-header {
  display: none;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--s-surface);
  border-bottom: 1px solid var(--s-border);
  flex-shrink: 0;
}

.p-back-btn {
  background: none; border: none; cursor: pointer;
  color: var(--s-text-dim); display: flex; align-items: center;
  padding: 4px; border-radius: 8px; transition: background 0.15s;
}

.p-back-btn:hover { background: var(--s-border); }


.p-bottom-nav {
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

.p-bottom-nav > * { pointer-events: auto; }

.p-nav-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #F1EEE8;
  border-radius: 999px;
  padding: 9px 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.p-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 52px;
  border-radius: 999px;
  background: none;
  border: none;
  cursor: pointer;
  color: #3A8C80;
  transition: background 0.18s ease, color 0.18s ease;
  padding: 0;
}

.p-pill-btn:hover { background: rgba(58, 175, 152, 0.08); }

.p-pill-btn.is-active {
  background: rgba(58, 175, 152, 0.20);
  color: #3A8C80;
}

.p-pill-icon { font-size: 36px; }

.p-new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66px;
  height: 66px;
  border-radius: 20px;
  background: #3A8C80;
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(58, 140, 128, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}

.p-new-chat-btn:hover {
  background: #338076;
  box-shadow: 0 4px 14px rgba(58, 140, 128, 0.45);
}

.p-new-chat-btn:active { transform: scale(0.96); }

/* ── Mobile ≤ 768px ── */
@media (max-width: 768px) {
  .p-sidebar       { display: none; }
  .p-mobile-header { display: flex; }
  .p-bottom-nav    { display: flex; }
}
</style>
