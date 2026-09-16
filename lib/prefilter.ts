import * as XLSX from 'xlsx'

export type SourceRole =
  | 'auto'
  | 'broad_match'
  | 'current_page_gap'
  | 'page_cluster'
  | 'custom'

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  auto: 'Auto-detect',
  broad_match: 'Broad Match Keywords',
  current_page_gap: 'Current Page / Competitor Gap',
  page_cluster: 'Page Cluster / Page Opportunities',
  custom: 'Custom Keyword List',
}

const DEDUP_SOURCE_PRIORITY: Record<SourceRole, number> = {
  broad_match: 3,
  current_page_gap: 2,
  page_cluster: 1,
  custom: 0,
  auto: 0,
}

export type KeywordRow = {
  source_roles?: SourceRole[]
  gap_evidence?: { source: string; file?: string; intent?: string; rankings: { url: string; position: number }[] }[]
  keyword_id?: string
  keyword: string
  volume: number
  kd?: number
  cpc?: number
  competition?: number
  intent?: string
  trend?: string
  serp_features?: string
  page?: string
  topic?: string
  page_type?: string
  seed_keyword?: string
  source_file?: string
  source_role: SourceRole
  source: string
}

function parseNumber(value: string): number | undefined {
  const normalized = value.trim().replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
  if (!normalized || normalized === '/' || normalized === '-') return undefined
  const multiplier = normalized.endsWith('k') ? 1000 : normalized.endsWith('m') ? 1000000 : 1
  const parsed = parseFloat(normalized.replace(/[km]$/, ''))
  return Number.isFinite(parsed) ? parsed * multiplier : undefined
}

function findCol(headers: string[], candidates: string[]): string | undefined {
  const normalizedHeaders = headers.map(s => s.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(candidate.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  return undefined
}

function canonicalRole(role: string | undefined): SourceRole {
  if (role === 'broad_match' || role === 'current_page_gap' || role === 'page_cluster' || role === 'custom') return role
  return 'auto'
}

function detectSourceRole(headers: string[], requestedRole: SourceRole): SourceRole {
  if (requestedRole !== 'auto') return requestedRole

  const lower = headers.map(s => s.toLowerCase().trim())
  const has = (name: string) => lower.includes(name)
  const hasDomainCol = lower.some(h => /\.[a-z]{2,}(\/|$)?/.test(h) || h.includes('www.'))

  if (has('page') && has('topic') && has('page type')) return 'page_cluster'
  if (hasDomainCol) return 'current_page_gap'
  if (has('intent') && has('trend') && (has('keyword difficulty') || has('kd')) && has('serp features')) return 'broad_match'
  return 'custom'
}

export async function fileToRows(
  file: File
): Promise<{ rows: Record<string, string>[]; error?: string }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  try {
    const wb = XLSX.read(bytes, { type: 'array' })
    const rows: Record<string, string>[] = []

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const sheetRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
        defval: '',
        raw: false,
      })
      if (!sheetRows.length) continue

      const headers = Object.keys(sheetRows[0])
      const kwCol = findCol(headers, ['keyword', 'keywords', 'query', 'search term'])
      const volCol = findCol(headers, ['volume', 'search volume', 'avg. monthly searches', 'monthly searches'])
      if (!kwCol || !volCol) continue

      rows.push(...sheetRows.map(row => ({ ...row, __sheet: sheetName })))
    }

    if (!rows.length) {
      return { rows: [], error: `No valid keyword sheet found in "${file.name}". Expected Keyword + Volume columns.` }
    }

    return { rows }
  } catch {
    return { rows: [], error: `Could not parse file "${file.name}". Make sure it's a CSV or XLSX.` }
  }
}

export function pasteToRows(
  text: string,
  source: string,
  sourceRole: SourceRole = 'custom'
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
      const match = line.match(/^(.*?)\s+([0-9][0-9,\.]*[kmKM]?)\s+([0-9]+|\/|-)?$/)
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
      source_role: sourceRole === 'auto' ? 'custom' : sourceRole,
      source,
      source_file: 'Pasted input',
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

export function parseRows(
  raw: Record<string, string>[],
  source: string,
  requestedRole: SourceRole = 'auto',
  sourceFile?: string
): { rows: KeywordRow[]; error?: string } {
  if (!raw.length) return { rows: [] }

  const headers = Object.keys(raw[0])
  const kwCol = findCol(headers, ['keyword', 'keywords', 'query', 'search term'])
  const volCol = findCol(headers, ['volume', 'search volume', 'avg. monthly searches', 'monthly searches'])

  if (!kwCol) return { rows: [], error: `No keyword column found in file for section "${source}". Expected a column named "Keyword".` }
  if (!volCol) return { rows: [], error: `No volume column found in file for section "${source}". Expected a column named "Volume".` }

  const sourceRole = detectSourceRole(headers, canonicalRole(requestedRole))
  const kdCol = findCol(headers, ['kd', 'kd%', 'keyword difficulty', 'difficulty'])
  const cpcCol = findCol(headers, ['cpc', 'cpc (usd)', 'cost per click'])
  const competitionCol = findCol(headers, ['com.', 'competitive density', 'competition', 'density', 'competition density'])
  const intentCol = findCol(headers, ['intent', 'intents'])
  const trendCol = findCol(headers, ['trend'])
  const serpCol = findCol(headers, ['serp features', 'serp'])
  const pageCol = findCol(headers, ['page'])
  const topicCol = findCol(headers, ['topic'])
  const pageTypeCol = findCol(headers, ['page type'])
  const seedCol = findCol(headers, ['seed keyword', 'seed'])

  const rows: KeywordRow[] = []
  for (const row of raw) {
    const kw = String(row[kwCol] ?? '').trim().toLowerCase()
    const volume = parseNumber(String(row[volCol] ?? '')) ?? 0
    if (!kw) continue

    rows.push({
      keyword: kw,
      volume,
      kd: kdCol ? parseNumber(String(row[kdCol] ?? '')) : undefined,
      cpc: cpcCol ? parseNumber(String(row[cpcCol] ?? '')) : undefined,
      competition: competitionCol ? parseNumber(String(row[competitionCol] ?? '')) : undefined,
      intent: intentCol ? String(row[intentCol] ?? '').trim() || undefined : undefined,
      trend: trendCol ? String(row[trendCol] ?? '').trim() || undefined : undefined,
      serp_features: serpCol ? String(row[serpCol] ?? '').trim() || undefined : undefined,
      page: pageCol ? String(row[pageCol] ?? '').trim() || undefined : undefined,
      topic: topicCol ? String(row[topicCol] ?? '').trim() || undefined : undefined,
      page_type: pageTypeCol ? String(row[pageTypeCol] ?? '').trim() || undefined : undefined,
      seed_keyword: seedCol ? String(row[seedCol] ?? '').trim() || undefined : undefined,
      source_file: sourceFile,
      source_role: sourceRole,
      source,
      gap_evidence: sourceRole === 'current_page_gap' ? [{ source, file: sourceFile,
        intent: intentCol ? String(row[intentCol] ?? '').trim() : undefined,
        rankings: Object.entries(row).flatMap(([header, value]) => {
          if (/\(pages\)$/i.test(header)) return []
          const url = /^https?:\/\//i.test(header) ? header : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(header) ? 'https://' + header : ''
          const position = Number(String(value).trim())
          return url && Number.isInteger(position) && position > 0 ? [{ url, position }] : []
        }),
      }] : undefined,
    })
  }

  return { rows }
}

export type FilterStats = {
  total: number
  afterVolumeFilter: number
  afterDedup: number
  sentToAI: number
  brandTerms: number
  bySource: Record<string, number>
  bySourceRole: Record<string, number>
  baseSelected: number
  gapEligible: number
  gapIncluded: number
  gapAdded: number
  broadEligible: number
  broadIncluded: number
  warnings: string[]
}

export function mergeAndFilter(
  allRows: KeywordRow[],
  minVolume = 30,
  maxSend = 500
): { filtered: KeywordRow[]; stats: FilterStats } {
  const total = allRows.length

  const bySource: Record<string, number> = {}
  const bySourceRole: Record<string, number> = {}
  for (const row of allRows) {
    bySource[row.source] = (bySource[row.source] ?? 0) + 1
    const roleLabel = SOURCE_ROLE_LABELS[row.source_role] ?? row.source_role
    bySourceRole[roleLabel] = (bySourceRole[roleLabel] ?? 0) + 1
  }

  const volFiltered = allRows.filter(row => row.volume >= minVolume)
  const afterVolumeFilter = volFiltered.length

  const map = new Map<string, KeywordRow>()
  for (const row of volFiltered) {
    const existing = map.get(row.keyword)
    const sourcePriority = DEDUP_SOURCE_PRIORITY[row.source_role]
    const existingSourcePriority = existing ? DEDUP_SOURCE_PRIORITY[existing.source_role] : -1
    if (
      !existing ||
      sourcePriority > existingSourcePriority ||
      (sourcePriority === existingSourcePriority && row.volume > existing.volume) ||
      (sourcePriority === existingSourcePriority && row.volume === existing.volume && existing.kd === undefined && row.kd !== undefined)
    ) {
      map.set(row.keyword, row)
    }
  }

  const deduped = Array.from(map.values())
  const afterDedup = deduped.length
  const byVolume = [...deduped].sort((a, b) => b.volume - a.volume)
  const longtailPattern = /\b(how|what|why|when|where|which|best|safe|secure|privacy|free|online|alternative|compare|comparison|vs\.?|without|no sign ?up)\b/i
  const rolePriority = deduped
    .filter(row => row.source_role === 'broad_match' || row.source_role === 'page_cluster' || row.source_role === 'current_page_gap')
    .sort((a, b) => b.volume - a.volume)
  const longtailSignals = deduped
    .filter(row => longtailPattern.test(row.keyword) || row.keyword.split(/\s+/).filter(Boolean).length >= 3)
    .sort((a, b) => b.volume - a.volume)

  const selected = new Map<string, KeywordRow>()
  for (const row of longtailSignals.slice(0, 150)) selected.set(row.keyword, row)
  for (const row of rolePriority.slice(0, 350)) selected.set(row.keyword, row)
  for (const row of byVolume) {
    if (selected.size >= maxSend) break
    selected.set(row.keyword, row)
  }

  // Keep the original selection intact. Gap rows are an additional union,
  // including rows whose canonical metrics came from the broad source.
  const baseSelected = selected.size
  const gapKeys = new Set(volFiltered.filter(row => row.source_role === 'current_page_gap').map(row => row.keyword))
  if (gapKeys.size > 500) throw new Error(`Competitor gap contains ${gapKeys.size} eligible unique keywords. Keep at most 500 across gap sections; none were sent to AI.`)
  for (const keyword of gapKeys) selected.set(keyword, map.get(keyword)!)
  const broadKeys = new Set(volFiltered.filter(row => row.source_role === 'broad_match').map(row => row.keyword))
  const broadIncluded = [...broadKeys].filter(keyword => selected.has(keyword)).length
  const warnings: string[] = []
  if (broadKeys.size > 500) warnings.push(`Broad list: ${broadIncluded} of ${broadKeys.size} eligible unique keywords selected. Large lists may omit relevant terms. Remove unrelated broad keywords manually and aim for at most 500 eligible unique keywords (volume ≥30 after deduplication), then check coverage again.`)
  else if (broadIncluded < broadKeys.size) warnings.push(`Broad list: ${broadIncluded} of ${broadKeys.size} eligible unique keywords selected. Your broad list is already below 500, but cluster/custom sources compete for the original shared 500 slots. Narrow unrelated rows in those sources and check coverage again. Cleaning the broad list alone does not guarantee full coverage.`)
  const evidence = new Map<string, KeywordRow[]>()
  for (const row of volFiltered) evidence.set(row.keyword, [...(evidence.get(row.keyword) || []), row])

  const filtered = Array.from(selected.values())
    .sort((a, b) => b.volume - a.volume)
    .map((row, index) => ({ ...row, keyword_id: `kw_${String(index + 1).padStart(4, '0')}`,
      source_roles: [...new Set(evidence.get(row.keyword)!.map(r => r.source_role))],
      gap_evidence: evidence.get(row.keyword)!.filter(r => r.source_role === 'current_page_gap').flatMap(r => r.gap_evidence || [{source:r.source,file:r.source_file,intent:r.intent,rankings:[]}]),
    }))

  const brandTerms = filtered.filter(row => row.source.toLowerCase().includes('competitor')).length

  return {
    filtered,
    stats: {
      total,
      afterVolumeFilter,
      afterDedup,
      sentToAI: filtered.length,
      brandTerms,
      bySource,
      bySourceRole,
      baseSelected, gapEligible: gapKeys.size, gapIncluded: gapKeys.size,
      gapAdded: selected.size - baseSelected, broadEligible: broadKeys.size, broadIncluded, warnings,
    },
  }
}

const LOW_DEMAND_MODIFIER_PATTERN = /\b(free|online|no sign ?up|without (?:login|sign ?up|watermark)|safe|secure|private|privacy)\b/i

const LOW_DEMAND_STRIP_PATTERN = /\b(?:is|are|the|a|an|free|online|no sign ?up|without (?:login|sign ?up|watermark)|safe|secure|private|privacy)\b/gi

export function findLowDemandModifierGuidance(allRows: KeywordRow[], currentPageIds: Set<string>): string[] {
  const eligibleBaseKeywords = new Set(
    allRows
      .filter(row => row.volume >= 30 && row.keyword_id && currentPageIds.has(row.keyword_id))
      .map(row => row.keyword.toLowerCase().trim())
  )

  return Array.from(new Set(
    allRows
      .filter(row => row.volume > 0 && row.volume < 30 && LOW_DEMAND_MODIFIER_PATTERN.test(row.keyword))
      .map(row => {
        const base = row.keyword
          .toLowerCase()
          .replace(LOW_DEMAND_STRIP_PATTERN, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return eligibleBaseKeywords.has(base) ? row.keyword : null
      })
      .filter((keyword): keyword is string => Boolean(keyword))
  ))
}

export function seedDiscoverySignals(rows: KeywordRow[]): string[] {
  return Array.from(new Set(rows.map(row => row.seed_keyword?.trim()).filter((seed): seed is string => Boolean(seed)))).slice(0, 80)
}

export function formatForAI(rows: KeywordRow[]): string {
  const header = 'keyword_id\tsource_role\tsource\tkeyword\tvolume\tkd\tcpc\tcompetition\tintent\ttrend\tpage\ttopic\tpage_type\tserp_features\tsource_roles\tgap_evidence'
  const body = rows
    .map(row => [
      row.keyword_id ?? '',
      row.source_role,
      row.source,
      row.keyword,
      row.volume,
      row.kd ?? '',
      row.cpc ?? '',
      row.competition ?? '',
      row.intent ?? '',
      row.trend ?? '',
      row.page ?? '',
      row.topic ?? '',
      row.page_type ?? '',
      row.serp_features ?? '',
      (row.source_roles || [row.source_role]).join(','),
      row.gap_evidence?.length ? JSON.stringify(row.gap_evidence) : '',
    ].map(value => String(value).replace(/[\t\r\n]/g, ' ')).join('\t'))
    .join('\n')
  return `${header}\n${body}`
}
