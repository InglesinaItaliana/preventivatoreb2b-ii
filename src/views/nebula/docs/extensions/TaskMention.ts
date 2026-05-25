/**
 * TaskMention — TipTap Node + Suggestion per menzionare task CEPHEID.
 *
 * Trigger: `@` (familiare a Notion / Slack). In Fase 2 chunk 2 supporta solo
 * task; in chunk 3 e successivi `@` potrebbe diventare poliglotta (task +
 * progetto + utente) o restare task-only se introduciamo trigger separati
 * per gli altri tipi.
 *
 * Storage in ProseMirror JSON:
 *   { "type": "task-mention", "attrs": { "taskId": "abc", "projectId": "p1" } }
 *
 * Render:
 *   - HTML (serializzazione clipboard): <span data-type="task-mention" data-task-id="..." data-project-id="..."></span>
 *   - Vue NodeView (UI): TaskMentionNode.vue (live subscribe via useTaskMini)
 *
 * Picker (Suggestion popup): TaskSuggester.vue, typeahead su titolo task.
 * Sorgente dati: l'array `allTasks` passato via configure(), tipicamente
 * proveniente da useAllTasks() in NebulaDocView (1 sola sottoscrizione
 * collectionGroup per editor mounted).
 *
 * Vedi docs/NEBULA-DOCS.md §4.3 per la spec del nodo.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import Suggestion from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import { PluginKey } from '@tiptap/pm/state'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import TaskMentionNode from '../components/TaskMentionNode.vue'
import TaskSuggester from '../components/TaskSuggester.vue'
import type { Task } from '../../../../composables/sidera/useAllTasks'

// Key distinta dal SlashCommand Suggestion (ProseMirror crasha se 2 plugin
// hanno la stessa key). Anche project/user mention futuri devono avere la
// loro PluginKey unica.
const TASK_MENTION_PLUGIN_KEY = new PluginKey('nebula-task-mention')

export interface TaskMentionOptions {
  /**
   * Getter che ritorna l'array corrente dei task per il typeahead.
   * Passare una funzione (non un Ref) — TipTap fa introspezione delle options
   * e i Proxy reattivi Vue rompono setContent / config (stesso pattern del trap
   * hasOwnProperty già documentato).
   *
   * Esempio:
   *   const { tasks } = useAllTasks()
   *   TaskMention.configure({ allTasks: () => tasks.value })
   */
  allTasks: () => Task[]
}

function filterTasks(tasks: Task[], query: string, limit = 20): Task[] {
  const q = query.toLowerCase().trim()
  if (!q) {
    // No query: priorità ai task non-done, ordine già createdAt desc da useAllTasks
    return tasks.filter(t => t.status !== 'done').slice(0, limit)
  }
  return tasks
    .filter(t => (t.title ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      // Non-done prima dei done
      if (a.status === 'done' && b.status !== 'done') return 1
      if (b.status === 'done' && a.status !== 'done') return -1
      // Poi ordine startsWith vs includes (startsWith più rilevante)
      const aStarts = (a.title ?? '').toLowerCase().startsWith(q)
      const bStarts = (b.title ?? '').toLowerCase().startsWith(q)
      if (aStarts && !bStarts) return -1
      if (bStarts && !aStarts) return 1
      return 0
    })
    .slice(0, limit)
}

export const TaskMention = Node.create<TaskMentionOptions>({
  name: 'taskMention',
  group: 'inline',
  inline: true,
  atom: true,           // singolo blocco, non editabile inline
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      // Default: getter vuoto. Sovrascritto da configure({ allTasks: () => ... }).
      allTasks: () => [] as Task[],
    }
  },

  addAttributes() {
    return {
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-id'),
        renderHTML: (attrs) => attrs.taskId ? { 'data-task-id': attrs.taskId } : {},
      },
      projectId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-project-id'),
        renderHTML: (attrs) => attrs.projectId ? { 'data-project-id': attrs.projectId } : {},
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-type="task-mention"]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'task-mention' }, HTMLAttributes),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskMentionNode)
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: TASK_MENTION_PLUGIN_KEY,
        char: '@',
        startOfLine: false,
        allowSpaces: true,  // permette di cercare "stiletto rosso" non solo "stiletto"
        items: ({ query }: { query: string }) => filterTasks(options.allTasks(), query),
        command: ({ editor, range, props }: any) => {
          const { id: taskId, projectId } = props as { id: string; projectId: string }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'taskMention',
                attrs: { taskId, projectId: projectId || null },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        render: () => {
          let component: VueRenderer | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (p: any) => {
              component = new VueRenderer(TaskSuggester, {
                props: p,
                editor: p.editor,
              })
              if (!p.clientRect) return
              popup = tippy('body', {
                getReferenceClientRect: p.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                offset: [0, 8],
                animation: 'fade',
                theme: 'nebula-mention',
              })
            },
            onUpdate(p: any) {
              component?.updateProps(p)
              if (!p.clientRect || !popup) return
              popup[0].setProps({ getReferenceClientRect: p.clientRect })
            },
            onKeyDown(p: any) {
              if (p.event.key === 'Escape') {
                popup?.[0].hide()
                return true
              }
              return (component?.ref as { onKeyDown?: (e: any) => boolean })?.onKeyDown?.(p) ?? false
            },
            onExit() {
              popup?.[0].destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
      }),
    ]
  },
})
