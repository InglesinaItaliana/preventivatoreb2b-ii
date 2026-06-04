/**
 * MilestoneMention — TipTap Node (atom inline) per menzioni di milestone CEPHEID.
 *
 * Una milestone è un task con type=milestone dentro projects/{projectId}/tasks,
 * quindi gli attrs ricalcano quelli di TaskMention ({ milestoneId, projectId }).
 * Stesso pattern di DocMention/TaskMention: niente suggester proprio (passa da
 * UniversalMention con trigger `@`), solo nodo schema:
 *   - render: MilestoneMentionNode.vue (pill cliccabile con icona flag)
 *   - parseHTML: span[data-type="milestone-mention"]
 *   - storage: { type: 'milestoneMention', attrs: { milestoneId, projectId } }
 *
 * ATTENZIONE: nome nodo + attrs devono combaciare con il backend MCP
 * (tools.ts → linkMilestone) altrimenti il chip inserito da Claude viene
 * scartato dallo schema all'apertura del doc.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import MilestoneMentionNode from '../components/MilestoneMentionNode.vue'

export const MilestoneMention = Node.create({
  name: 'milestoneMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      milestoneId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-milestone-id'),
        renderHTML: (attrs) => attrs.milestoneId ? { 'data-milestone-id': attrs.milestoneId } : {},
      },
      projectId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-project-id'),
        renderHTML: (attrs) => attrs.projectId ? { 'data-project-id': attrs.projectId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="milestone-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'milestone-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(MilestoneMentionNode)
  },
})
