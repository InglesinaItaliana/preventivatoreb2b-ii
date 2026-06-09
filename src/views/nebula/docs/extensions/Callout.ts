/**
 * Callout — TipTap Node "blocco evidenziato" per NEBULA-DOCS.
 *
 * Blocco con contenuto editabile annidato (`block+`) + un tono (info/warn/
 * success/danger) che ne determina il colore, e un'icona opzionale scelta dal
 * picker Material Symbols (IconPicker.vue). Stile Notion callout.
 *
 * Storage:
 *   { "type": "callout", "attrs": { "tone": "info", "icon": {set,name,color,fill}|null }, "content": [ ...block ] }
 *
 * Render: CalloutNode.vue (NodeViewWrapper as="div" + NodeViewContent).
 *
 * ⚠️ Schema (group/content/attrs/default/defining/isolating) DEVE combaciare
 * 1:1 con CalloutTwin in src/functions/lib_yjs/pmSchema.ts.
 *
 * NodeView agganciato in Step 5 (vedi addNodeView, aggiunto con la UI).
 */
import { Node, mergeAttributes } from '@tiptap/core'

export type CalloutTone = 'info' | 'warn' | 'success' | 'danger'

/** Icona Material Symbols, stessa shape dell'icona del documento (IconPicker). */
export interface CalloutIcon {
  set: 'material'
  name: string
  color: string | null
  fill: 0 | 1
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-tone') ?? 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone ?? 'info' }),
      },
      icon: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-icon')
          if (!raw) return null
          try { return JSON.parse(raw) } catch { return null }
        },
        renderHTML: (attrs) => {
          if (!attrs.icon) return {}
          return { 'data-icon': JSON.stringify(attrs.icon) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'callout' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      insertCallout: (tone: CalloutTone = 'info') => ({ commands }: any) => {
        return commands.insertContent({
          type: 'callout',
          attrs: { tone, icon: null },
          content: [{ type: 'paragraph' }],
        })
      },
      setCalloutTone: (tone: CalloutTone) => ({ commands }: any) => {
        return commands.updateAttributes('callout', { tone })
      },
    } as any
  },
})
