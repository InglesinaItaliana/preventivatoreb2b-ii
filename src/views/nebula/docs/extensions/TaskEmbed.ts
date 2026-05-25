/**
 * TaskEmbed — TipTap Node "database view" inline per NEBULA-DOCS.
 *
 * Mostra lista live filtrata di task CEPHEID dentro il documento. Niente
 * Suggestion plugin (è un nodo block, inserito via slash command, modificato
 * via UI inline del NodeView). Inserisce un nodo con filtro default
 * `{ status: 'todo', type: 'task' }` che l'utente può raffinare cliccando
 * ⚙ Filtri.
 *
 * Storage:
 *   { "type": "taskEmbed", "attrs": { "filter": {...}, "view": "list" } }
 *
 * Render: TaskEmbedNode.vue (NodeViewWrapper as="div" — block).
 *
 * Vedi docs/NEBULA-DOCS.md §4.3.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import TaskEmbedNode from '../components/TaskEmbedNode.vue'
import type { Task } from '../../../../composables/sidera/useAllTasks'
import type { Project } from '../../../../composables/sidera/useProjects'

export interface TaskEmbedOptions {
  /** Getter sui task. Pass come getter NON Ref (TipTap option-introspection trap). */
  allTasks: () => Task[]
  /** Getter sui progetti. Idem. */
  allProjects: () => Project[]
}

export const TaskEmbed = Node.create<TaskEmbedOptions>({
  name: 'taskEmbed',
  group: 'block',
  inline: false,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      allTasks: () => [] as Task[],
      allProjects: () => [] as Project[],
    }
  },

  addAttributes() {
    return {
      filter: {
        default: { status: 'todo', projectId: null, type: 'task', limit: 20 },
        parseHTML: (el) => {
          const raw = el.getAttribute('data-filter')
          if (!raw) return null
          try { return JSON.parse(raw) } catch { return null }
        },
        renderHTML: (attrs) => {
          if (!attrs.filter) return {}
          return { 'data-filter': JSON.stringify(attrs.filter) }
        },
      },
      view: {
        default: 'list',
        parseHTML: (el) => el.getAttribute('data-view') ?? 'list',
        renderHTML: (attrs) => ({ 'data-view': attrs.view ?? 'list' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'task-embed' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskEmbedNode)
  },

  // Helper: inserisce un embed con filtro default. Esposto come command per
  // riuso da slashCommands (/lista-task) e toolbar futura.
  addCommands() {
    return {
      insertTaskEmbed: (filter: Record<string, unknown> = {}) => ({ commands }: any) => {
        return commands.insertContent({
          type: 'taskEmbed',
          attrs: {
            filter: { status: 'todo', projectId: null, type: 'task', limit: 20, ...filter },
            view: 'list',
          },
        })
      },
    } as any
  },
})
