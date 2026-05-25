/**
 * ProjectMention — TipTap Node + Suggestion per menzionare progetti CEPHEID.
 *
 * Trigger: `#` (analogo a Slack channels — distinto da `@` task per evitare
 * collisione tipo + PluginKey unica). Slash `/progetto` inserisce `#` per
 * triggerare il picker.
 *
 * Storage in ProseMirror JSON:
 *   { "type": "project-mention", "attrs": { "projectId": "abc" } }
 *
 * Render:
 *   - HTML: <span data-type="project-mention" data-project-id="..."></span>
 *   - Vue NodeView: ProjectMentionNode.vue (chip inline, view='card' futuro)
 *
 * Vedi docs/NEBULA-DOCS.md §4.3.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import Suggestion from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import { PluginKey } from '@tiptap/pm/state'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import ProjectMentionNode from '../components/ProjectMentionNode.vue'
import ProjectSuggester from '../components/ProjectSuggester.vue'
import type { Project } from '../../../../composables/sidera/useProjects'

const PROJECT_MENTION_PLUGIN_KEY = new PluginKey('nebula-project-mention')

export interface ProjectMentionOptions {
  /** Getter che ritorna l'array dei progetti per il typeahead. Passare funzione, non Ref. */
  allProjects: () => Project[]
}

function filterProjects(projects: Project[], query: string, limit = 20): Project[] {
  const q = query.toLowerCase().trim()
  // Esclude archiviati di default (visibili solo se cercati esplicitamente)
  const active = projects.filter(p => !p.archived)
  if (!q) {
    return active
      .sort((a, b) => Number(a.completed) - Number(b.completed))  // non-completati prima
      .slice(0, limit)
  }
  return projects
    .filter(p => (p.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      // Archiviati ultimi
      if (a.archived !== b.archived) return a.archived ? 1 : -1
      // Completati dopo i non
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      // startsWith vs includes
      const aStarts = (a.name ?? '').toLowerCase().startsWith(q)
      const bStarts = (b.name ?? '').toLowerCase().startsWith(q)
      if (aStarts && !bStarts) return -1
      if (bStarts && !aStarts) return 1
      return 0
    })
    .slice(0, limit)
}

export const ProjectMention = Node.create<ProjectMentionOptions>({
  name: 'projectMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      allProjects: () => [] as Project[],
    }
  },

  addAttributes() {
    return {
      projectId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-project-id'),
        renderHTML: (attrs) => attrs.projectId ? { 'data-project-id': attrs.projectId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="project-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'project-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(ProjectMentionNode)
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: PROJECT_MENTION_PLUGIN_KEY,
        char: '#',
        startOfLine: false,
        allowSpaces: true,
        items: ({ query }: { query: string }) => filterProjects(options.allProjects(), query),
        command: ({ editor, range, props }: any) => {
          const { id: projectId } = props as { id: string }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: 'projectMention', attrs: { projectId } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        render: () => {
          let component: VueRenderer | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (p: any) => {
              component = new VueRenderer(ProjectSuggester, { props: p, editor: p.editor })
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
