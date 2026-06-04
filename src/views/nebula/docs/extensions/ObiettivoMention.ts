/**
 * ObiettivoMention — TipTap Node (atom inline) per menzioni di obiettivo CEPHEID.
 *
 * Un obiettivo vive nella collection top-level `obiettivi/{obiettivoId}`.
 * Stesso pattern di DocMention: niente suggester proprio (passa da
 * UniversalMention con trigger `@`), solo nodo schema:
 *   - render: ObiettivoMentionNode.vue (pill cliccabile, colore dinamico)
 *   - parseHTML: span[data-type="obiettivo-mention"]
 *   - storage: { type: 'obiettivoMention', attrs: { obiettivoId, title } }
 *
 * `title` è snapshotato al momento dell'insert per fallback display quando
 * l'obiettivo non è risolvibile (eliminato). Il NodeView preferisce il titolo
 * live se accessibile.
 *
 * ATTENZIONE: nome nodo + attrs devono combaciare con il backend MCP
 * (tools.ts → linkObiettivo) altrimenti il chip inserito da Claude viene
 * scartato dallo schema all'apertura del doc.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ObiettivoMentionNode from '../components/ObiettivoMentionNode.vue'

export const ObiettivoMention = Node.create({
  name: 'obiettivoMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      obiettivoId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-obiettivo-id'),
        renderHTML: (attrs) => attrs.obiettivoId ? { 'data-obiettivo-id': attrs.obiettivoId } : {},
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => attrs.title ? { 'data-title': attrs.title } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="obiettivo-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'obiettivo-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(ObiettivoMentionNode)
  },
})
