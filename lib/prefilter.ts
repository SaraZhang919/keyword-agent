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
  source: 'topic' | 'related' | 'competitor'
  isBrandTerm: boolean
}

// Known competitor brand names in AI video/image tool space
const COMPETITOR_BRANDS = [
  'hitpaw','topaz','capcut','canva','adobe','premiere','davinci','resolve',
  'media.io','mediaio','fotor','remini','picsart','avclabs','flixier','aiarty',
  'youcam','facewow','remaker','aiease','kling','runway','pika','sora',
  'imgupscaler','videoproc','winxvideo','movavi','wondershare','filmora',
  'clideo','clipchamp','veed','unscreen','luma','kaiber','genmo','pictory',
  'invideo','flexclip','animoto','magisto','typito','kapwing'
]

function isBrand(keyword: string): boolean {
  const lower = keyword.toLowerCase()
  return COMPETITOR_BRANDS.some(brand => lower.includes(brand))
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

export function parseCSV(
  csvText: string,
  source: KeywordRow['source']
): { rows: KeywordRow[]; error?: string } {
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], error: `${source} CSV appears empty` }

  const headers = parseCSVLine(lines[0]).map(h => clean(h).toLowerCase())

  const kwIdx   = headers.findIndex(h => h === 'keyword' || h === 'keywords')
  const volIdx  = headers.findIndex(h =>
    h === 'volume' || h === 'search volume' || h.includes('monthly searches') || h === 'avg. monthly searches'
  )
  if (kwIdx === -1) return { rows: [], error: `${source} CSV: Could not find "Keyword" column.` }
  if (volIdx === -1) return { rows: [], error: `${source} CSV: Could not find "Volume" column.` }

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
      kdTag: getKdTag(kd),
      source,
      isBrandTerm: isBrand(keyword)
    })
  }

  return { rows }
}

export interface FilterStats {
  topic: number
  related: number
  competitor: number
  total: number
  afterVolumeFilter: number
  afterDedup: number
  brandTerms: number
  sentToAI: number
}

export function mergeAndFilter(allRows: KeywordRow[]): {
  filtered: KeywordRow[]
  stats: FilterStats
} {
  const sourceCount = {
    topic: allRows.filter(r => r.source === 'topic').length,
    related: allRows.filter(r => r.source === 'related').length,
    competitor: allRows.filter(r => r.source === 'competitor').length,
  }
  const total = allRows.length

  // Remove volume < 30
  const volumeFiltered = allRows.filter(k => k.volume >= 30)
  const afterVolumeFilter = volumeFiltered.length

  // Deduplicate — prefer topic source over related over competitor when same keyword
  const sourceRank: Record<KeywordRow['source'], number> = { topic: 0, related: 1, competitor: 2 }
  const seen = new Map<string, KeywordRow>()
  for (const kw of volumeFiltered) {
    const key = kw.keyword.toLowerCase().replace(/\s+/g, ' ')
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, kw)
    } else {
      // Prefer higher volume, break ties by source rank
      if (
        kw.volume > existing.volume ||
        (kw.volume === existing.volume && sourceRank[kw.source] < sourceRank[existing.source])
      ) {
        seen.set(key, kw)
      }
    }
  }

  const afterDedup = seen.size
  const brandTerms = Array.from(seen.values()).filter(k => k.isBrandTerm).length

  // Sort: non-brand by volume desc first, then brand terms
  // Cap at 350 total sent to AI
  const nonBrand = Array.from(seen.values())
    .filter(k => !k.isBrandTerm)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 300)

  const brandKeywords = Array.from(seen.values())
    .filter(k => k.isBrandTerm)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 50)

  const filtered = [...nonBrand, ...brandKeywords]

  return {
    filtered,
    stats: {
      ...sourceCount,
      total,
      afterVolumeFilter,
      afterDedup,
      brandTerms,
      sentToAI: filtered.length
    }
  }
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
      `source:${k.source}`,
      k.isBrandTerm ? `brand:yes` : null,
    ].filter(Boolean)
    return parts.join(' | ')
  }).join('\n')
}
