<script setup lang="ts">
/**
 * ProjectMentionNode — NodeView Vue per il nodo TipTap `project-mention`.
 *
 * Render chip inline (simmetria con TaskMentionNode). View 'card' verrà
 * aggiunta in un chunk successivo via attr `view`.
 *
 * Riceve `node.attrs.projectId`. Subscribe live via useProjectMini.
 * Click → apre /cepheid/project/{id} in nuova tab.
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useProjectMini } from '../../../../composables/nebula/useProjectMini'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps<{
  node: {
    attrs: {
      projectId: string | null
    }
  }
}>()

const projectIdRef = toRef(() => props.node.attrs.projectId)
const { data: project, loading, notFound } = useProjectMini(projectIdRef)

const truncatedName = computed(() => {
  const n = project.value?.name ?? ''
  return n.length > 45 ? n.slice(0, 42) + '…' : n
})

const progressLabel = computed(() => {
  if (!project.value) return ''
  const { taskCount, doneCount } = project.value
  if (taskCount === 0) return ''
  return `${doneCount}/${taskCount}`
})

const projectColor = computed(() => project.value?.color ?? '#5B7F2E')

function onClick() {
  if (!project.value) return
  window.open(`/cepheid/project/${project.value.id}`, '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="pm-chip"
    :class="{
      'pm-loading': loading,
      'pm-deleted': notFound,
      'pm-completed': project?.completed,
      'pm-archived': project?.archived,
    }"
    :style="{ '--pm-color': projectColor }"
    :title="project?.name ?? (notFound ? 'Progetto eliminato' : 'Caricamento…')"
    contenteditable="false"
    @click="notFound ? null : onClick()"
  >
    <span v-if="loading" class="pm-icon">
      <MaterialIcon name="hourglass_top" :size="14" />
    </span>
    <span v-else-if="notFound" class="pm-icon">
      <MaterialIcon name="folder_off" :size="14" />
    </span>
    <span v-else class="pm-icon">
      <MaterialIcon
        :name="project?.completed ? 'folder_special' : 'folder'"
        :size="14"
        :fill="project?.completed ? 1 : 0"
      />
    </span>
    <span class="pm-label">
      <template v-if="loading">…</template>
      <template v-else-if="notFound">[Progetto eliminato]</template>
      <template v-else>{{ truncatedName }}</template>
    </span>
    <span v-if="progressLabel && !loading && !notFound" class="pm-progress">
      {{ progressLabel }}
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.pm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--pm-color, #5B7F2E) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--pm-color, #5B7F2E) 35%, transparent);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: color-mix(in srgb, var(--pm-color, #5B7F2E) 85%, #1a1a1a);
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.pm-chip:hover {
  background: color-mix(in srgb, var(--pm-color, #5B7F2E) 22%, transparent);
  border-color: color-mix(in srgb, var(--pm-color, #5B7F2E) 55%, transparent);
}
.pm-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.pm-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.pm-progress {
  font-size: 0.78em;
  color: rgba(0,0,0,0.5);
  padding-left: 4px;
  border-left: 1px solid color-mix(in srgb, var(--pm-color, #5B7F2E) 30%, transparent);
  margin-left: 2px;
  flex-shrink: 0;
}

.pm-completed {
  opacity: 0.7;
}
.pm-completed .pm-label { text-decoration: line-through; }

.pm-archived {
  opacity: 0.45;
  filter: grayscale(0.4);
}

.pm-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}

.pm-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
