export interface KeywordRow {
  keyword: string
  volume: number
  kd: number
  cpc: number
  kdTag: 'Priority' | 'Mid-term' | 'Long-term'
}

// Parse a single CSV line respecting quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes }
    else if ((char === ',' || char === ';') && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += char }
  }
  result.push(current.trim())
  return result
}

function clean(val: string): string {
  return val.replace(/^"|"$/g, '').replace(/,/g, '').trim()
}

function getKdTag(kd: number): KeywordRow['kdTag'] {
  if (kd < 30) return 'Priority'
  if (kd < 60) return 'Mid-term'
  return 'Long-term'
}

export function parseCSV(csvText: string): { rows: KeywordRow[]; error?: string } {
  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], error: 'CSV appears empty' }

  const headers = parseCSVLine(lines[0]).map(h => clean(h).toLowerCase())

  // Flexible column detection for SEMrush export variations
  const kwIdx = headers.findIndex(h => h === 'keyword' || h === 'keywords')
  const volIdx = headers.findIndex(h =>
    h === 'volume' || h === 'search volume' || h.includes('monthly searches') || h === 'avg. monthly searches'
  )
  const kdIdx = headers.findIndex(h =>
    h === 'kd' || h === 'kd%' || h === 'keyword difficulty' || h === 'difficulty'
  )
  const cpcIdx = headers.findIndex(h => h === 'cpc' || h === 'cpc (usd)' || h.startsWith('cpc'))

  if (kwIdx === -1) return { rows: [], error: 'Could not find "Keyword" column. Check your CSV headers.' }
  if (volIdx === -1) return { rows: [], error: 'Could not find "Volume" column. Check your CSV headers.' }

  const rows: KeywordRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const keyword = clean(cols[kwIdx] ?? '')
    if (!keyword) continue
    const volume = parseInt(clean(cols[volIdx] ?? '0')) || 0
    const kd = kdIdx >= 0 ? parseFloat(clean(cols[kdIdx] ?? '0')) || 0 : 0
    const cpc = cpcIdx >= 0 ? parseFloat(clean(cols[cpcIdx] ?? '0')) || 0 : 0
    rows.push({ keyword, volume, kd, cpc, kdTag: getKdTag(kd) })
  }

  return { rows }
}

export function preFilter(rows: KeywordRow[]): {
  filtered: KeywordRow[]
  stats: { total: number; afterVolumeFilter: number; afterDedup: number }
} {
  const total = rows.length

  // 1. Remove volume < 30
  const volumeFiltered = rows.filter(k => k.volume >= 30)
  const afterVolumeFilter = volumeFiltered.length

  // 2. Deduplicate — keep highest volume per normalized keyword
  const seen = new Map<string, KeywordRow>()
  for (const kw of volumeFiltered) {
    const key = kw.keyword.toLowerCase().replace(/\s+/g, ' ')
    const existing = seen.get(key)
    if (!existing || existing.volume < kw.volume) seen.set(key, kw)
  }

  // 3. Sort by volume descending, take top 300 for AI
  const filtered = Array.from(seen.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 300)

  return { filtered, stats: { total, afterVolumeFilter, afterDedup: seen.size } }
}

export function formatForAI(keywords: KeywordRow[]): string {
  return keywords
    .map(k => `${k.keyword} | vol:${k.volume} | kd:${k.kd} | cpc:$${k.cpc.toFixed(2)} | tag:${k.kdTag}`)
    .join('\n')
}
