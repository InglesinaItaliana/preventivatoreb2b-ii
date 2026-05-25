/**
 * SlashCommand — TipTap extension che monta il slash menu su `/`.
 *
 * Composizione:
 *  - `@tiptap/suggestion` come ProseMirror plugin (gestisce trigger char,
 *    range, query, command dispatch)
 *  - `tippy.js` come popup renderer (posizione + animazione)
 *  - `VueRenderer` da `@tiptap/vue-3` per montare SlashMenu.vue dentro tippy
 *
 * Estensione locale a NEBULA-DOCS (`src/views/nebula/docs/extensions/`).
 * F2-C2/3/4 aggiungeranno comandi al registro SLASH_COMMANDS (slashCommands.ts).
 *
 * Vedi docs/NEBULA-DOCS.md §4.2.
 */
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import SlashMenu from '../components/SlashMenu.vue'
import { SLASH_COMMANDS, filterSlashCommands, type SlashCommandItem } from '../slashCommands'

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        // command è il dispatcher: l'item selezionato porta la sua callback in
        // props.command. Suggestion ce la rigira qui per applicarla all'editor.
        command: ({ editor, range, props }: any) => {
          (props.command as SlashCommandItem['command'])({ editor, range })
        },
        items: ({ query }: { query: string }) => filterSlashCommands(query),
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        // Adattatore: Suggestion passa selected item come `props` al command
        // sopra; qui mappiamo l'item.command in props.command.
        command: ({ editor, range, props }: any) => {
          const item = props as SlashCommandItem
          item.command({ editor, range })
        },
        render: () => {
          let component: VueRenderer | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (props: any) => {
              component = new VueRenderer(SlashMenu, {
                props,
                editor: props.editor,
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                offset: [0, 8],
                animation: 'fade',
                theme: 'nebula-slash',
              })
            },

            onUpdate(props: any) {
              component?.updateProps(props)
              if (!props.clientRect || !popup) return
              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              })
            },

            onKeyDown(props: any) {
              if (props.event.key === 'Escape') {
                popup?.[0].hide()
                return true
              }
              // Inoltra al componente Vue (gestisce ArrowUp/Down/Enter)
              return (component?.ref as { onKeyDown?: (p: any) => boolean })?.onKeyDown?.(props) ?? false
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

// Re-export per comodità (chi importa SlashCommand può estendere il registro)
export { SLASH_COMMANDS, type SlashCommandItem }
