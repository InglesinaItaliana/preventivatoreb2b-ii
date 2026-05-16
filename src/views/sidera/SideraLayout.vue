<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  Squares2X2Icon,
  ChatBubbleLeftRightIcon,
  ArchiveBoxIcon,
  ArrowTopRightOnSquareIcon,
  ArrowLeftOnRectangleIcon,
} from '@heroicons/vue/24/outline'
import { useCurrentUser } from '../../composables/sidera/useCurrentUser'
import { useTeamMembers, displayName, avatarColor } from '../../composables/sidera/useTeamMembers'

const route = useRoute()
const router = useRouter()
const { currentUser } = useCurrentUser()
const { members } = useTeamMembers()

async function logout() {
  await signOut(auth)
  router.push('/')
}

const navItems = [
  { path: '/sidera',          exact: true,  label: 'Il Mio Giorno', icon: HomeIcon },
  { path: '/sidera/tasks',    exact: false, label: 'Azioni',        icon: ClipboardDocumentCheckIcon },
  { path: '/sidera/projects', exact: false, label: 'Progetti',      icon: Squares2X2Icon },
  { path: '/sidera/chat',     exact: false, label: 'Chat',          icon: ChatBubbleLeftRightIcon },
]

function isActive(path: string, exact: boolean) {
  return exact ? route.path === path : route.path.startsWith(path)
}

const roleLabel: Record<string, string> = {
  ADMIN:      'Admin',
  PRODUZIONE: 'Produzione',
  LOGISTICA:  'Logistica',
}
</script>

<template>
  <div class="s-shell">
    <!-- ── SIDEBAR ── -->
    <aside class="s-sidebar">
      <div class="s-logo">
        <span class="s-logo-wordmark">SIDERA</span>
        <span class="s-logo-star">✦</span>
      </div>

      <nav class="s-nav">
        <p class="s-section-label">Workspace</p>
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="s-nav-item"
          :class="{ 'is-active': isActive(item.path, item.exact) }"
        >
          <component :is="item.icon" class="s-nav-icon" />
          {{ item.label }}
        </RouterLink>

        <div class="s-sep" />
        <p class="s-section-label">In arrivo</p>
        <div class="s-nav-item s-nav-item--disabled">
          <ArchiveBoxIcon class="s-nav-icon" />
          Archivio
          <span class="s-badge-soon">PRESTO</span>
        </div>
      </nav>

      <!-- POPS link -->
      <div class="s-pops-section">
        <a
          href="https://b2b.inglesinaitaliana.it"
          target="_blank"
          rel="noopener noreferrer"
          class="s-pops-link"
        >
          <span class="s-pops-wordmark">POPS</span>
          <ArrowTopRightOnSquareIcon class="s-pops-icon" />
        </a>
      </div>

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
          <ArrowLeftOnRectangleIcon style="width:14px;height:14px" />
        </button>
      </div>
    </aside>

    <!-- ── MAIN ── -->
    <main class="s-main">
      <RouterView />
    </main>
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
  width: 220px;
  flex-shrink: 0;
  background: var(--s-sidebar);
  border-right: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
}

.s-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 26px;
}

.s-logo-wordmark {
  font-family: 'Cormorant Garamond', serif;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--s-text);
}

.s-logo-star {
  color: var(--s-green);
  font-size: 10px;
  margin-top: 1px;
  font-weight: 700;
}

.s-nav { flex: 1; }

.s-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 12px;
  margin-bottom: 10px;
}

.s-nav-item {
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

.s-nav-item:hover { background: var(--s-border); color: var(--s-text-mid); }

.s-nav-item.is-active {
  background: var(--s-green-glow);
  color: var(--s-green-text);
}

.s-nav-item.is-active .s-nav-icon { color: var(--s-green); }

.s-nav-item--disabled { opacity: 0.35; cursor: not-allowed; }

.s-nav-icon { width: 15px; height: 15px; flex-shrink: 0; }

.s-sep {
  margin: 18px 0 10px;
  border-top: 1px solid var(--s-border);
  padding-top: 16px;
}

.s-badge-soon {
  margin-left: auto;
  font-size: 9px;
  background: var(--s-border);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--s-text-dim);
  letter-spacing: 0.05em;
  font-weight: 700;
}

/* ─── POPS ─── */
.s-pops-section {
  border-top: 1px solid var(--s-border);
  padding-top: 12px;
  margin-bottom: 10px;
}

.s-pops-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--s-pops-glow);
  border: 1px solid var(--s-pops-border);
  color: var(--s-pops);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.s-pops-link:hover { background: rgba(200, 130, 26, 0.13); }

.s-pops-wordmark { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }

.s-pops-icon { width: 12px; height: 12px; margin-left: auto; opacity: 0.7; }

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
.s-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
