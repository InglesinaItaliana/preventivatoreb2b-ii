<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import MIcon from '../../components/shared/MIcon.vue'
import { useChats } from '../../composables/pulsar/useChats'
import { useUnreadChats } from '../../composables/pulsar/usePulsarUnread'
import { useTeamMembers, displayName, starAvatarProps } from '../../composables/sidera/useTeamMembers'
import { pulsarAvatarColor } from '../../composables/pulsar/usePulsarAvatar'
import StarAvatar from '../../components/shared/StarAvatar.vue'
import { auth } from '../../firebase'

const router = useRouter()
const { chats, loading, createChat, deleteChat } = useChats()
const { unreadCount } = useUnreadChats(chats)
const { members } = useTeamMembers()

const myEmail = auth.currentUser?.email ?? ''

// ── New chat modal ────────────────────────────────────────────────────────
const showModal  = ref(false)
const saving     = ref(false)
const isGroup    = ref(false)
const dmTarget   = ref('')
const groupName  = ref('')
const groupMembers = ref<string[]>([])

// ── Delete chat confirmation ──────────────────────────────────────────────
const chatToDelete = ref<{ id: string; name: string } | null>(null)
const deleting     = ref(false)

function askDeleteChat(chat: { id: string; name: string; members: string[]; isGroup: boolean }) {
  chatToDelete.value = { id: chat.id, name: chatName(chat) }
}

async function confirmDelete() {
  if (!chatToDelete.value || deleting.value) return
  deleting.value = true
  try {
    await deleteChat(chatToDelete.value.id)
    chatToDelete.value = null
  } finally {
    deleting.value = false
  }
}

function openModal() {
  isGroup.value     = false
  dmTarget.value    = ''
  groupName.value   = ''
  groupMembers.value = []
  showModal.value   = true
}

function toggleGroupMember(email: string) {
  const idx = groupMembers.value.indexOf(email)
  if (idx === -1) groupMembers.value.push(email)
  else groupMembers.value.splice(idx, 1)
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    let newChatId = ''
    if (!isGroup.value && dmTarget.value) {
      const otherName = displayName(dmTarget.value, members.value)
      newChatId = await createChat(otherName, [dmTarget.value], false)
    } else if (isGroup.value && groupName.value.trim() && groupMembers.value.length > 0) {
      newChatId = await createChat(groupName.value.trim(), groupMembers.value, true)
    }
    showModal.value = false
    // Entra subito nella conversazione appena creata
    if (newChatId) router.push({ name: 'pulsar-chat', params: { id: newChatId } })
  } finally {
    saving.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function chatName(chat: { name: string; members: string[]; isGroup: boolean }) {
  if (chat.isGroup && chat.name) return chat.name
  const other = chat.members.find(m => m !== myEmail) ?? ''
  return displayName(other, members.value)
}

function chatColor(chat: { name: string; members: string[]; isGroup: boolean }) {
  const other = chat.members.find(m => m !== myEmail) ?? chat.name
  return pulsarAvatarColor(other)
}

function formatTime(d: Date | null) {
  if (!d) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3_600_000)  return Math.floor(diff / 60_000) + 'm'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h'
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d)
}

const otherMembers = computed(() => members.value.filter(m => m.email !== myEmail))

// Apertura modal triggerata dalla bottom bar di PulsarLayout
const newChatTick = inject<Ref<number>>('pulsar-new-chat-tick', null as any)
if (newChatTick) {
  watch(newChatTick, () => openModal())
}

// Se l'utente ha cliccato "nuova conversazione" da un'altra rotta,
// PulsarLayout ha settato il flag e navigato qui — apri il modal al mount.
onMounted(() => {
  if (sessionStorage.getItem('pulsar-pending-new-chat') === '1') {
    sessionStorage.removeItem('pulsar-pending-new-chat')
    nextTick(() => openModal())
  }
})
</script>

<template>
  <div class="cv">
    <header class="cv-header">
      <h2 class="p-page-title">Messaggi</h2>
      <p class="p-page-sub">
        {{ unreadCount === 0
          ? 'Nessun messaggio da leggere'
          : (unreadCount === 1 ? '1 chat con messaggi non letti' : unreadCount + ' chat con messaggi non letti') }}
      </p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="loading-list">
      <div v-for="i in 4" :key="i" class="chat-skel" />
    </div>

    <!-- Empty -->
    <div v-else-if="!chats.length" class="empty-state">
      <p>Nessuna conversazione ancora.<br>Inizia dal tasto in basso a destra.</p>
    </div>

    <!-- Chat list -->
    <div v-else class="chat-list">
      <div
        v-for="chat in chats"
        :key="chat.id"
        class="chat-row"
        @click="router.push('/pulsar/chat/' + chat.id)"
      >
        <StarAvatar
          v-if="!chat.isGroup"
          v-bind="starAvatarProps(chat.members.find(m => m !== myEmail) ?? '', members)"
          :size="40"
        />
        <div
          v-else
          class="chat-avatar"
          :style="{ background: chatColor(chat) + '25', border: '2px solid ' + chatColor(chat) + '50', color: chatColor(chat) }"
        >
          <MIcon :name="'group'" :size="16" />
        </div>
        <div class="chat-info">
          <div class="chat-top">
            <span class="chat-name">{{ chatName(chat) }}</span>
            <span class="chat-time">{{ formatTime(chat.lastMessageAt) }}</span>
          </div>
          <div class="chat-preview">{{ chat.lastMessage || 'Nessun messaggio' }}</div>
        </div>
        <button class="delete-btn" title="Elimina chat" @click.stop="askDeleteChat(chat)">
          <MIcon name="close" :size="16" />
        </button>
      </div>
    </div>

    <!-- Modal nuova chat -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-backdrop md-modal-backdrop" @click.self="showModal = false">
        <div class="modal md-modal-dialog">
          <div class="modal-header md-modal-header">
            <span class="modal-title md-modal-title">Nuova conversazione</span>
            <button class="modal-close md-modal-close" @click="showModal = false"><MIcon name="close" :size="18" /></button>
          </div>

          <div class="modal-body md-modal-body">
            <!-- Toggle DM / Gruppo -->
            <div class="type-toggle">
              <button :class="['type-btn', { 'is-active': !isGroup }]" @click="isGroup = false">DM</button>
              <button :class="['type-btn', { 'is-active': isGroup }]" @click="isGroup = true">Gruppo</button>
            </div>

            <!-- DM: seleziona membro -->
            <template v-if="!isGroup">
              <label class="field-label md-text-field-label" style="margin-top:16px">Con chi?</label>
              <div class="member-list">
                <div
                  v-for="m in otherMembers"
                  :key="m.email"
                  class="member-row"
                  :class="{ 'is-selected': dmTarget === m.email }"
                  @click="dmTarget = m.email"
                >
                  <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="28" />
                  <span>{{ displayName(m.email, members) }}</span>
                </div>
              </div>
            </template>

            <!-- Gruppo: nome + selezione multipla -->
            <template v-else>
              <label class="field-label md-text-field-label" style="margin-top:16px">Nome gruppo</label>
              <input v-model="groupName" class="field-input md-text-field-input" placeholder="Es. Marketing team" />
              <label class="field-label md-text-field-label" style="margin-top:16px">Partecipanti</label>
              <div class="member-list">
                <div
                  v-for="m in otherMembers"
                  :key="m.email"
                  class="member-row"
                  :class="{ 'is-selected': groupMembers.includes(m.email) }"
                  @click="toggleGroupMember(m.email)"
                >
                  <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="28" />
                  <span>{{ displayName(m.email, members) }}</span>
                  <MIcon v-if="groupMembers.includes(m.email)" name="check" :size="16" class="check-mark" />
                </div>
              </div>
            </template>
          </div>

          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" @click="showModal = false">Annulla</button>
            <button
              class="btn-primary md-btn md-btn--filled md-btn--rounded"
              :disabled="saving || (!isGroup && !dmTarget) || (isGroup && (!groupName.trim() || !groupMembers.length))"
              @click="submit"
            >{{ saving ? 'Creazione…' : 'Crea' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal conferma cancellazione chat -->
    <Teleport to="body">
      <div v-if="chatToDelete" class="modal-backdrop md-modal-backdrop" @click.self="chatToDelete = null">
        <div class="modal modal--confirm">
          <div class="modal-header md-modal-header">
            <span class="modal-title md-modal-title">Eliminare la chat?</span>
            <button class="modal-close md-modal-close" @click="chatToDelete = null"><MIcon name="close" :size="18" /></button>
          </div>
          <div class="modal-body md-modal-body">
            <p class="confirm-text">
              Stai per eliminare <strong>{{ chatToDelete.name }}</strong>.
              L'azione è irreversibile: cronologia e pendenze della chat verranno rimosse.
            </p>
          </div>
          <div class="modal-footer md-modal-footer">
            <button class="btn-ghost md-btn md-btn--outlined md-btn--rounded" :disabled="deleting" @click="chatToDelete = null">Annulla</button>
            <button class="btn-danger md-btn md-btn--danger md-btn--rounded" :disabled="deleting" @click="confirmDelete">
              {{ deleting ? 'Eliminazione…' : 'Elimina' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cv {
  padding: 0;
  position: relative;
  min-height: calc(100vh - 120px);
}

/* Page header (stile uniforme PULSAR) */
.cv-header {
  padding: 18px 20px 14px;
  background: #fff;
  border-bottom: 1px solid #E8E5DF;
}

.p-page-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.p-page-sub { font-size: 12px; color: #9B9590; margin: 0; }

/* Loading */
.loading-list {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-skel {
  height: 62px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: #E8E5DF;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Empty */
.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  line-height: 1.7;
}

/* Chat list */
.chat-list { display: flex; flex-direction: column; }

.chat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid #F0EDE8;
  cursor: pointer;
  transition: background 0.15s;
  background: #fff;
}

.chat-row:hover { background: #F8F6F2; }

.chat-avatar {
  width: 46px;
  height: 46px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-info { flex: 1; min-width: 0; }

.chat-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 3px;
}

.chat-name { font-size: 14px; font-weight: 600; color: #1A1917; }
.chat-time { font-size: 11px; color: #9B9590; flex-shrink: 0; margin-left: 8px; }

.chat-preview {
  font-size: 12px;
  color: #6A6560;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #C8C5C0;
  padding: 4px 6px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.delete-btn:hover { color: #C8521A; background: #C8521A10; }

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.modal-title { font-size: 16px; font-weight: 600; color: #1A1917; }

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #9B9590;
  padding: 2px;
  border-radius: var(--md-sys-shape-corner-extra-small);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.type-toggle {
  display: flex;
  background: #F4F2EE;
  border-radius: 10px;
  padding: 3px;
}

.type-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: none;
  border-radius: var(--md-sys-shape-corner-small);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  color: #6A6560;
  transition: all 0.15s;
}

.type-btn.is-active {
  background: #fff;
  color: #1A1917;
  box-shadow: var(--md-sys-elevation-level-1);
}

.field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9B9590;
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  background: #F4F2EE;
  border: 1px solid #E8E5DF;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus { border-color: var(--md-sys-color-primary); }

.member-list { display: flex; flex-direction: column; gap: 4px; }

.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 14px;
  color: #1A1917;
}

.member-row:hover { background: #F4F2EE; }

.member-row.is-selected {
  background: color-mix(in srgb, var(--md-sys-color-primary) 7%, transparent);
  color: var(--md-sys-color-primary-hover);
  font-weight: 600;
}

.m-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.check-mark { margin-left: auto; color: var(--md-sys-color-primary); }

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid #E8E5DF;
}

.btn-ghost {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid #E8E5DF;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #6A6560;
  font-family: 'Outfit', sans-serif;
}

.btn-primary {
  flex: 2;
  padding: 12px;
  background: var(--md-sys-color-primary);
  border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: var(--md-sys-color-primary-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Variante danger per modal di conferma cancellazione */
.btn-danger {
  flex: 2;
  padding: 12px;
  background: var(--md-sys-color-error);
  border: none;
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: var(--md-sys-color-on-error);
  font-family: 'Outfit', sans-serif;
  transition: background 0.15s;
}
.btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-sys-color-error), black 12%);
}
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.modal--confirm { max-width: 380px; }
.confirm-text { font-size: 14px; line-height: 1.5; color: #1A1917; margin: 0; }
.confirm-text strong { font-weight: 600; }
</style>
