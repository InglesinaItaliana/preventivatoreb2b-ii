/**
 * DocMention — TipTap Node (atom inline) per menzioni cross-doc NEBULA.
 *
 * Same pattern di UserMention/TaskMention/ProjectMention: niente suggester
 * proprio (passa da UniversalMention con trigger `@`), solo nodo schema:
 *   - render: DocMentionNode.vue (pill cliccabile con icona document)
 *   - parseHTML: span[data-type="doc-mention"]
 *   - storage: { type: 'docMention', attrs: { docId, title } }
 *
 * `title` è snapshotato al momento dell'insert per fallback display quando
 * il doc target non è risolvibile (eliminato, ACL chiusa). Il NodeView
 * preferisce il titolo live se accessibile.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import DocMentionNode from '../components/DocMentionNode.vue'

export const DocMention = Node.create({
  name: 'docMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      docId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-doc-id'),
        renderHTML: (attrs) => attrs.docId ? { 'data-doc-id': attrs.docId } : {},
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => attrs.title ? { 'data-title': attrs.title } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="doc-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'doc-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(DocMentionNode)
  },
})
