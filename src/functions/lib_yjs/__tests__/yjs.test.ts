import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { nebulaSchema, NEBULA_YJS_FIELD } from '../pmSchema'
import {
  seedYDocFromJSON, ydocToJSON, buildYDoc, applyJSONToYDoc, extractText, encodeState,
} from '../ydoc'
import { markdownToProseMirror, type PMNode } from '../../lib_md/markdown'

// Fixture che esercita OGNI tipo di nodo/mark dello schema NEBULA-DOCS,
// inclusi gli 8 atomi custom con tutti i loro attrs.
const FIXTURE = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titolo' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'grassetto ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'corsivo ' },
        { type: 'text', marks: [{ type: 'strike' }], text: 'barrato ' },
        { type: 'text', marks: [{ type: 'code' }], text: 'mono ' },
        { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://x.it', target: '_blank', rel: 'noopener noreferrer', class: null } }], text: 'link' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'taskMention', attrs: { taskId: 't1', projectId: 'p1' } },
        { type: 'projectMention', attrs: { projectId: 'p9' } },
        { type: 'userMention', attrs: { email: 'a@b.it' } },
        { type: 'docMention', attrs: { docId: 'd1', title: 'Doc collegato' } },
        { type: 'milestoneMention', attrs: { milestoneId: 'm1', projectId: 'p1' } },
        { type: 'deliverableMention', attrs: { deliverableId: 'dl1', projectId: 'p1' } },
        { type: 'obiettivoMention', attrs: { obiettivoId: 'o1', title: 'Obiettivo X' } },
      ],
    },
    { type: 'taskEmbed', attrs: { filter: { status: 'todo', projectId: null, type: 'task', limit: 20 }, view: 'list' } },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'punto' }] }] }],
    },
    {
      type: 'taskList',
      content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fatto' }] }] }],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cit' }] }] },
    { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const x = 1' }] },
    { type: 'horizontalRule' },
  ],
}

describe('nebulaSchema — guardia anti-drift', () => {
  it('XmlFragment field è "default" (combacia con Collaboration)', () => {
    expect(NEBULA_YJS_FIELD).toBe('default')
  })

  it('contiene esattamente i nodi attesi', () => {
    const nodes = Object.keys(nebulaSchema.nodes).sort()
    expect(nodes).toEqual([
      'blockquote', 'bulletList', 'codeBlock', 'deliverableMention', 'doc', 'docMention', 'hardBreak',
      'heading', 'horizontalRule', 'listItem', 'milestoneMention', 'obiettivoMention', 'orderedList', 'paragraph',
      'projectMention', 'table', 'tableCell', 'tableHeader', 'tableRow',
      'taskEmbed', 'taskItem', 'taskList', 'taskMention', 'text', 'userMention',
    ].sort())
  })

  it('gli 8 nodi custom hanno gli attrs attesi', () => {
    const attrKeys = (n: string) => Object.keys(nebulaSchema.nodes[n].spec.attrs ?? {}).sort()
    expect(attrKeys('taskMention')).toEqual(['projectId', 'taskId'])
    expect(attrKeys('projectMention')).toEqual(['projectId'])
    expect(attrKeys('userMention')).toEqual(['email'])
    expect(attrKeys('docMention')).toEqual(['docId', 'title'])
    expect(attrKeys('taskEmbed')).toEqual(['filter', 'view'])
    expect(attrKeys('milestoneMention')).toEqual(['milestoneId', 'projectId'])
    expect(attrKeys('deliverableMention')).toEqual(['deliverableId', 'projectId'])
    expect(attrKeys('obiettivoMention')).toEqual(['obiettivoId', 'title'])
  })

  it('marks attesi presenti', () => {
    const marks = Object.keys(nebulaSchema.marks)
    for (const m of ['bold', 'italic', 'strike', 'code', 'link']) {
      expect(marks).toContain(m)
    }
  })
})

describe('round-trip JSON ⇄ Y.Doc (fedeltà schema)', () => {
  it('preserva semanticamente ogni nodo/mark', () => {
    const ydoc = seedYDocFromJSON(FIXTURE as never)
    const back = ydocToJSON(ydoc)
    const a = nebulaSchema.nodeFromJSON(FIXTURE)
    const b = nebulaSchema.nodeFromJSON(back as object)
    expect(a.eq(b)).toBe(true)
  })

  it('snapshot → rebuild è identico', () => {
    const ydoc = seedYDocFromJSON(FIXTURE as never)
    const snap = encodeState(ydoc)
    const rebuilt = buildYDoc(snap, [])
    expect(nebulaSchema.nodeFromJSON(ydocToJSON(rebuilt) as object)
      .eq(nebulaSchema.nodeFromJSON(ydocToJSON(ydoc) as object))).toBe(true)
  })
})

describe('helper Yjs — apply MCP / restore', () => {
  it('applyJSONToYDoc produce un diff incrementale e preserva i nodi custom', () => {
    const ydoc = seedYDocFromJSON(FIXTURE as never)
    const before = ydocToJSON(ydoc)
    const next = JSON.parse(JSON.stringify(before))
    next.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'appeso' }] })
    const diff = applyJSONToYDoc(ydoc, next)
    // diff incrementale piccolo (non un rebuild dell'intero doc)
    expect(diff.length).toBeLessThan(200)
    const after = ydocToJSON(ydoc)
    expect((after.content as unknown[]).length).toBe((before.content as unknown[]).length + 1)
    // i nodi custom del primo blocco sopravvivono
    const customPara = (after.content as any[]).find((n) => n.type === 'paragraph' && n.content?.some((c: any) => c.type === 'taskMention'))
    expect(customPara).toBeTruthy()
  })

  it('applicare due volte lo stesso update è idempotente', () => {
    const ydoc = seedYDocFromJSON(FIXTURE as never)
    const snap = encodeState(ydoc)
    const a = buildYDoc(snap, [])
    Y.applyUpdate(a, snap)  // doppia applicazione
    Y.applyUpdate(a, snap)
    expect(nebulaSchema.nodeFromJSON(ydocToJSON(a) as object)
      .eq(nebulaSchema.nodeFromJSON(ydocToJSON(ydoc) as object))).toBe(true)
  })

  it('extractText estrae testo flat con cap', () => {
    const ydoc = seedYDocFromJSON(FIXTURE as never)
    const text = extractText(ydocToJSON(ydoc))
    expect(text).toContain('Titolo')
    expect(text).toContain('grassetto')
    expect(text.length).toBeLessThanOrEqual(10_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GUARD anti-drift: ogni nodo custom prodotto dal markdown DEVE avere il gemello
// in nebulaSchema, altrimenti viene scartato al salvataggio Y.Doc (bug PR #82:
// milestone/deliverable/obiettivo aggiunti al parser/link tool ma non allo
// schema server → chip persi). Aggiungendo una nuova sintassi @x: aggiorna
// ALL_MENTIONS_MD: se manca il gemello in pmSchema.ts, questi test falliscono.
// ─────────────────────────────────────────────────────────────────────────────
function collectNodeTypes(node: PMNode, acc: Set<string> = new Set()): Set<string> {
  acc.add(node.type)
  for (const c of node.content ?? []) collectNodeTypes(c, acc)
  return acc
}

describe('guard anti-drift: markdown → nebulaSchema', () => {
  const ALL_MENTIONS_MD = [
    '@task:p1/t1',
    '@project:p1',
    '@milestone:p1/m1',
    '@deliverable:p1/d1',
    '@obiettivo:o1',
    '{{embed-tasks status=todo}}',
  ].join('\n\n')

  it('ogni nodo prodotto dal markdown esiste in nebulaSchema', () => {
    const produced = collectNodeTypes(markdownToProseMirror(ALL_MENTIONS_MD))
    // sanity: il parser ha davvero prodotto i nodi custom attesi
    expect([...produced]).toEqual(expect.arrayContaining([
      'taskMention', 'projectMention', 'milestoneMention',
      'deliverableMention', 'obiettivoMention', 'taskEmbed',
    ]))
    for (const t of produced) {
      expect(
        nebulaSchema.nodes[t],
        `nodo "${t}" prodotto dal markdown ma assente da nebulaSchema (manca il gemello in pmSchema.ts)`,
      ).toBeDefined()
    }
  })

  it('i nodi mention sopravvivono al round-trip Y.Doc (non vengono scartati)', () => {
    const back = ydocToJSON(seedYDocFromJSON(markdownToProseMirror(ALL_MENTIONS_MD) as never))
    const survived = collectNodeTypes(back as PMNode)
    for (const t of ['taskMention', 'projectMention', 'milestoneMention', 'deliverableMention', 'obiettivoMention']) {
      expect(survived.has(t), `nodo "${t}" scartato dal Y.Doc (gemello schema mancante)`).toBe(true)
    }
  })
})
