import { describe, it, expect } from 'vitest'
import { markdownToProseMirror, proseMirrorToMarkdown } from '../markdown'
import { nebulaSchema } from '../../lib_yjs/pmSchema'

// Il test critico: il JSON prodotto dal converter DEVE essere accettato da
// nebulaSchema.nodeFromJSON, altrimenti applyJSONToYDoc (scrittura MCP) lancia
// e il salvataggio Y.Doc fallisce. Questo è il guard di regressione vero.
const acceptedBySchema = (doc: unknown) =>
  expect(() => nebulaSchema.nodeFromJSON(doc as object)).not.toThrow()

describe('markdown → ProseMirror — link', () => {
  it('un link inline diventa testo con mark link (href preservato)', () => {
    const doc = markdownToProseMirror('Vedi [il sito](https://example.com) ora.')
    const para = doc.content![0]
    const linked = para.content!.find(n => n.marks?.some(m => m.type === 'link'))
    expect(linked).toBeTruthy()
    expect(linked!.text).toBe('il sito')
    const mark = linked!.marks!.find(m => m.type === 'link')!
    expect(mark.attrs!.href).toBe('https://example.com')
    acceptedBySchema(doc)
  })

  it('link con grassetto interno mantiene entrambi i mark', () => {
    const doc = markdownToProseMirror('[**bold link**](https://x.it)')
    const node = doc.content![0].content![0]
    const types = node.marks!.map(m => m.type).sort()
    expect(types).toEqual(['bold', 'link'])
    acceptedBySchema(doc)
  })

  it('round-trip md→PM→md preserva il link', () => {
    const md = 'Apri [la guida](https://docs.example.com/x).'
    const out = proseMirrorToMarkdown(markdownToProseMirror(md)).trim()
    expect(out).toContain('[la guida](https://docs.example.com/x)')
  })
})

describe('markdown → ProseMirror — tabelle', () => {
  const TABLE_MD = [
    '| Nome | Ruolo |',
    '| --- | --- |',
    '| Ada | Dev |',
    '| Bo | PM |',
  ].join('\n')

  it('una tabella GFM diventa nodi table/tableRow/tableHeader/tableCell', () => {
    const doc = markdownToProseMirror(TABLE_MD)
    const table = doc.content!.find(n => n.type === 'table')
    expect(table).toBeTruthy()
    expect(table!.content).toHaveLength(3) // header + 2 righe
    const headerRow = table!.content![0]
    expect(headerRow.content!.every(c => c.type === 'tableHeader')).toBe(true)
    const bodyRow = table!.content![1]
    expect(bodyRow.content!.every(c => c.type === 'tableCell')).toBe(true)
    // testo nelle celle preservato dentro un paragrafo
    const firstCellText = headerRow.content![0].content![0].content![0].text
    expect(firstCellText).toBe('Nome')
  })

  it('il JSON tabella è accettato da nebulaSchema (no crash su salvataggio)', () => {
    acceptedBySchema(markdownToProseMirror(TABLE_MD))
  })

  it('round-trip md→PM→md ricostruisce una tabella valida', () => {
    const out = proseMirrorToMarkdown(markdownToProseMirror(TABLE_MD))
    const reparsed = markdownToProseMirror(out)
    expect(reparsed.content!.some(n => n.type === 'table')).toBe(true)
  })
})
