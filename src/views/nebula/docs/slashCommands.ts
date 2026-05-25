/**
 * Registro dei comandi slash menu per NEBULA-DOCS.
 *
 * Ogni comando ha:
 *  - title: stringa mostrata nel menu
 *  - description: sottotitolo breve
 *  - icon: Material Symbol name (renderizzato via MaterialIcon)
 *  - aliases: alias di ricerca (oltre al title) per il match fuzzy
 *  - command: callback (editor, range) → modifica l'editor
 *
 * F2-C1: solo formatting (h1-3, liste, quote, code, divider).
 * F2-C2/3/4 aggiungeranno: /task, /progetto, /lista-task.
 *
 * Vedi docs/NEBULA-DOCS.md §4.2 per la lista completa target.
 */
import type { Editor, Range } from '@tiptap/core'

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  aliases: string[]
  command: (props: { editor: Editor; range: Range }) => void
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  // ── Heading ─────────────────────────────────────────────────────────────
  {
    title: 'Titolo 1',
    description: 'Sezione principale',
    icon: 'format_h1',
    aliases: ['h1', 'heading', 'titolo'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Titolo 2',
    description: 'Sezione',
    icon: 'format_h2',
    aliases: ['h2', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Titolo 3',
    description: 'Sotto-sezione',
    icon: 'format_h3',
    aliases: ['h3', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },

  // ── Liste ───────────────────────────────────────────────────────────────
  {
    title: 'Lista puntata',
    description: 'Lista con bullet',
    icon: 'format_list_bulleted',
    aliases: ['lista', 'bullet', 'ul'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Lista numerata',
    description: 'Lista ordinata 1, 2, 3…',
    icon: 'format_list_numbered',
    aliases: ['num', 'ordered', 'ol', 'numerata'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },

  // ── Blocchi ─────────────────────────────────────────────────────────────
  {
    title: 'Citazione',
    description: 'Blocco quote indentato',
    icon: 'format_quote',
    aliases: ['quote', 'blockquote', 'citazione'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Blocco codice',
    description: 'Codice multi-line monospaced',
    icon: 'code',
    aliases: ['code', 'codice', 'pre'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Separatore',
    description: 'Linea orizzontale',
    icon: 'horizontal_rule',
    aliases: ['divider', 'hr', 'separatore', 'linea'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

/**
 * Filtra i comandi in base alla query digitata dopo `/`.
 * Match case-insensitive su title, description, aliases.
 */
export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(cmd => {
    if (cmd.title.toLowerCase().includes(q)) return true
    if (cmd.description.toLowerCase().includes(q)) return true
    return cmd.aliases.some(a => a.toLowerCase().includes(q))
  })
}
