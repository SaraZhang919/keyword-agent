export interface KeywordRow {
  keyword: string
  intent: string
  volume: number
  trend: string
  kd: number
  cpc: number
  competitiveDensity: number
  serpFeatures: string
  numberOfResults: number
  kdTag: 'Priority' | 'Mid-term' | 'Long-term'
}

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
  if (kd < 40) return 'Priority'
  if (kd <= 80) return 'Mid-term'
  return 'Long-term'
}

export function parseCSV(csvText: string): { rows: KeywordRow[]; error?: string } {
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], error: 'CSV appears empty' }

  const headers = parseCSVLine(lines[0]).map(h => clean(h).toLowerCase())

  // Required
  const kwIdx  = headers.findIndex(h => h === 'keyword' || h === 'keywords')
  const volIdx = headers.findIndex(h =>
    h === 'volume' || h === 'search volume' || h.includes('monthly searches') || h === 'avg. monthly searches'
  )
  if (kwIdx === -1) return { rows: [], error: 'Could not find "Keyword" column. Check your CSV headers.' }
  if (volIdx === -1) return { rows: [], error: 'Could not find "Volume" column. Check your CSV headers.' }

  // Optional
  const intentIdx       = headers.findIndex(h => h === 'intent' || h === 'search intent')
  const trendIdx        = headers.findIndex(h => h === 'trend' || h.includes('trend'))
  const kdIdx           = headers.findIndex(h => h === 'kd' || h === 'kd%' || h === 'keyword difficulty' || h === 'difficulty')
  const cpcIdx          = headers.findIndex(h => h === 'cpc' || h === 'cpc (usd)' || h.startsWith('cpc'))
  const densityIdx      = headers.findIndex(h => h === 'competitive density' || h === 'com.' || h === 'competition')
  const serpIdx         = headers.findIndex(h => h.includes('serp feature') || h === 'serp features')
  const numResultsIdx   = headers.findIndex(h => h === 'number of results' || h === 'results')

  const rows: KeywordRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const keyword = clean(cols[kwIdx] ?? '')
    if (!keyword) continue

    const volume             = parseInt(clean(cols[volIdx] ?? '0')) || 0
    const kd                 = kdIdx >= 0 ? parseFloat(clean(cols[kdIdx] ?? '0')) || 0 : 0
    const cpc                = cpcIdx >= 0 ? parseFloat(clean(cols[cpcIdx] ?? '0')) || 0 : 0
    const intent             = intentIdx >= 0 ? clean(cols[intentIdx] ?? '') || 'Unknown' : 'Unknown'
    const trend              = trendIdx >= 0 ? clean(cols[trendIdx] ?? '') || 'N/A' : 'N/A'
    const competitiveDensity = densityIdx >= 0 ? parseFloat(clean(cols[densityIdx] ?? '0')) || 0 : 0
    const serpFeatures       = serpIdx >= 0 ? clean(cols[serpIdx] ?? '') || 'None' : 'None'
    const numberOfResults    = numResultsIdx >= 0 ? parseInt(clean(cols[numResultsIdx] ?? '0')) || 0 : 0

    rows.push({
      keyword, intent, volume, trend, kd, cpc,
      competitiveDensity, serpFeatures, numberOfResults,
      kdTag: getKdTag(kd)
    })
  }

  return { rows }
}

export function preFilter(rows: KeywordRow[]): {
  filtered: KeywordRow[]
  stats: { total: number; afterVolumeFilter: number; afterDedup: number }
} {
  const total = rows.length

  // Remove volume < 30 only — KD is handled by AI layer
  const volumeFiltered = rows.filter(k => k.volume >= 30)
  const afterVolumeFilter = volumeFiltered.length

  // Deduplicate — keep highest volume per normalized keyword
  const seen = new Map<string, KeywordRow>()
  for (const kw of volumeFiltered) {
    const key = kw.keyword.toLowerCase().replace(/\s+/g, ' ')
    const existing = seen.get(key)
    if (!existing || existing.volume < kw.volume) seen.set(key, kw)
  }

  // Sort by volume desc, cap at 300 for AI
  const filtered = Array.from(seen.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 300)

  return { filtered, stats: { total, afterVolumeFilter, afterDedup: seen.size } }
}

export function formatForAI(keywords: KeywordRow[]): string {
  return keywords.map(k => {
    const parts = [
      k.keyword,
      `intent:${k.intent}`,
      `vol:${k.volume}`,
      `trend:${k.trend}`,
      `kd:${k.kd}`,
      `tag:${k.kdTag}`,
      `cpc:$${k.cpc.toFixed(2)}`,
      `density:${k.competitiveDensity.toFixed(2)}`,
      `serp:${k.serpFeatures}`,
      k.numberOfResults > 0 ? `results:${(k.numberOfResults / 1_000_000).toFixed(1)}M` : null,
    ].filter(Boolean)
    return parts.join(' | ')
  }).join('\n')
}

