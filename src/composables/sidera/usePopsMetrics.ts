import { ref, onUnmounted } from 'vue'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'

export interface UrgenzaItem {
  commessa: string
  codice: string
  cliente: string
  dataConsegna: Date
  giorniRimasti: number
}

export function usePopsMetrics() {
  const daGestire      = ref(0)
  const inProduzione   = ref(0)
  const pronti         = ref(0)
  const valorePipeline = ref(0)
  const urgenze        = ref<UrgenzaItem[]>([])
  const loading        = ref(true)

  const pipelineStates = ['SIGNED', 'IN_PRODUZIONE', 'READY', 'DELIVERY']
  const urgenzaStates  = new Set(['SIGNED', 'IN_PRODUZIONE'])

  const q = query(
    collection(db, 'preventivi'),
    where('stato', 'in', [
      'PENDING_VAL', 'ORDER_REQ', 'WAITING_SIGN',
      'SIGNED', 'IN_PRODUZIONE', 'READY', 'DELIVERY', 'SHIPPED',
    ])
  )

  const unsubscribe = onSnapshot(q, (snap) => {
    let _daGestire    = 0
    let _inProduzione = 0
    let _pronti       = 0
    let _valore       = 0
    const _urgenze: UrgenzaItem[] = []

    const oggi = new Date()
    oggi.setHours(0, 0, 0, 0)

    snap.forEach((doc) => {
      const d     = doc.data()
      const stato = d.stato as string

      if (['PENDING_VAL', 'ORDER_REQ', 'WAITING_SIGN'].includes(stato)) _daGestire++
      if (['SIGNED', 'IN_PRODUZIONE'].includes(stato))                   _inProduzione++
      if (stato === 'READY')                                             _pronti++
      if (pipelineStates.includes(stato))                                _valore += d.totaleScontato ?? 0

      if (urgenzaStates.has(stato) && d.dataConsegnaPrevista) {
        const raw = d.dataConsegnaPrevista
        const scadenza = raw instanceof Timestamp
          ? raw.toDate()
          : new Date((raw.seconds ?? 0) * 1000)
        const diffMs        = scadenza.getTime() - oggi.getTime()
        const giorniRimasti = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        _urgenze.push({
          commessa:     d.commessa ?? '',
          codice:       d.codice   ?? '',
          cliente:      d.cliente  ?? '',
          dataConsegna: scadenza,
          giorniRimasti,
        })
      }
    })

    _urgenze.sort((a, b) => a.dataConsegna.getTime() - b.dataConsegna.getTime())

    daGestire.value      = _daGestire
    inProduzione.value   = _inProduzione
    pronti.value         = _pronti
    valorePipeline.value = _valore
    urgenze.value        = _urgenze.slice(0, 3)
    loading.value        = false
  }, (err) => {
    console.error('[usePopsMetrics]', err)
    loading.value = false
  })

  onUnmounted(unsubscribe)

  return { daGestire, inProduzione, pronti, valorePipeline, urgenze, loading }
}
