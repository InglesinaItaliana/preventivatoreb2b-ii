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

describe('markdown → ProseMirror — callout (:::callout)', () => {
  const CALLOUT_MD = [
    ':::callout tone=warn icon=warning',
    'Attenzione: scadenza vicina.',
    ':::',
  ].join('\n')

  it('un container :::callout diventa un nodo callout con tone/icon e corpo', () => {
    const doc = markdownToProseMirror(CALLOUT_MD)
    const callout = doc.content!.find(n => n.type === 'callout')
    expect(callout).toBeTruthy()
    expect(callout!.attrs!.tone).toBe('warn')
    expect((callout!.attrs!.icon as any).name).toBe('warning')
    // corpo = un paragrafo col testo
    const para = callout!.content![0]
    expect(para.type).toBe('paragraph')
    expect(para.content![0].text).toContain('scadenza')
    acceptedBySchema(doc)
  })

  it('il corpo del callout converte ricorsivamente (mention preservata)', () => {
    const md = ':::callout tone=info\nVedi @task:p1/t1 per i dettagli.\n:::'
    const doc = markdownToProseMirror(md)
    const callout = doc.content!.find(n => n.type === 'callout')!
    const para = callout.content![0]
    expect(para.content!.some(n => n.type === 'taskMention')).toBe(true)
    acceptedBySchema(doc)
  })

  it('callout vuoto resta schema-valido (paragrafo vuoto iniettato)', () => {
    const doc = markdownToProseMirror(':::callout\n:::')
    const callout = doc.content!.find(n => n.type === 'callout')!
    expect(callout.content!.length).toBeGreaterThanOrEqual(1)
    acceptedBySchema(doc)
  })

  it('round-trip md→PM→md preserva tone e icon', () => {
    const out = proseMirrorToMarkdown(markdownToProseMirror(CALLOUT_MD))
    expect(out).toContain(':::callout tone=warn icon=warning')
    expect(out).toContain(':::')
    const reparsed = markdownToProseMirror(out)
    expect(reparsed.content!.some(n => n.type === 'callout')).toBe(true)
  })
})

describe('markdown → ProseMirror — toggle (:::toggle)', () => {
  const TOGGLE_MD = [
    ':::toggle Dettagli tecnici',
    'Corpo collassabile con una lista:',
    '',
    '- punto uno',
    ':::',
  ].join('\n')

  it('un container :::toggle diventa toggle con summary editabile e corpo', () => {
    const doc = markdownToProseMirror(TOGGLE_MD)
    const toggle = doc.content!.find(n => n.type === 'toggle')
    expect(toggle).toBeTruthy()
    expect(toggle!.attrs!.open).toBe(true)
    // primo figlio = toggleSummary col titolo come CONTENUTO inline
    const summary = toggle!.content![0]
    expect(summary.type).toBe('toggleSummary')
    expect(summary.content![0].text).toContain('Dettagli tecnici')
    // corpo: almeno un blocco dopo il summary
    expect(toggle!.content!.length).toBeGreaterThanOrEqual(2)
    acceptedBySchema(doc)
  })

  it('round-trip md→PM→md preserva summary e corpo', () => {
    const out = proseMirrorToMarkdown(markdownToProseMirror(TOGGLE_MD))
    expect(out).toContain(':::toggle Dettagli tecnici')
    const reparsed = markdownToProseMirror(out)
    const toggle = reparsed.content!.find(n => n.type === 'toggle')!
    expect(toggle.content![0].type).toBe('toggleSummary')
    acceptedBySchema(reparsed)
  })
})
