<script setup lang="ts">
/**
 * TaskMentionNode — NodeView Vue per il nodo TipTap `task-mention`.
 *
 * Riceve i node attrs `{ taskId, projectId }` via props standard `node` di
 * `@tiptap/vue-3`. Sottoscrive live al task via useTaskMini → il chip si
 * aggiorna automaticamente se title/status cambiano in CEPHEID.
 *
 * Stati visivi:
 *  - loading: skeleton chip
 *  - data ok: icona check_circle + title troncato + opacity 0.6 se done
 *  - notFound: chip grigio "[Task eliminato]" non interattivo (storico)
 *
 * Click: per ora alert TODO (F2-C6 collegherà al TaskDetailModal CEPHEID).
 */
import { computed, toRef } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useTaskMini } from '../../../../composables/nebula/useTaskMini'
import MaterialIcon from './MaterialIcon.vue'

// Props passati da @tiptap/vue-3 NodeViewWrapper
const props = defineProps<{
  node: {
    attrs: {
      taskId: string | null
      projectId: string | null
    }
  }
}>()

const taskIdRef = toRef(() => props.node.attrs.taskId)
const projectIdRef = toRef(() => props.node.attrs.projectId)

const { data: task, loading, notFound } = useTaskMini(taskIdRef, projectIdRef)

const truncatedTitle = computed(() => {
  const t = task.value?.title ?? ''
  return t.length > 50 ? t.slice(0, 47) + '…' : t
})

const isDone = computed(() => task.value?.status === 'done')

function onClick() {
  // TODO F2-C6: integrare con TaskDetailModal CEPHEID
  // Per ora navigazione semplice alla vista CEPHEID
  if (!task.value) return
  const pid = task.value.projectId
  const url = pid
    ? `/cepheid/project/${pid}`
    : `/cepheid`
  window.open(url, '_blank')
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="tm-chip"
    :class="{
      'tm-loading': loading,
      'tm-deleted': notFound,
      'tm-done': isDone,
    }"
    :title="task?.title ?? (notFound ? 'Task eliminato' : 'Caricamento…')"
    contenteditable="false"
    @click="notFound ? null : onClick()"
  >
    <span v-if="loading" class="tm-icon">
      <MaterialIcon name="hourglass_top" :size="14" />
    </span>
    <span v-else-if="notFound" class="tm-icon">
      <MaterialIcon name="link_off" :size="14" />
    </span>
    <span v-else class="tm-icon">
      <MaterialIcon name="task_alt" :size="14" :fill="isDone ? 1 : 0" />
    </span>
    <span class="tm-label">
      <template v-if="loading">…</template>
      <template v-else-if="notFound">[Task eliminato]</template>
      <template v-else>{{ truncatedTitle }}</template>
    </span>
  </NodeViewWrapper>
</template>

<style scoped>
.tm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  margin: 0 2px;
  background: rgba(212, 160, 32, 0.12);  /* CEPHEID oro */
  border: 1px solid rgba(212, 160, 32, 0.30);
  border-radius: 999px;
  font-size: 0.92em;
  line-height: 1.4;
  color: #8b6a14;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  transition: background 100ms ease, border-color 100ms ease;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.tm-chip:hover {
  background: rgba(212, 160, 32, 0.20);
  border-color: rgba(212, 160, 32, 0.50);
}
.tm-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.tm-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-done {
  opacity: 0.55;
  text-decoration: line-through;
  text-decoration-color: rgba(139, 106, 20, 0.45);
}

.tm-loading {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.06);
  color: #888;
  cursor: wait;
}

.tm-deleted {
  background: rgba(0,0,0,0.04);
  border-color: rgba(0,0,0,0.10);
  color: #999;
  cursor: not-allowed;
  text-decoration: line-through;
}
</style>
