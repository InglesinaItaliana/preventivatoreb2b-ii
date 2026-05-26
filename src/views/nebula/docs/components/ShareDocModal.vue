<script setup lang="ts">
/**
 * ShareDocModal — modal per modificare ACL del doc NEBULA-DOCS.
 *
 * Solo owner può aprire/applicare (gate UI + server-side via shareDoc callable).
 *
 * Mostra:
 *  - Toggle visibility: private / team (public riservato a futuro)
 *  - Lista team members con checkbox per writer access
 *  - Mostra chi è owner (read-only, non modificabile da qui)
 */
import { ref, computed, watch } from 'vue'
import { useTeamMembers, displayName, starAvatarProps } from '../../../../composables/sidera/useTeamMembers'
import StarAvatar from '../../../../components/shared/StarAvatar.vue'
import MaterialIcon from './MaterialIcon.vue'
import { shareDoc } from '../../../../composables/nebula/useShareDoc'
import type { NebulaDocAcl } from '../../../../composables/nebula/useDoc'

const props = defineProps<{
  docId: string
  acl: NebulaDocAcl
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', acl: NebulaDocAcl): void
}>()

const { members } = useTeamMembers()

// Stato locale (draft) — confermato solo al click "Salva"
const draftVisibility = ref<NebulaDocAcl['visibility']>(props.acl.visibility)
const draftWriters = ref<string[]>([...props.acl.writers])
const saving = ref(false)
const error = ref('')

watch(() => props.acl, (acl) => {
  draftVisibility.value = acl.visibility
  draftWriters.value = [...acl.writers]
})

function toggleWriter(email: string) {
  const e = email.toLowerCase().trim()
  if (draftWriters.value.includes(e)) {
    draftWriters.value = draftWriters.value.filter(w => w !== e)
  } else {
    draftWriters.value = [...draftWriters.value, e]
  }
}

const isOwner = (email: string) => props.acl.owners.includes(email.toLowerCase().trim())
const isDraftWriter = (email: string) => draftWriters.value.includes(email.toLowerCase().trim())

const hasChanges = computed(() => {
  if (draftVisibility.value !== props.acl.visibility) return true
  const a = [...draftWriters.value].sort().join(',')
  const b = [...props.acl.writers].sort().join(',')
  return a !== b
})

async function save() {
  saving.value = true
  error.value = ''
  try {
    const out = await shareDoc({
      docId: props.docId,
      visibility: draftVisibility.value,
      writers: draftWriters.value,
    })
    emit('updated', out.acl)
    emit('close')
  } catch (e: any) {
    error.value = e?.message ?? String(e)
  } finally {
    saving.value = false
  }
}

const sortedMembers = computed(() =>
  [...members.value].sort((a, b) => {
    // Owner first, poi alfabetico
    const ao = isOwner(a.email) ? 0 : 1
    const bo = isOwner(b.email) ? 0 : 1
    if (ao !== bo) return ao - bo
    return displayName(a.email, members.value).localeCompare(displayName(b.email, members.value))
  })
)
</script>

<template>
  <div class="sdm-backdrop" @click.self="emit('close')">
    <div class="sdm-modal" @click.stop>
      <header class="sdm-header">
        <MaterialIcon name="share" :size="22" color="#C46030" />
        <h3>Condividi documento</h3>
        <button type="button" class="sdm-close" aria-label="Chiudi" @click="emit('close')">
          <MaterialIcon name="close" :size="18" />
        </button>
      </header>

      <section class="sdm-section">
        <label class="sdm-section-label">Visibilità</label>
        <div class="sdm-vis-options">
          <label
            class="sdm-vis-opt"
            :class="{ 'sdm-vis-opt-active': draftVisibility === 'private' }"
          >
            <input type="radio" v-model="draftVisibility" value="private" />
            <MaterialIcon name="lock" :size="16" />
            <span>
              <strong>Privato</strong>
              <em>Solo tu (e chi è esplicitamente in lista sotto)</em>
            </span>
          </label>
          <label
            class="sdm-vis-opt"
            :class="{ 'sdm-vis-opt-active': draftVisibility === 'team' }"
          >
            <input type="radio" v-model="draftVisibility" value="team" />
            <MaterialIcon name="groups" :size="16" />
            <span>
              <strong>Tutto il team</strong>
              <em>Lettura per chiunque del team Inglesina</em>
            </span>
          </label>
        </div>
      </section>

      <section class="sdm-section">
        <label class="sdm-section-label">
          Accesso in scrittura
          <span class="sdm-hint">— anche se "privato", queste persone vedono ed editano</span>
        </label>
        <ul class="sdm-members">
          <li
            v-for="m in sortedMembers"
            :key="m.email"
            class="sdm-member"
            :class="{ 'sdm-member-owner': isOwner(m.email) }"
            @click="!isOwner(m.email) && toggleWriter(m.email)"
          >
            <StarAvatar v-bind="starAvatarProps(m.email, members)" :size="24" />
            <span class="sdm-member-name">{{ displayName(m.email, members) }}</span>
            <span v-if="isOwner(m.email)" class="sdm-member-tag">owner</span>
            <span v-else class="sdm-member-toggle">
              <input
                type="checkbox"
                :checked="isDraftWriter(m.email)"
                @click.stop="toggleWriter(m.email)"
              />
            </span>
          </li>
        </ul>
      </section>

      <div v-if="error" class="sdm-error">
        <MaterialIcon name="error" :size="14" /> {{ error }}
      </div>

      <footer class="sdm-footer">
        <button type="button" class="sdm-btn sdm-btn-secondary" @click="emit('close')">
          Annulla
        </button>
        <button
          type="button"
          class="sdm-btn sdm-btn-primary"
          :disabled="!hasChanges || saving"
          @click="save"
        >
          {{ saving ? 'Salvataggio…' : 'Salva condivisione' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.sdm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.sdm-modal {
  background: white;
  border-radius: 16px;
  padding: 0;
  max-width: 520px;
  width: 100%;
  max-height: 88vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  font-family: 'Outfit', system-ui, sans-serif;
  animation: sdm-modal-in 200ms ease-out;
}
@keyframes sdm-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.sdm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.sdm-header h3 {
  flex: 1;
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  font-size: 22px;
  margin: 0;
}
.sdm-close {
  background: transparent;
  border: 0;
  cursor: pointer;
  color: #888;
  padding: 4px;
  display: flex;
}
.sdm-close:hover { color: #1a1a1a; }

.sdm-section {
  padding: 16px 22px;
}
.sdm-section + .sdm-section { border-top: 1px solid rgba(0,0,0,0.06); }
.sdm-section-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.sdm-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #aaa;
  font-size: 11px;
}

.sdm-vis-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sdm-vis-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 10px;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}
.sdm-vis-opt:hover {
  background: rgba(196, 96, 48, 0.04);
}
.sdm-vis-opt-active {
  background: rgba(196, 96, 48, 0.08);
  border-color: rgba(196, 96, 48, 0.40);
}
.sdm-vis-opt input[type=radio] {
  margin: 0;
  accent-color: #C46030;
}
.sdm-vis-opt span {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sdm-vis-opt strong {
  font-size: 13.5px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.sdm-vis-opt em {
  font-style: normal;
  font-size: 11.5px;
  color: #888;
}

.sdm-members {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 260px;
  overflow-y: auto;
}
.sdm-member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 80ms ease;
}
.sdm-member:hover { background: rgba(196, 96, 48, 0.06); }
.sdm-member-owner { cursor: default; background: rgba(196, 96, 48, 0.04); }
.sdm-member-owner:hover { background: rgba(196, 96, 48, 0.04); }
.sdm-member-name {
  flex: 1;
  font-size: 13.5px;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}
.sdm-member-tag {
  font-size: 10.5px;
  font-weight: 500;
  text-transform: uppercase;
  color: #C46030;
  background: rgba(196, 96, 48, 0.15);
  padding: 2px 8px;
  border-radius: 999px;
}
.sdm-member-toggle input {
  accent-color: #C46030;
  width: 18px;
  height: 18px;
}

.sdm-error {
  margin: 0 22px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #a82020;
}

.sdm-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 22px;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: #fafafa;
}
.sdm-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.sdm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sdm-btn-primary { background: #C46030; color: white; }
.sdm-btn-primary:hover:not(:disabled) { background: #B85425; }
.sdm-btn-secondary { background: rgba(0,0,0,0.06); color: #444; }
.sdm-btn-secondary:hover { background: rgba(0,0,0,0.10); }
</style>
