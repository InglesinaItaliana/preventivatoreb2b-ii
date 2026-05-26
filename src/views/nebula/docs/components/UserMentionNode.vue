<script setup lang="ts">
/**
 * UserMentionNode — NodeView per il nodo TipTap `userMention`.
 *
 * Riceve `node.attrs.email`. Risolve nome+avatar via useUserMini.
 * Click: per ora apre /nebula (vista team) — futuro F6: drawer profilo.
 *
 * Storage in ProseMirror JSON:
 *   { "type": "userMention", "attrs": { "email": "marco@inglesina.it" } }
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useUserMini } from '../../../../composables/nebula/useUserMini'
import { useTeamMembers, starAvatarProps } from '../../../../composables/sidera/useTeamMembers'
import StarAvatar from '../../../../components/shared/StarAvatar.vue'

const props = defineProps<{
  node: {
    attrs: {
      email: string | null
    }
  }
}>()

const emailRef = toRef(() => props.node.attrs.email)
const { data: user, loading, notFound } = useUserMini(emailRef)
const { members } = useTeamMembers()

const displayLabel = computed(() => {
  if (loading.value) return '@…'
  if (notFound.value) return `@${props.node.attrs.email ?? '?'}`
  return `@${user.value?.displayName ?? props.node.attrs.email ?? '?'}`
})

function onClick() {
  // Apre la vista Team di NEBULA (futuro: drawer profilo dedicato)
  if (props.node.attrs.email) {
    window.open('/nebula', '_blank')
  }
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="um-chip"
    :class="{
      'um-loading': loading,
      'um-deleted': notFound,
      'um-inactive': user && !user.active,
    }"
    :title="user?.displayName ?? (notFound ? 'Utente non trovato' : 'Caricamento…')"
    contenteditable="false"
    @click="notFound ? null : onClick()"
  >
    <span class="um-avatar">
      <StarAvatar
        v-if="user"
        v-bind="starAvatarProps(user.email, members)"
        :size="14"
      />
      <span v-else class="um-avatar-fallback">·</span>
    </span>
    <span class="um-label">{{ displayLabel }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.um-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 3px;
  margin: 0 2px;
  background: rgba(74, 107, 138, 0.12);   /* blu amministrazione, neutro */
  border: 1px solid rgba(74, 107, 138, 0.30);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #2F4F6F;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.um-chip:hover {
  background: rgba(74, 107, 138, 0.22);
  border-color: rgba(74, 107, 138, 0.50);
}

.um-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.um-avatar-fallback {
  display: inline-flex;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(0,0,0,0.10);
  color: #888;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.um-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.um-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}

.um-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}

.um-inactive {
  opacity: 0.55;
  font-style: italic;
}
</style>
