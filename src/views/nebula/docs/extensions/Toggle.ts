/**
 * Toggle — TipTap Node "sezione collassabile" per NEBULA-DOCS (stile Notion).
 *
 * Due nodi:
 *   - `toggle`        : group block, content `toggleSummary block+`, attr `open`.
 *   - `toggleSummary` : content `inline*` — il TITOLO, è CONTENUTO editabile
 *                       (non un attr) così l'editing collaborativo del titolo
 *                       merge-a correttamente in Yjs (gli attr sono LWW).
 *
 * Storage:
 *   { "type":"toggle", "attrs":{ "open":true }, "content":[
 *       { "type":"toggleSummary", "content":[ ...inline ] },
 *       ...block
 *   ]}
 *
 * Render: ToggleNode.vue (wrapper data-open + 1 NodeViewContent, collasso CSS) e
 * ToggleSummaryNode.vue (triangolo disclosure + NodeViewContent inline).
 *
 * ⚠️ Schema DEVE combaciare 1:1 con ToggleTwin/ToggleSummaryTwin in
 * src/functions/lib_yjs/pmSchema.ts.
 *
 * Render: ToggleNode.vue (triangolo + 1 NodeViewContent). `toggleSummary` NON
 * ha NodeView: il titolo è editabile direttamente dal renderHTML (div).
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ToggleNode from '../components/ToggleNode.vue'

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-summary"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'toggle-summary' }, HTMLAttributes), 0]
  },
})

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': attrs.open ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'toggle' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return VueNodeViewRenderer(ToggleNode)
  },

  addCommands() {
    return {
      insertToggle: () => ({ commands }: any) => {
        return commands.insertContent({
          type: 'toggle',
          attrs: { open: true },
          content: [
            { type: 'toggleSummary' },
            { type: 'paragraph' },
          ],
        })
      },
    } as any
  },
})
