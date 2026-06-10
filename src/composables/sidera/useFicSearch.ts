import { ref } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'
import type { FicDocType, FicLineMatch, FicSearchBatchResult, FicSearchCursor, FicSearchPayload } from '../../types/ficSearch'

function matchKey(m: FicLineMatch): string {
  return `${m.documentId}:${m.lineIndex}:${m.matchedField}:${m.matchedText}`
}

export function useFicSearch() {
  const searching = ref(false)
  const errorMsg = ref('')
  const results = ref<FicLineMatch[]>([])
  const scannedTotal = ref(0)
  const progressLabel = ref('')

  let abortFlag = false

  function abort() {
    abortFlag = true
  }

  async function search(payload: Omit<FicSearchPayload, 'cursor'>): Promise<void> {
    abortFlag = false
    searching.value = true
    errorMsg.value = ''
    results.value = []
    scannedTotal.value = 0
    progressLabel.value = 'Avvio ricerca…'

    const fn = httpsCallable<FicSearchPayload, FicSearchBatchResult>(functions, 'searchFicReceivedItems')
    const seen = new Set<string>()
    let cursor: FicSearchCursor | null = null
    let done = false

    try {
      while (!done && !abortFlag) {
        const res = await fn({
          ...payload,
          cursor,
        })
        const data = res.data
        scannedTotal.value += data.scannedDocs

        for (const m of data.matches) {
          const k = matchKey(m)
          if (seen.has(k)) continue
          seen.add(k)
          results.value.push(m)
        }

        results.value.sort((a, b) => b.matchScore - a.matchScore || b.date.localeCompare(a.date))

        progressLabel.value = data.done
          ? `Completata · ${scannedTotal.value} fatture scansionate · ${results.value.length} risultati`
          : `Scansione in corso… ${scannedTotal.value} fatture · ${results.value.length} risultati`

        done = data.done
        cursor = data.cursor
        if (!done && !cursor) break
      }

      if (abortFlag) {
        progressLabel.value = `Interrotta · ${scannedTotal.value} fatture · ${results.value.length} risultati`
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      errorMsg.value = err?.message || 'Errore durante la ricerca FiC.'
      console.error('[useFicSearch]', e)
    } finally {
      searching.value = false
    }
  }

  return {
    searching,
    errorMsg,
    results,
    scannedTotal,
    progressLabel,
    search,
    abort,
  }
}
