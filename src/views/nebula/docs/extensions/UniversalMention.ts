/**
 * UniversalMention — TipTap Extension (F5-C2) per il picker `@` poliglotta.
 *
 * NOT un Node — non aggiunge schema. È solo il Suggestion plugin con
 * trigger `@` che, alla selezione, dispatch a uno dei 3 nodi esistenti:
 * `userMention`, `taskMention`, `projectMention`.
 *
 * Pattern Notion: 1 trigger, 3 tipi di risultato grouped. # resta come
 * fast-path per progetti (utenti esperti).
 *
 * Items source: team members + tasks + projects, passati come getter
 * (no Ref → trap hasOwnProperty, vedi feedback_tiptap_vue_proxy).
 */
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import { PluginKey } from '@tiptap/pm/state'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import UniversalSuggester, { type UniversalItem } from '../components/UniversalSuggester.vue'
import type { Task } from '../../../../composables/sidera/useAllTasks'
import type { Project } from '../../../../composables/sidera/useProjects'
import type { TeamMember } from '../../../../composables/sidera/useTeamMembers'
import type { DocLight } from '../../../../composables/nebula/useDocsLight'
import type { Obiettivo } from '../../../../composables/sidera/useObiettivi'

const UNIVERSAL_MENTION_PLUGIN_KEY = new PluginKey('nebula-universal-mention')

export interface UniversalMentionOptions {
  allTeam: () => TeamMember[]
  allTasks: () => Task[]
  allProjects: () => Project[]
  allDocs: () => DocLight[]
  /** Milestone e deliverable sono task con type dedicato (vedi useAllTasks). */
  allMilestones: () => Task[]
  allDeliverables: () => Task[]
  allObiettivi: () => Obiettivo[]
  /** Doc corrente: lo escludiamo dai suggerimenti (un doc non si mention da solo). */
  currentDocId?: () => string | null
}

const MAX_PER_KIND = 6      // max per categoria nel picker (totale max 18)

/** Mappa task/milestone/deliverable (stessa shape) in UniversalItem. */
function mapTaskLike(items: Task[], kind: 'task' | 'milestone' | 'deliverable', q: string): UniversalItem[] {
  return items
    .filter(t => !q || (t.title ?? '').toLowerCase().includes(q))
    .map(t => ({
      kind,
      id: t.id,
      label: t.title || '(senza titolo)',
      sub: t.projectId || undefined,
      status: t.status === 'done' ? 'done' : undefined,
      searchKey: t.id,
      projectId: t.projectId || undefined,
    }))
    .sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0
      const bd = b.status === 'done' ? 1 : 0
      if (ad !== bd) return ad - bd
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return 0
    })
    .slice(0, MAX_PER_KIND)
}

function filterUniversal(
  query: string,
  team: TeamMember[],
  tasks: Task[],
  projects: Project[],
  docs: DocLight[],
  milestones: Task[],
  deliverables: Task[],
  obiettivi: Obiettivo[],
  excludeDocId: string | null,
): UniversalItem[] {
  const q = query.toLowerCase().trim()

  // USERS: nome o email matchano. Non hidden + active prima.
  const teamItems: UniversalItem[] = team
    .filter(m => {
      const haystack = [
        (m.firstName ?? ''),
        (m.lastName ?? ''),
        m.email,
      ].join(' ').toLowerCase()
      return !q || haystack.includes(q)
    })
    .map(m => {
      const fullName = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email
      return {
        kind: 'user' as const,
        id: m.email,
        label: fullName,
        sub: m.email !== fullName ? m.email : (m.category ?? ''),
        status: m.active === false ? 'inactive' : undefined,
        searchKey: m.email,
      }
    })
    .sort((a, b) => {
      // inactive ultimi
      const ai = a.status === 'inactive' ? 1 : 0
      const bi = b.status === 'inactive' ? 1 : 0
      if (ai !== bi) return ai - bi
      // startsWith vs includes
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return a.label.localeCompare(b.label)
    })
    .slice(0, MAX_PER_KIND)

  // TASKS: titolo matcha. Non-done prima.
  const taskItems: UniversalItem[] = tasks
    .filter(t => !q || (t.title ?? '').toLowerCase().includes(q))
    .map(t => ({
      kind: 'task' as const,
      id: t.id,
      label: t.title || '(senza titolo)',
      sub: t.projectId || undefined,
      status: t.status === 'done' ? 'done' : undefined,
      searchKey: t.id,
      projectId: t.projectId || undefined,
    }))
    .sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0
      const bd = b.status === 'done' ? 1 : 0
      if (ad !== bd) return ad - bd
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return 0
    })
    .slice(0, MAX_PER_KIND)

  // PROJECTS: nome matcha. Esclude archiviati di default a meno che query li trovi.
  const projectItems: UniversalItem[] = projects
    .filter(p => !p.archived || (q && (p.name ?? '').toLowerCase().includes(q)))
    .filter(p => !q || (p.name ?? '').toLowerCase().includes(q))
    .map(p => ({
      kind: 'project' as const,
      id: p.id,
      label: p.name || '(senza nome)',
      sub: p.taskCount > 0 ? `${p.doneCount}/${p.taskCount} task` : undefined,
      status: p.archived ? 'archived' : (p.completed ? 'completed' : undefined),
      searchKey: p.id,
      color: p.color,
    }))
    .sort((a, b) => {
      const aArc = a.status === 'archived' ? 2 : (a.status === 'completed' ? 1 : 0)
      const bArc = b.status === 'archived' ? 2 : (b.status === 'completed' ? 1 : 0)
      if (aArc !== bArc) return aArc - bArc
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return 0
    })
    .slice(0, MAX_PER_KIND)

  // DOCS: titolo matcha. Esclude il doc corrente. Niente status (i doc archived
  // non arrivano da useDocsLight). Max MAX_PER_KIND.
  const docItems: UniversalItem[] = docs
    .filter(d => d.id !== excludeDocId)
    .filter(d => !q || (d.title ?? '').toLowerCase().includes(q))
    .map(d => ({
      kind: 'doc' as const,
      id: d.id,
      label: d.title || '(senza titolo)',
      searchKey: d.id,
    }))
    .sort((a, b) => {
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return 0
    })
    .slice(0, MAX_PER_KIND)

  // MILESTONE / DELIVERABLE: stessa shape dei task, type dedicato.
  const milestoneItems = mapTaskLike(milestones, 'milestone', q)
  const deliverableItems = mapTaskLike(deliverables, 'deliverable', q)

  // OBIETTIVI: titolo matcha. Esclude archiviati a meno che query li trovi.
  const obiettivoItems: UniversalItem[] = obiettivi
    .filter(o => o.stato !== 'archiviato' || (q && (o.titolo ?? '').toLowerCase().includes(q)))
    .filter(o => !q || (o.titolo ?? '').toLowerCase().includes(q))
    .map(o => ({
      kind: 'obiettivo' as const,
      id: o.id,
      label: o.titolo || '(senza titolo)',
      status: o.stato === 'archiviato' ? 'archived' : (o.stato === 'raggiunto' ? 'completed' : undefined),
      searchKey: o.id,
      color: o.colore,
    }))
    .sort((a, b) => {
      const aArc = a.status === 'archived' ? 2 : (a.status === 'completed' ? 1 : 0)
      const bArc = b.status === 'archived' ? 2 : (b.status === 'completed' ? 1 : 0)
      if (aArc !== bArc) return aArc - bArc
      if (q) {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (as !== bs) return as - bs
      }
      return 0
    })
    .slice(0, MAX_PER_KIND)

  return [
    ...teamItems, ...taskItems, ...milestoneItems, ...deliverableItems,
    ...projectItems, ...obiettivoItems, ...docItems,
  ]
}

export const UniversalMention = Extension.create<UniversalMentionOptions>({
  name: 'universalMention',

  addOptions() {
    return {
      allTeam: () => [] as TeamMember[],
      allTasks: () => [] as Task[],
      allProjects: () => [] as Project[],
      allDocs: () => [] as DocLight[],
      allMilestones: () => [] as Task[],
      allDeliverables: () => [] as Task[],
      allObiettivi: () => [] as Obiettivo[],
      currentDocId: () => null,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: UNIVERSAL_MENTION_PLUGIN_KEY,
        char: '@',
        startOfLine: false,
        allowSpaces: true,
        items: ({ query }: { query: string }) =>
          filterUniversal(
            query,
            options.allTeam(),
            options.allTasks(),
            options.allProjects(),
            options.allDocs(),
            options.allMilestones(),
            options.allDeliverables(),
            options.allObiettivi(),
            options.currentDocId?.() ?? null,
          ),
        command: ({ editor, range, props }: any) => {
          const item = props as UniversalItem
          let nodeContent: any
          if (item.kind === 'user') {
            nodeContent = { type: 'userMention', attrs: { email: item.id } }
          } else if (item.kind === 'task') {
            nodeContent = { type: 'taskMention', attrs: { taskId: item.id, projectId: item.projectId ?? null } }
          } else if (item.kind === 'milestone') {
            nodeContent = { type: 'milestoneMention', attrs: { milestoneId: item.id, projectId: item.projectId ?? null } }
          } else if (item.kind === 'deliverable') {
            nodeContent = { type: 'deliverableMention', attrs: { deliverableId: item.id, projectId: item.projectId ?? null } }
          } else if (item.kind === 'project') {
            nodeContent = { type: 'projectMention', attrs: { projectId: item.id } }
          } else if (item.kind === 'obiettivo') {
            nodeContent = { type: 'obiettivoMention', attrs: { obiettivoId: item.id, title: item.label } }
          } else {
            // doc: passa anche il titolo snapshot per fallback display
            nodeContent = { type: 'docMention', attrs: { docId: item.id, title: item.label } }
          }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([nodeContent, { type: 'text', text: ' ' }])
            .run()
        },
        render: () => {
          let component: VueRenderer | null = null
          let popup: TippyInstance[] | null = null
          return {
            onStart: (p: any) => {
              component = new VueRenderer(UniversalSuggester, { props: p, editor: p.editor })
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
