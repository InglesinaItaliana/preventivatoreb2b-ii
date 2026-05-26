/**
 * UserMention — TipTap Node (atom inline) per menzioni persone team.
 *
 * NIENTE suggester proprio: l'inserimento avviene tramite UniversalMention
 * (`@` poliglotta) o programmaticamente. La extension è puro nodo schema:
 *  - render: UserMentionNode.vue
 *  - parseHTML: span[data-type="user-mention"]
 *  - storage: { type: 'userMention', attrs: { email } }
 *
 * Vedi docs/NEBULA-DOCS.md §4.3.
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import UserMentionNode from '../components/UserMentionNode.vue'

export const UserMention = Node.create({
  name: 'userMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      email: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-email'),
        renderHTML: (attrs) => attrs.email ? { 'data-email': attrs.email } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="user-mention"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'user-mention' }, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(UserMentionNode)
  },
})
