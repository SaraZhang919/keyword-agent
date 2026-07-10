import * as XLSX from 'xlsx'

export type KeywordRow = {
  keyword: string
  volume: number
  kd?: number
  cpc?: number
  source: string   // label the user gave this section, e.g. "Topic", "Competitor 1"
}

// ─── Parse a File object into raw rows ─────────────────────────────────────
export async function fileToRows(
  file: File
): Promise<{ rows: Record<string, string>[]; error?: string }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  try {
    const wb = XLSX.read(bytes, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
      defval: '',
      raw: false,
    })
    return { rows }
  } catch {
    return { rows: [], error: `Could not parse file "${file.name}". Make sure it's a CSV or XLSX.` }
  }
}

// ─── Normalise column names and extract keyword + metrics ──────────────────
function parseNumber(value: string): number | undefined {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized || normalized === '/' || normalized === '-') return undefined
  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function pasteToRows(
  text: string,
  source: string
): { rows: KeywordRow[]; error?: string } {
  const rows: KeywordRow[] = []
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    let keyword = ''
    let volumeText = ''
    let kdText = ''

    const tabParts = line.split('\t').map(part => part.trim()).filter(Boolean)
    if (tabParts.length >= 2) {
      keyword = tabParts[0]
      volumeText = tabParts[1]
      kdText = tabParts[2] ?? ''
    } else {
      const match = line.match(/^(.*?)\s+([0-9][0-9,\.]*)\s+([0-9]+|\/|-)?$/)
      if (!match) continue
      keyword = match[1]
      volumeText = match[2]
      kdText = match[3] ?? ''
    }

    const volume = parseNumber(volumeText)
    if (!keyword || volume === undefined) continue

    rows.push({
      keyword: keyword.trim().toLowerCase(),
      volume,
      kd: parseNumber(kdText),
      source,
    })
  }

  if (text.trim() && rows.length === 0) {
    return {
      rows: [],
      error: `Could not parse pasted keywords for section "${source}". Use rows like: keyword<TAB>volume<TAB>kd.`,
    }
  }

  return { rows }
}

function findCol(headers: string[], candidates: string[]): string | undefined {
  const h = headers.map(s => s.toLowerCase().trim())
  for (const c of candidates) {
    const idx = h.indexOf(c.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  return undefined
}

export function parseRows(
  raw: Record<string, string>[],
  source: string
): { rows: KeywordRow[]; error?: string } {
  if (!raw.length) return { rows: [] }

  const headers = Object.keys(raw[0])
  const kwCol = findCol(headers, ['keyword', 'keywords', 'query', 'search term'])
  const volCol = findCol(headers, [
    'volume', 'search volume', 'avg. monthly searches', 'monthly searches',
  ])

  if (!kwCol) return { rows: [], error: `No keyword column found in file for section "${source}". Expected a column named "Keyword".` }
  if (!volCol) return { rows: [], error: `No volume column found in file for section "${source}". Expected a column named "Volume".` }

  const kdCol  = findCol(headers, ['kd', 'keyword difficulty', 'difficulty'])
  const cpcCol = findCol(headers, ['cpc', 'cpc (usd)', 'cost per click'])

  const rows: KeywordRow[] = []
  for (const row of raw) {
    const kw = String(row[kwCol] ?? '').trim().toLowerCase()
    const vol = parseFloat(String(row[volCol] ?? '').replace(/,/g, '')) || 0
    if (!kw) continue
    rows.push({
      keyword: kw,
      volume: vol,
      kd:  kdCol  ? parseFloat(row[kdCol])  || undefined : undefined,
      cpc: cpcCol ? parseFloat(row[cpcCol]) || undefined : undefined,
      source,
    })
  }

  return { rows }
}

// ─── Merge + deduplicate + filter ──────────────────────────────────────────
export type FilterStats = {
  total: number
  afterVolumeFilter: number
  afterDedup: number
  sentToAI: number
  brandTerms: number
  bySource: Record<string, number>
}

export function mergeAndFilter(
  allRows: KeywordRow[],
  minVolume = 30,
  maxSend = 300
): { filtered: KeywordRow[]; stats: FilterStats } {
  const total = allRows.length

  // Count by source before any filtering
  const bySource: Record<string, number> = {}
  for (const r of allRows) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1
  }

  // 1. Remove volume < minVolume
  const volFiltered = allRows.filter(r => r.volume >= minVolume)
  const afterVolumeFilter = volFiltered.length

  // 2. Deduplicate — keep highest-volume entry per normalised keyword
  const map = new Map<string, KeywordRow>()
  for (const row of volFiltered) {
    const existing = map.get(row.keyword)
    if (!existing || row.volume > existing.volume) {
      map.set(row.keyword, row)
    }
  }
  const deduped = Array.from(map.values())
  const afterDedup = deduped.length

  // 3. Sort by volume desc, cap at maxSend
  deduped.sort((a, b) => b.volume - a.volume)
  const filtered = deduped.slice(0, maxSend)

  // Brand terms = rows that survived and came from a competitor source
  const brandTerms = filtered.filter(r =>
    r.source.toLowerCase().includes('competitor')
  ).length

  return {
    filtered,
    stats: {
      total,
      afterVolumeFilter,
      afterDedup,
      sentToAI: filtered.length,
      brandTerms,
      bySource,
    },
  }
}

// ─── Format for AI prompt ──────────────────────────────────────────────────
export function formatForAI(rows: KeywordRow[]): string {
  return rows
    .map(r => {
      const parts = [`[${r.source}] ${r.keyword} (vol: ${r.volume}`]
      if (r.kd  !== undefined) parts.push(`, kd: ${r.kd}`)
      if (r.cpc !== undefined) parts.push(`, cpc: $${r.cpc}`)
      parts.push(')')
      return parts.join('')
    })
    .join('\n')
}
