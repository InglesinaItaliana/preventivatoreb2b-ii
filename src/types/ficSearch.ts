export type FicDocType = 'invoice' | 'expense'

export interface FicSearchCursor {
  page: number
  indexInPage: number
}

export interface FicLineMatch {
  documentId: number
  lineIndex: number
  date: string
  invoiceNumber: string
  supplierName: string
  documentType: string
  line: {
    code?: string
    name?: string
    description?: string
    qty?: number
    netPrice?: number
  }
  matchScore: number
  matchedField: 'code' | 'name' | 'description'
  matchedText: string
}

export interface FicSearchPayload {
  query: string
  types?: FicDocType[]
  dateFrom?: string | null
  dateTo?: string | null
  cursor?: FicSearchCursor | null
}

export interface FicSearchBatchResult {
  matches: FicLineMatch[]
  cursor: FicSearchCursor | null
  scannedDocs: number
  done: boolean
  scopeWarning?: string
}
