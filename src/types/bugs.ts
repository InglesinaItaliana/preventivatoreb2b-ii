export type BugStatus = 'da_analizzare' | 'in_corso' | 'risolto' | 'non_riproducibile'
export type BugCategory = 'ui' | 'funzionale' | 'performance' | 'dati' | 'suggerimento'
export type BugPriority = 'alta' | 'media' | 'bassa'
export type BugSource = 'pops' | 'sidera' | 'import_notion'
export type ReporterType = 'client' | 'team'

export interface BugTechnicalContext {
  userAgent?: string
  screenSize?: string
  path?: string
  platform?: string
  timestamp?: string
  appScope?: string
  userUid?: string
}

export interface Bug {
  id: string
  bugNumber: string
  title: string
  description: string
  status: BugStatus
  category: BugCategory
  priority: BugPriority
  pageUrl: string
  affectedArea: string
  preventivoCodice: string | null
  reportedBy: string
  reportedByUid: string
  reporterType: ReporterType
  reporterCompany: string | null
  technicalContext: BugTechnicalContext
  internalNotes: string
  assigneeUid: string | null
  linkedTaskId: string | null
  linkedTaskProjectId: string | null
  duplicateOf: string | null
  source: BugSource
  notionPageId: string | null
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
}

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  da_analizzare: 'Da analizzare',
  in_corso: 'In corso',
  risolto: 'Risolto',
  non_riproducibile: 'Non riproducibile',
}

export const BUG_CATEGORY_LABELS: Record<BugCategory, string> = {
  ui: 'UI/Grafica',
  funzionale: 'Errore funzionale',
  performance: 'Performance',
  dati: 'Dati errati',
  suggerimento: 'Suggerimento',
}

export const BUG_PRIORITY_LABELS: Record<BugPriority, string> = {
  alta: 'Alta',
  media: 'Media',
  bassa: 'Bassa',
}

export const BUG_CATEGORY_UI_OPTIONS = [
  'UI/Grafica',
  'Errore Funzionale',
  'Performance',
  'Dati Errati',
  'Suggerimento',
] as const

export const BUG_STATUS_ORDER: BugStatus[] = [
  'da_analizzare',
  'in_corso',
  'risolto',
  'non_riproducibile',
]

export function categoryFromUiLabel(label: string): BugCategory {
  const map: Record<string, BugCategory> = {
    'UI/Grafica': 'ui',
    'Errore Funzionale': 'funzionale',
    'Performance': 'performance',
    'Dati Errati': 'dati',
    'Suggerimento': 'suggerimento',
  }
  return map[label] ?? 'funzionale'
}

export function categoryToUiLabel(cat: BugCategory): string {
  return BUG_CATEGORY_LABELS[cat] ?? cat
}
