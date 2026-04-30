import * as XLSX from 'xlsx'

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

const COMPETITOR_BRANDS = [
  'hitpaw','topaz','capcut','canva','adobe','premiere','davinci','resolve',
  'media.io','mediaio','fotor','remini','picsart','avclabs','flixier','aiarty',
  'youcam','facewow','remaker','aiease','kling','runway','pika','sora',
  'imgupscaler','videoproc','winxvideo','movavi','wondershare','filmora',
  'clideo','clipchamp','veed','unscreen','luma','kaiber','genmo','pictory',
  'invideo','flexclip','animoto','magisto','typito','kapwing','vmake',
  'airbrush','wink','winkfolio'
]

function isBrand(keyword: string): boolean {
  const lower = keyword.toLowerCase()
  return COMPETITOR_BRANDS.some(brand => lower.includes(brand))
}

function getKdTag(kd: number): KeywordRow['kdTag'] {
  if (kd < 40) return 'Priority'
  if (kd <= 80) return 'Mid-term'
  return 'Long-term'
}

function findCol(headers: string[], variants: string[]): number {
  return headers.findIndex(h => variants.some(v => h === v || h.includes(v)))
}

// Convert any file (xlsx or csv) to array of row objects
export async function fileToRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      raw: false, // convert everything to strings first
    }) as Record<string, unknown>[]
    if (rows.length === 0) return { rows: [], error: 'File appears empty' }
    return { rows }
  } catch {
    return { rows: [], error: 'Could not parse file. Please use .csv or .xlsx format.' }
  }
}

export function parseRows(
  rows: Record<string, unknown>[],
  source: KeywordRow['source']
): { rows: KeywordRow[]; error?: string } {
  if (rows.length === 0) return { rows: [], error: `${source} file appears empty` }

  // Get headers from first row keys
  const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim())

  // Flexible column matching — handles all SEMrush export variants
  const kwIdx       = findCol(headers, ['keyword', 'keywords'])
  const volIdx      = findCol(headers, ['volume', 'search volume', 'monthly searches', 'avg. monthly searches'])
  const intentIdx   = findCol(headers, ['intent', 'intents', 'search intent'])
  const trendIdx    = findCol(headers, ['trend', 'trend (last 12 months)'])
  const kdIdx       = findCol(headers, ['keyword difficulty', 'kd', 'kd%', 'difficulty'])
  const cpcIdx      = findCol(headers, ['cpc (usd)', 'cpc', 'cost per click'])
  const densityIdx  = findCol(headers, ['competitive density', 'competition density', 'com.', 'competition'])
  const serpIdx     = findCol(headers, ['serp features', 'serp feature'])
  const resultsIdx  = findCol(headers, ['number of results', 'results'])

  if (kwIdx === -1)  return { rows: [], error: `${source} file: Could not find "Keyword" column. Found: ${headers.slice(0,6).join(', ')}` }
  if (volIdx === -1) return { rows: [], error: `${source} file: Could not find "Volume" column. Found: ${headers.slice(0,6).join(', ')}` }

  const colKeys = Object.keys(rows[0])

  function getVal(row: Record<string, unknown>, idx: number): string {
    if (idx === -1) return ''
    return String(row[colKeys[idx]] ?? '').trim()
  }

  const parsed: KeywordRow[] = []
  for (const row of rows) {
    const keyword = getVal(row, kwIdx)
    if (!keyword) continue

    const volume             = parseInt(getVal(row, volIdx).replace(/,/g, '')) || 0
    const kd                 = parseFloat(getVal(row, kdIdx).replace(/,/g, '')) || 0
    const cpc                = parseFloat(getVal(row, cpcIdx).replace(/[$,]/g, '')) || 0
    const intent             = getVal(row, intentIdx) || 'Unknown'
    const trend              = getVal(row, trendIdx) || 'N/A'
    const competitiveDensity = parseFloat(getVal(row, densityIdx).replace(/,/g, '')) || 0
    const serpFeatures       = getVal(row, serpIdx) || 'None'
    const numberOfResults    = parseInt(getVal(row, resultsIdx).replace(/,/g, '')) || 0

    parsed.push({
      keyword, intent, volume, trend, kd, cpc,
      competitiveDensity, serpFeatures, numberOfResults,
      kdTag: getKdTag(kd),
      source,
      isBrandTerm: isBrand(keyword)
    })
  }

  return { rows: parsed }
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
    topic:      allRows.filter(r => r.source === 'topic').length,
    related:    allRows.filter(r => r.source === 'related').length,
    competitor: allRows.filter(r => r.source === 'competitor').length,
  }
  const total = allRows.length

  // Remove volume < 30
  const volumeFiltered = allRows.filter(k => k.volume >= 30)
  const afterVolumeFilter = volumeFiltered.length

  // Deduplicate — prefer topic > related > competitor, then higher volume
  const sourceRank: Record<KeywordRow['source'], number> = { topic: 0, related: 1, competitor: 2 }
  const seen = new Map<string, KeywordRow>()
  for (const kw of volumeFiltered) {
    const key = kw.keyword.toLowerCase().replace(/\s+/g, ' ')
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, kw)
    } else if (
      kw.volume > existing.volume ||
      (kw.volume === existing.volume && sourceRank[kw.source] < sourceRank[existing.source])
    ) {
      seen.set(key, kw)
    }
  }

  const afterDedup = seen.size
  const brandTerms = Array.from(seen.values()).filter(k => k.isBrandTerm).length

  // Non-brand keywords sorted by volume, cap 300
  const nonBrand = Array.from(seen.values())
    .filter(k => !k.isBrandTerm)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 300)

  // Brand keywords sorted by volume, cap 50
  const brandKeywords = Array.from(seen.values())
    .filter(k => k.isBrandTerm)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 50)

  const filtered = [...nonBrand, ...brandKeywords]

  return {
    filtered,
    stats: { ...sourceCount, total, afterVolumeFilter, afterDedup, brandTerms, sentToAI: filtered.length }
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
