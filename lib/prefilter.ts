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

export type KeywordRow = {
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
  source_role: SourceRole
  source: string
}

const TASK_PATTERN = /\b(analy[sz]e|ask|chat|check|convert|create|detect|edit|extract|find|fix|generate|get|identify|make|merge|read|remove|scan|split|summari[sz]e|take|transcribe|translate|unlock|write)\b/i
const TOOL_PATTERN = /\b(app|assistant|builder|calculator|checker|converter|editor|extractor|finder|generator|maker|reader|scanner|summari[sz]er|template|tool)\b/i
const ACCESS_PATTERN = /\b(free|gratis|online|no sign ?up|without (login|sign ?up|watermark)|browser|web|instant)\b/i
const TRUST_PATTERN = /\b(accurate|best|safe|secure|private|privacy|alternative|comparison|compare|citation|citations|cite|source reference|sources?)\b/i
const USE_CASE_PATTERN = /\b(academic|business|contract|enterprise|legal|meeting|report|research|student|teacher|team|work|workflow)\b/i
const QUESTION_PATTERN = /\b(how|what|why|when|where|which|can|is|are|does|do)\b/i
const PLATFORM_FORMAT_PATTERN = /\b(android|api|browser|caption|captions|chrome|csv|desktop|docx|excel|extension|ios|iphone|mac|mobile|notes?|pdf|png|ppt|sheets|summary|summaries|transcript|transcripts|windows|word|xlsx)\b/i

function tokenCount(keyword: string): number {
  return keyword.split(/\s+/).filter(Boolean).length
}

function logVolumeScore(volume: number, maxVolume: number): number {
  if (maxVolume <= 0) return 0
  return Math.log10(volume + 1) / Math.log10(maxVolume + 1)
}

function kdScore(kd?: number): number {
  if (kd === undefined) return 0.15
  if (kd < 20) return 1
  if (kd < 40) return 0.85
  if (kd <= 65) return 0.45
  if (kd <= 80) return 0.18
  return 0
}

function intentScore(intent?: string): number {
  const normalized = intent?.toLowerCase() ?? ''
  if (normalized.includes('transactional')) return 1
  if (normalized.includes('commercial')) return 0.85
  if (normalized.includes('informational')) return 0.45
  if (normalized.includes('navigational')) return 0.05
  return 0.25
}

function modifierScore(row: KeywordRow): number {
  const text = `${row.keyword} ${row.page ?? ''} ${row.topic ?? ''} ${row.page_type ?? ''}`
  let score = 0
  if (TASK_PATTERN.test(text)) score += 0.18
  if (TOOL_PATTERN.test(text)) score += 0.16
  if (ACCESS_PATTERN.test(text)) score += 0.15
  if (TRUST_PATTERN.test(text)) score += 0.14
  if (USE_CASE_PATTERN.test(text)) score += 0.12
  if (QUESTION_PATTERN.test(text)) score += 0.1
  if (PLATFORM_FORMAT_PATTERN.test(text)) score += 0.08
  if (tokenCount(row.keyword) >= 3) score += 0.12
  if (tokenCount(row.keyword) >= 5) score += 0.08
  return Math.min(score, 0.75)
}

function roleScore(role: SourceRole): number {
  if (role === 'broad_match') return 0.18
  if (role === 'page_cluster') return 0.16
  if (role === 'current_page_gap') return 0.12
  if (role === 'custom') return 0.08
  return 0
}

function opportunityScore(row: KeywordRow, maxVolume: number): number {
  const volume = logVolumeScore(row.volume, maxVolume)
  const kd = kdScore(row.kd)
  const intent = intentScore(row.intent)
  const modifiers = modifierScore(row)
  const role = roleScore(row.source_role)
  const competitionSignal = row.competition !== undefined && row.competition > 0 ? 0.04 : 0
  const serpSignal = row.serp_features ? 0.06 : 0
  const clusterSignal = row.topic || row.page || row.page_type ? 0.08 : 0

  return (
    volume * 0.28 +
    kd * 0.24 +
    intent * 0.16 +
    modifiers +
    role +
    competitionSignal +
    serpSignal +
    clusterSignal
  )
}

function clusterKey(row: KeywordRow): string {
  return (row.topic || row.page || row.source || row.source_role).toLowerCase().trim()
}

function addRows(
  selected: Map<string, KeywordRow>,
  rows: KeywordRow[],
  limit: number,
  maxPerCluster = Infinity
) {
  const clusterCounts = new Map<string, number>()
  for (const row of selected.values()) {
    const key = clusterKey(row)
    clusterCounts.set(key, (clusterCounts.get(key) ?? 0) + 1)
  }

  for (const row of rows) {
    if (selected.size >= limit) break
    if (selected.has(row.keyword)) continue
    const key = clusterKey(row)
    const count = clusterCounts.get(key) ?? 0
    if (count >= maxPerCluster) continue
    selected.set(row.keyword, row)
    clusterCounts.set(key, count + 1)
  }
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
  if ((has('kd%') || has('position') || has('previous position')) && hasDomainCol) return 'current_page_gap'
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
  requestedRole: SourceRole = 'auto'
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
  const competitionCol = findCol(headers, ['com.', 'competitive density', 'competition', 'density'])
  const intentCol = findCol(headers, ['intent'])
  const trendCol = findCol(headers, ['trend'])
  const serpCol = findCol(headers, ['serp features', 'serp'])
  const pageCol = findCol(headers, ['page'])
  const topicCol = findCol(headers, ['topic'])
  const pageTypeCol = findCol(headers, ['page type'])

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
      source_role: sourceRole,
      source,
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
    if (
      !existing ||
      row.volume > existing.volume ||
      (row.volume === existing.volume && existing.kd === undefined && row.kd !== undefined)
    ) {
      map.set(row.keyword, row)
    }
  }

  const deduped = Array.from(map.values())
  const afterDedup = deduped.length
  const maxVolume = Math.max(...deduped.map(row => row.volume), 0)
  const byVolume = [...deduped].sort((a, b) => b.volume - a.volume)
  const byOpportunity = [...deduped].sort((a, b) => opportunityScore(b, maxVolume) - opportunityScore(a, maxVolume))
  const lowKdOpportunities = deduped
    .filter(row => {
      const hasLowKd = row.kd !== undefined && row.kd < 40
      const hasSpecificity = tokenCount(row.keyword) >= 3
      const hasModifier = modifierScore(row) >= 0.2
      return hasLowKd && (hasSpecificity || hasModifier)
    })
    .sort((a, b) => {
      const volumeBandA = a.volume >= 100 ? 1 : 0
      const volumeBandB = b.volume >= 100 ? 1 : 0
      const bandDelta = volumeBandB - volumeBandA
      return bandDelta || b.volume - a.volume || opportunityScore(b, maxVolume) - opportunityScore(a, maxVolume)
    })
  const placementSignals = deduped
    .filter(row => {
      const text = `${row.keyword} ${row.page ?? ''} ${row.topic ?? ''} ${row.page_type ?? ''}`
      return (
        TASK_PATTERN.test(text) ||
        TOOL_PATTERN.test(text) ||
        ACCESS_PATTERN.test(text) ||
        TRUST_PATTERN.test(text) ||
        USE_CASE_PATTERN.test(text) ||
        QUESTION_PATTERN.test(text) ||
        PLATFORM_FORMAT_PATTERN.test(text)
      )
    })
    .sort((a, b) => opportunityScore(b, maxVolume) - opportunityScore(a, maxVolume))
  const pageClusterSignals = deduped
    .filter(row => row.source_role === 'page_cluster')
    .sort((a, b) => {
      const scoreDelta = opportunityScore(b, maxVolume) - opportunityScore(a, maxVolume)
      return scoreDelta || b.volume - a.volume
    })
  const currentGapSignals = deduped
    .filter(row => row.source_role === 'current_page_gap')
    .sort((a, b) => opportunityScore(b, maxVolume) - opportunityScore(a, maxVolume))

  const selected = new Map<string, KeywordRow>()
  addRows(selected, byVolume, Math.min(maxSend, 220))
  addRows(selected, currentGapSignals, Math.min(maxSend, 320))
  addRows(selected, lowKdOpportunities, Math.min(maxSend, 470))
  addRows(selected, placementSignals, Math.min(maxSend, 490), 14)
  addRows(selected, pageClusterSignals, maxSend, 8)
  addRows(selected, byOpportunity, maxSend, 18)
  addRows(selected, byOpportunity, maxSend)
  addRows(selected, byVolume, maxSend)

  const filtered = Array.from(selected.values())
    .sort((a, b) => b.volume - a.volume)
    .map((row, index) => ({ ...row, keyword_id: `kw_${String(index + 1).padStart(4, '0')}` }))

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
    },
  }
}

export function formatForAI(rows: KeywordRow[]): string {
  const header = 'keyword_id\tsource_role\tsource\tkeyword\tvolume\tkd\tcpc\tcompetition\tintent\ttrend\tpage\ttopic\tpage_type\tserp_features'
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
    ].join('\t'))
    .join('\n')
  return `${header}\n${body}`
}
