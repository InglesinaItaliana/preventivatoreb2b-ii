/**
 * DeliverableMention — TipTap Node (atom inline) per menzioni di deliverable CEPHEID.
 *
 * Un deliverable è un task con type=deliverable dentro projects/{projectId}/tasks,
 * quindi gli attrs ricalcano quelli di TaskMention ({ deliverableId, projectId }).
 * Stesso pattern di DocMention/TaskMention: niente suggester proprio (passa da
 * UniversalMention con trigger `@`), solo nodo schema:
 *   - render: DeliverableMentionNode.vue (pill cliccabile con icona inventory)
 *   - parseHTML: span[data-type="deliverable-mention"]
 *   - storage: { type: 'deliverableMention', attrs: { deliverableId, projectId } }
 *
 * ATTENZIONE: nome nodo + attrs devono combaciare con il backend MCP
 * (tools.ts → linkDeliverable) altrimenti il chip inserito da Claude viene
 * scartato dallo schema all'apertura del doc.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import DeliverableMentionNode from '../components/DeliverableMentionNode.vue'

export const DeliverableMention = Node.create({
  name: 'deliverableMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      deliverableId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deliverable-id'),
        renderHTML: (attrs) => attrs.deliverableId ? { 'data-deliverable-id': attrs.deliverableId } : {},
      },
      projectId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-project-id'),
        renderHTML: (attrs) => attrs.projectId ? { 'data-project-id': attrs.projectId } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="deliverable-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'deliverable-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(DeliverableMentionNode)
  },
})
