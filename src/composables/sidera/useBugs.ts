import { ref, computed, onUnmounted, watch, type Ref } from 'vue'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { useCoreAdmins } from './useCoreAdmins'
import type { Bug, BugCategory, BugPriority, BugStatus, BugTechnicalContext, BugSource, ReporterType } from '../../types/bugs'

function toDate(raw: unknown): Date {
  if (!raw) return new Date(0)
  if (raw instanceof Date) return raw
  const r = raw as { seconds?: number }
  if (typeof r.seconds === 'number') return new Date(r.seconds * 1000)
  return new Date(0)
}

function mapBugDoc(id: string, data: Record<string, unknown>): Bug {
  return {
    id,
    bugNumber: String(data.bugNumber ?? ''),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    status: (data.status as BugStatus) ?? 'da_analizzare',
    category: (data.category as BugCategory) ?? 'funzionale',
    priority: (data.priority as BugPriority) ?? 'media',
    pageUrl: String(data.pageUrl ?? ''),
    affectedArea: String(data.affectedArea ?? 'other'),
    preventivoCodice: data.preventivoCodice != null ? String(data.preventivoCodice) : null,
    reportedBy: String(data.reportedBy ?? ''),
    reportedByUid: String(data.reportedByUid ?? ''),
    reporterType: (data.reporterType as ReporterType) ?? 'client',
    reporterCompany: data.reporterCompany != null ? String(data.reporterCompany) : null,
    technicalContext: (data.technicalContext ?? {}) as BugTechnicalContext,
    internalNotes: String(data.internalNotes ?? ''),
    assigneeUid: data.assigneeUid != null ? String(data.assigneeUid) : null,
    linkedTaskId: data.linkedTaskId != null ? String(data.linkedTaskId) : null,
    linkedTaskProjectId: data.linkedTaskProjectId != null ? String(data.linkedTaskProjectId) : null,
    duplicateOf: data.duplicateOf != null ? String(data.duplicateOf) : null,
    source: (data.source as BugSource) ?? 'pops',
    notionPageId: data.notionPageId != null ? String(data.notionPageId) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    resolvedAt: data.resolvedAt ? toDate(data.resolvedAt) : null,
  }
}

export function useAllBugs() {
  const bugs = ref<Bug[]>([])
  const loading = ref(true)
  const { isCoreAdmin } = useCoreAdmins()
  let unsub: (() => void) | null = null

  const start = () => {
    if (unsub) return
    const q = query(collection(db, 'bugs'), orderBy('createdAt', 'desc'))
    unsub = onSnapshot(q, (snap) => {
      bugs.value = snap.docs.map((d) => mapBugDoc(d.id, d.data() as Record<string, unknown>))
      loading.value = false
    }, (err) => {
      console.error('[useAllBugs]', err)
      loading.value = false
    })
  }

  const stop = () => {
    if (unsub) { unsub(); unsub = null }
    bugs.value = []
    loading.value = true
  }

  watch(
    () => isCoreAdmin(auth.currentUser?.email ?? null),
    (ok) => { ok ? start() : stop() },
    { immediate: true },
  )
  onUnmounted(stop)

  return { bugs, loading }
}

export function useMyBugs(uid: Ref<string | null | undefined>) {
  const bugs = ref<Bug[]>([])
  const loading = ref(true)
  let unsub: (() => void) | null = null

  const stop = () => {
    if (unsub) { unsub(); unsub = null }
  }

  const start = (id: string) => {
    stop()
    loading.value = true
    const q = query(
      collection(db, 'bugs'),
      where('reportedByUid', '==', id),
      orderBy('createdAt', 'desc'),
    )
    unsub = onSnapshot(q, (snap) => {
      bugs.value = snap.docs.map((d) => mapBugDoc(d.id, d.data() as Record<string, unknown>))
      loading.value = false
    }, (err) => {
      console.error('[useMyBugs]', err)
      loading.value = false
    })
  }

  return { bugs, loading, start, stop }
}

export function useOpenBugCount() {
  const { bugs } = useAllBugs()
  const openCount = computed(() =>
    bugs.value.filter((b) => b.status === 'da_analizzare').length,
  )
  return { openCount }
}
