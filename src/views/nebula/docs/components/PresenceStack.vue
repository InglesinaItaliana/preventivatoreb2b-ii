<script setup lang="ts">
/**
 * PresenceStack — avatar stack degli utenti attivi nell'editor NEBULA-DOCS.
 *
 * Mostra fino a 3 avatar StarAvatar (riusato dal pattern team), poi "+N" se
 * più. Tooltip su hover con displayName. Anello esterno del cursorColor.
 *
 * Niente Chevron, niente emoji — coerente con design language suite.
 */
import { computed } from 'vue'
import StarAvatar from '../../../../components/shared/StarAvatar.vue'
import { useTeamMembers, starAvatarProps } from '../../../../composables/sidera/useTeamMembers'
import type { PresenceRecord } from '../../../../composables/nebula/useDocPresence'

const props = defineProps<{
  peers: PresenceRecord[]
  /** Max avatar visibili prima del badge "+N" */
  maxVisible?: number
}>()

const { members } = useTeamMembers()

const visible = computed(() => props.peers.slice(0, props.maxVisible ?? 3))
const overflow = computed(() => Math.max(0, props.peers.length - (props.maxVisible ?? 3)))
</script>

<template>
  <div v-if="peers.length > 0" class="ps-stack" :title="`${peers.length} utente${peers.length > 1 ? ' attivi' : ' attivo'}`">
    <span
      v-for="p in visible"
      :key="p.userId"
      class="ps-item"
      :title="p.displayName + (p.activeBlock ? ' · sta scrivendo…' : '')"
      :style="{ '--ps-cursor': p.cursorColor }"
    >
      <StarAvatar
        v-bind="starAvatarProps(p.email, members)"
        :size="22"
      />
    </span>
    <span v-if="overflow > 0" class="ps-overflow">+{{ overflow }}</span>
  </div>
</template>

<style scoped>
.ps-stack {
  display: inline-flex;
  align-items: center;
}
.ps-item {
  display: inline-flex;
  position: relative;
  border-radius: 50%;
  /* Anello esterno = cursorColor per identità visiva del peer */
  box-shadow: 0 0 0 2px var(--ps-cursor, #999), 0 0 0 3px #fff;
  background: #fff;
  margin-left: -6px;
  cursor: default;
  transition: transform 120ms ease, z-index 0ms;
  z-index: 1;
}
.ps-item:first-child { margin-left: 0; }
.ps-item:hover {
  transform: translateY(-2px);
  z-index: 5;
}
.ps-overflow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ddd;
  color: #555;
  font-size: 10px;
  font-weight: 600;
  margin-left: -6px;
  box-shadow: 0 0 0 2px #999, 0 0 0 3px #fff;
}
</style>
