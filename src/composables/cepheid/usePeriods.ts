/**
 * Helper periodi per gli Obiettivi CEPHEID.
 *
 * Un periodo è sempre uno span contiguo inizio→fine, espresso in due modi:
 *  - 'year'     → anno solare intero (1 gen → 31 dic)
 *  - 'quarters' → intervallo di uno o più trimestri preconfezionati e contigui
 *                 (GEN-MAR, APR-GIU, LUG-SET, OTT-DIC), che può attraversare l'anno.
 *
 * Modulo puro, senza stato reattivo: solo funzioni di calcolo/formattazione.
 */

export interface QuarterDef {
  /** indice trimestre 0..3 */
  q: number
  /** etichetta breve dei mesi, es. 'APR-GIU' */
  label: string
  /** mese iniziale (0..11) */
  startMonth: number
  /** mese finale incluso (0..11) */
  endMonth: number
}

export const QUARTERS: QuarterDef[] = [
  { q: 0, label: 'GEN-MAR', startMonth: 0,  endMonth: 2  },
  { q: 1, label: 'APR-GIU', startMonth: 3,  endMonth: 5  },
  { q: 2, label: 'LUG-SET', startMonth: 6,  endMonth: 8  },
  { q: 3, label: 'OTT-DIC', startMonth: 9,  endMonth: 11 },
]

/** Trimestre (0..3) che contiene il mese dato (0..11). */
export function quarterOfMonth(month: number): number {
  return Math.floor(month / 3)
}

export interface QuarterCell {
  year: number
  q: number
  /** chiave stabile year*4+q, comoda per il confronto/ordinamento dei range */
  index: number
  label: string         // 'APR-GIU'
  shortMonths: string   // 'APR' (solo primo mese, per range compatti)
  startDate: Date
  endDate: Date
}

/** Scompone un index (year*4+q) in {year, q}. */
export function indexToYearQ(index: number): { year: number; q: number } {
  return { year: Math.floor(index / 4), q: ((index % 4) + 4) % 4 }
}

/** Index stabile (year*4+q) per una data. */
export function dateToQuarterIndex(d: Date): number {
  return d.getFullYear() * 4 + quarterOfMonth(d.getMonth())
}

function quarterCell(year: number, q: number): QuarterCell {
  const def = QUARTERS[q] ?? QUARTERS[0]!
  return {
    year,
    q,
    index: year * 4 + q,
    label: def.label,
    shortMonths: def.label.split('-')[0] ?? def.label,
    startDate: new Date(year, def.startMonth, 1),
    endDate:   new Date(year, def.endMonth + 1, 0), // giorno 0 del mese successivo = ultimo del mese
  }
}

/** Lista di `n` trimestri a partire da un index (year*4+q) incluso. */
export function quartersFrom(startIndex: number, n: number): QuarterCell[] {
  const out: QuarterCell[] = []
  for (let i = 0; i < n; i++) {
    const { year, q } = indexToYearQ(startIndex + i)
    out.push(quarterCell(year, q))
  }
  return out
}

/** Index del trimestre corrente. */
export function currentQuarterIndex(now: Date = new Date()): number {
  return now.getFullYear() * 4 + quarterOfMonth(now.getMonth())
}

/** Lista dei prossimi `n` trimestri a partire da quello corrente (incluso). */
export function futureQuarters(n: number, now: Date = new Date()): QuarterCell[] {
  return quartersFrom(currentQuarterIndex(now), n)
}

/** Dati dell'anno solare intero. */
export function yearToDates(year: number): { startDate: Date; endDate: Date } {
  return { startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31) }
}

/**
 * Span date da un intervallo di trimestri (estremi inclusi, ordine indifferente).
 * Riusa quarterCell per gli estremi: start = 1° giorno del primo, end = ultimo del secondo.
 */
export function quarterRangeToDates(a: QuarterCell, b: QuarterCell): { startDate: Date; endDate: Date } {
  const lo = a.index <= b.index ? a : b
  const hi = a.index <= b.index ? b : a
  return { startDate: lo.startDate, endDate: hi.endDate }
}

const MONTH_ABBR = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']

/** Anno a 2 cifre, es. 2026 → '26'. */
function yy(year: number): string {
  return String(year % 100).padStart(2, '0')
}

/**
 * Etichetta breve del periodo per chip/card.
 *  - year:     '2026'
 *  - quarters singolo: 'APR-GIU 26'
 *  - quarters range:   'APR 26 → MAR 27'
 */
export function formatPeriodLabel(
  startDate: Date | null,
  endDate: Date | null,
  periodKind: 'year' | 'quarters',
): string {
  if (!startDate || !endDate) return ''
  if (periodKind === 'year') {
    const sy = startDate.getFullYear()
    const ey = endDate.getFullYear()
    return sy === ey ? String(sy) : `${sy}–${ey}`
  }
  const sQ = quarterOfMonth(startDate.getMonth())
  const eQ = quarterOfMonth(endDate.getMonth())
  const sIdx = startDate.getFullYear() * 4 + sQ
  const eIdx = endDate.getFullYear() * 4 + eQ
  if (sIdx === eIdx) {
    const def = QUARTERS[sQ] ?? QUARTERS[0]!
    return `${def.label} ${yy(startDate.getFullYear())}`
  }
  // range multi-trimestre: dal primo mese del primo trim all'ultimo del secondo
  const startAbbr = MONTH_ABBR[(QUARTERS[sQ] ?? QUARTERS[0]!).startMonth] ?? ''
  const endAbbr   = MONTH_ABBR[(QUARTERS[eQ] ?? QUARTERS[0]!).endMonth] ?? ''
  return `${startAbbr} ${yy(startDate.getFullYear())} → ${endAbbr} ${yy(endDate.getFullYear())}`
}

/** Range esteso "1 gen 2026 → 31 mar 2027" per tooltip/dettaglio. */
export function formatDateRange(startDate: Date | null, endDate: Date | null): string {
  if (!startDate || !endDate) return ''
  const f = (d: Date) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]?.toLowerCase() ?? ''} ${d.getFullYear()}`
  return `${f(startDate)} → ${f(endDate)}`
}
