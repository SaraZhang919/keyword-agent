import { NextRequest, NextResponse } from 'next/server'
import { fileToRows, findLowDemandModifierGuidance, formatForAI, mergeAndFilter, parseRows, pasteToRows, seedDiscoverySignals, type SourceRole } from '@/lib/prefilter'
import { classificationPrompt, DEFAULT_BRAND_SCOPE, DEFAULT_PROMPT, isCompatiblePrompt, MODEL } from '@/lib/prompt'

function extractJsonObject(text: string): string | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return cleaned.slice(start, end + 1)
}

type MetricRow = {
  keyword_id?: string
  keyword: string
  volume: number
  kd?: number
  cpc?: number
  competition?: number
  trend?: string
  serp_features?: string
  source_role?: SourceRole
  source: string
}

type KeywordClassification = {
  current_page_ids: string[]
  new_page_ids: string[]
  out_of_brand_ids: string[]
}

const GENERIC_TOKENS = new Set([
  'a', 'an', 'and', 'app', 'best', 'for', 'free', 'from', 'how', 'in', 'is', 'no',
  'of', 'online', 'or', 'software', 'the', 'to', 'tool', 'tools', 'up', 'what', 'with', 'without',
])

const TASK_GROUPS: Record<string, string[]> = {
  summarize: ['summarize', 'summarise', 'summarizer', 'summariser', 'summary', 'summarization', 'notes', 'key points'],
  compress: ['compress', 'compression', 'reduce size', 'file size'],
  convert: ['convert', 'converter', 'conversion'],
  edit: ['edit', 'editor', 'merge', 'split', 'annotate', 'sign', 'fill'],
  extract: ['ocr', 'extract text', 'extractor', 'recognize text', 'recognition'],
  generate: ['create', 'generate', 'generator', 'maker'],
  protect: ['unlock', 'lock', 'protect', 'password', 'permissions'],
  read_chat: ['read', 'reader', 'chat', 'ask'],
  study: ['flashcard', 'flashcards', 'study guide', 'quiz'],
  transcribe: ['transcribe', 'transcription', 'transcript'],
  translate: ['translate', 'translation'],
}

const OBJECT_GROUPS: Record<string, string[]> = {
  document: ['pdf', 'doc', 'docx', 'document', 'documents', 'paper', 'report', 'contract'],
  video: ['video', 'videos', 'youtube', 'tiktok', 'reels', 'shorts', 'mp4'],
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures', 'png', 'jpg', 'jpeg'],
  audio: ['audio', 'podcast', 'voice', 'mp3'],
}

const LONGTAIL_PATTERN = /\b(how|what|why|when|where|which|can|is|are|best|safe|secure|private|privacy|free|online|no sign ?up|without|alternative|compare|comparison|vs\.?|for)\b/i
const ACCESS_PATTERN = /\b(free|online|no sign ?up|without|instant)\b/i
const TRUST_PATTERN = /\b(safe|secure|private|privacy|accurate|citation|citations|source|sources)\b/i

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)
}

function matchingGroups(value: string, groups: Record<string, string[]>): Set<string> {
  const normalized = ` ${words(value).join(' ')} `
  const tokens = new Set(words(value))
  return new Set(Object.entries(groups)
    .filter(([, terms]) => terms.some(term => term.includes(' ') ? normalized.includes(` ${term} `) : tokens.has(term)))
    .map(([group]) => group))
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  return Array.from(a).some(value => b.has(value))
}

function lexicalCurrentPageScore(row: MetricRow, primaryKeyword: string, pageType: string): number {
  const context = `${primaryKeyword} ${pageType}`
  const contextTokens = new Set(words(context).filter(token => !GENERIC_TOKENS.has(token)))
  const keywordTokens = new Set(words(row.keyword).filter(token => !GENERIC_TOKENS.has(token)))
  const contextTasks = matchingGroups(context, TASK_GROUPS)
  const keywordTasks = matchingGroups(row.keyword, TASK_GROUPS)
  const contextObjects = matchingGroups(context, OBJECT_GROUPS)
  const keywordObjects = matchingGroups(row.keyword, OBJECT_GROUPS)
  const objectMatch = contextObjects.size > 0 && intersects(contextObjects, keywordObjects)
  const taskMatch = contextTasks.size > 0 && intersects(contextTasks, keywordTasks)
  const primary = primaryKeyword.toLowerCase().trim()
  const exactRelation = Boolean(primary) && (row.keyword.includes(primary) || primary.includes(row.keyword))

  if (contextObjects.size && !objectMatch && !exactRelation) return -1
  if (contextTasks.size && !taskMatch && !exactRelation) return -1

  let overlap = 0
  for (const token of contextTokens) if (keywordTokens.has(token)) overlap += 1

  if (!exactRelation && !objectMatch && !taskMatch && overlap === 0) return -1
  return overlap * 3 + (objectMatch ? 4 : 0) + (taskMatch ? 4 : 0) + (exactRelation ? 6 : 0) + Math.log10(row.volume + 1)
}

function expandCurrentPageClassification(
  classification: KeywordClassification,
  rows: MetricRow[],
  primaryKeyword: string,
  pageType: string,
  minimumPoolSize = 20
): { classification: KeywordClassification; addedIds: string[] } {
  const currentIds = new Set(classification.current_page_ids)
  const candidates = rows
    .filter(row => row.keyword_id && !currentIds.has(row.keyword_id))
    .map(row => ({ row, score: lexicalCurrentPageScore(row, primaryKeyword, pageType) }))
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || b.row.volume - a.row.volume)
  const addedIds: string[] = []

  for (const { row } of candidates) {
    if (currentIds.size >= minimumPoolSize) break
    currentIds.add(row.keyword_id!)
    addedIds.push(row.keyword_id!)
  }

  return {
    classification: {
      ...classification,
      current_page_ids: Array.from(currentIds),
      out_of_brand_ids: classification.out_of_brand_ids.filter(id => !currentIds.has(id)),
    },
    addedIds,
  }
}

function validatedIds(value: unknown, availableIds: Set<string>): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && availableIds.has(id))))
}

function parseClassification(value: unknown, availableIds: Set<string>): KeywordClassification | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const currentPageIds = validatedIds(data.current_page_ids, availableIds)
  const newPageIds = validatedIds(data.new_page_ids, availableIds)
  const outOfBrandIds = validatedIds(data.out_of_brand_ids, availableIds)
  if (currentPageIds.length === 0 && newPageIds.length === 0 && outOfBrandIds.length === 0) return null
  return { current_page_ids: currentPageIds, new_page_ids: newPageIds, out_of_brand_ids: outOfBrandIds }
}

function normalizeKeyword(keyword: unknown): string {
  return String(keyword ?? '').trim().toLowerCase()
}

function applyExactMetrics(
  result: unknown,
  rows: MetricRow[],
  classification: KeywordClassification,
  lowDemandModifierGuidance: string[],
  lexicalFallbackIds: string[],
  includeArticleIdeas: boolean
): unknown {
  const byId = new Map(rows.filter(row => row.keyword_id).map(row => [row.keyword_id!, row]))
  const byKeyword = new Map(rows.map(row => [normalizeKeyword(row.keyword), row]))
  const data = result && typeof result === 'object' ? result as Record<string, any> : {}
  const unsupported: Array<Record<string, any>> = []
  const corrections: Array<Record<string, any>> = []
  const boundaryRejections: Array<Record<string, string>> = []
  const fallbackExpansions: Array<Record<string, string>> = []
  const currentPageIds = new Set(classification.current_page_ids)
  const newPageIds = new Set(classification.new_page_ids)

  for (const key of ['supporting_keywords', 'longtail_keywords', 'competitor_insights', 'excluded_keywords', 'missing_exports', 'new_page_opportunities', 'article_idea_expansions']) {
    if (!Array.isArray(data[key])) data[key] = []
  }
  if (!includeArticleIdeas) data.article_idea_expansions = []

  function patchKeywordLike(item: unknown, section: string) {
    if (!item || typeof item !== 'object') return false
    const target = item as Record<string, any>
    const rowById = typeof target.keyword_id === 'string' ? byId.get(target.keyword_id) : undefined
    const rowByKeyword = byKeyword.get(normalizeKeyword(target.keyword))
    const row = rowById ?? rowByKeyword
    if (!row) {
      unsupported.push({
        section,
        keyword_id: target.keyword_id ?? null,
        keyword: target.keyword ?? target.primary_keyword ?? null,
        reason: 'No matching uploaded/pasted keyword row.',
      })
      target.volume = 0
      target.kd = 0
      target.cpc = 0
      target.density = 0
      target.competition = 0
      target.source = 'unsupported_ai_suggestion'
      target.source_role = 'unsupported'
      if (typeof target.note === 'string') {
        target.note = `${target.note} Metrics removed because no uploaded/pasted keyword row matched this suggestion.`
      } else if (typeof target.flag === 'string') {
        target.flag = `${target.flag}; metrics removed because no uploaded/pasted keyword row matched this suggestion.`
      } else {
        target.note = 'Unsupported AI suggestion. Metrics removed because no uploaded/pasted keyword row matched this keyword.'
      }
      return false
    }

    if ((section === 'primary_keyword' || section === 'supporting_keywords' || section === 'longtail_keywords') && !currentPageIds.has(row.keyword_id ?? '')) {
      boundaryRejections.push({ section, keyword: row.keyword, reason: 'Not classified as current-page fit.' })
      return false
    }

    if (!rowById && rowByKeyword) {
      corrections.push({
        section,
        keyword: row.keyword,
        reason: 'Matched by exact keyword text because keyword_id was missing or invalid.',
      })
    }

    target.keyword_id = row.keyword_id
    target.keyword = row.keyword
    target.volume = row.volume
    target.kd = row.kd ?? 0
    target.cpc = row.cpc ?? 0
    target.density = row.competition ?? 0
    target.competition = row.competition ?? 0
    if (row.trend) target.trend = row.trend
    if (row.serp_features) target.serp_features = row.serp_features
    target.source = row.source
    target.source_role = row.source_role
    return true
  }

  const primaryWasValid = patchKeywordLike(data.primary_keyword, 'primary_keyword')
  if (!primaryWasValid) {
    const fallback = rows.find(row => currentPageIds.has(row.keyword_id ?? ''))
    if (fallback) {
      data.primary_keyword = {
        keyword_id: fallback.keyword_id,
        keyword: fallback.keyword,
        volume: fallback.volume,
        kd: fallback.kd ?? 0,
        cpc: fallback.cpc ?? 0,
        competition: fallback.competition ?? 0,
        density: fallback.competition ?? 0,
        trend: fallback.trend ?? '',
        source: fallback.source,
        source_role: fallback.source_role,
        validated: false,
        note: 'Fallback selected because the AI returned a primary keyword outside the classified current-page pool.',
      }
    }
  }
  for (const key of ['supporting_keywords', 'longtail_keywords', 'competitor_insights']) {
    data[key] = data[key].filter((item: unknown) => patchKeywordLike(item, key))
  }

  if (Array.isArray(data.new_page_opportunities)) {
    for (const item of data.new_page_opportunities) {
      if (!item || typeof item !== 'object') continue
      const target = item as Record<string, any>
      const rowById = typeof target.primary_keyword_id === 'string' ? byId.get(target.primary_keyword_id) : undefined
      const rowByKeyword = byKeyword.get(normalizeKeyword(target.primary_keyword))
      const row = rowById ?? rowByKeyword
      if (!row) {
        unsupported.push({
          section: 'new_page_opportunities',
          keyword_id: target.primary_keyword_id ?? null,
          keyword: target.primary_keyword ?? null,
          reason: 'No matching uploaded/pasted keyword row for page opportunity primary keyword.',
        })
        delete target.primary_keyword_volume
        delete target.primary_keyword_kd
        delete target.primary_keyword_competition
        target.source = 'unsupported_ai_suggestion'
        target.source_role = 'unsupported'
        target.difficulty_note = [
          target.difficulty_note,
          'Metrics removed because no uploaded/pasted keyword row matched this page opportunity primary keyword.',
        ].filter(Boolean).join(' ')
        continue
      }
      if (!newPageIds.has(row.keyword_id ?? '')) {
        boundaryRejections.push({ section: 'new_page_opportunities', keyword: row.keyword, reason: 'Not classified as an in-scope new-page opportunity.' })
        target.primary_keyword = ''
        target.primary_keyword_id = ''
        target.primary_keyword_volume = 0
        target.primary_keyword_kd = 0
        target.difficulty_note = 'Removed because the keyword was not classified as an in-scope new-page opportunity.'
        continue
      }
      target.primary_keyword_id = row.keyword_id
      target.primary_keyword = row.keyword
      target.primary_keyword_volume = row.volume
      target.primary_keyword_kd = row.kd ?? 0
      target.primary_keyword_competition = row.competition ?? 0
      if (row.trend) target.primary_keyword_trend = row.trend
      if (row.serp_features) target.serp_features = row.serp_features
      target.source = row.source
      target.source_role = row.source_role
      if (!rowById && rowByKeyword) {
        corrections.push({
          section: 'new_page_opportunities',
          keyword: row.keyword,
          reason: 'Matched by exact keyword text because primary_keyword_id was missing or invalid.',
        })
      }
    }
  }

  if (Array.isArray(data.new_page_opportunities)) {
    data.new_page_opportunities = data.new_page_opportunities.filter((item: Record<string, any>) => item?.primary_keyword_id)
  }

  const usedIds = new Set<string>([
    data.primary_keyword?.keyword_id,
    ...data.supporting_keywords.map((item: Record<string, any>) => item?.keyword_id),
    ...data.longtail_keywords.map((item: Record<string, any>) => item?.keyword_id),
  ].filter((id): id is string => typeof id === 'string'))
  const availableCurrentRows = rows
    .filter(row => row.keyword_id && currentPageIds.has(row.keyword_id) && !usedIds.has(row.keyword_id))
    .filter(row => !row.source.toLowerCase().includes('competitor'))
    .sort((a, b) => b.volume - a.volume)

  function isLongtail(row: MetricRow): boolean {
    return LONGTAIL_PATTERN.test(row.keyword) || words(row.keyword).length >= 4
  }

  function fallbackKeyword(row: MetricRow, section: 'supporting_keywords' | 'longtail_keywords'): Record<string, any> {
    const placement = ACCESS_PATTERN.test(row.keyword)
      ? 'CTA or value proposition'
      : TRUST_PATTERN.test(row.keyword) || /\b(how|what|why|is|are|can)\b/i.test(row.keyword)
        ? 'FAQ or trust section'
        : isLongtail(row) ? 'Use-case or task-specific section' : 'H2, feature block, or body copy'
    return {
      keyword_id: row.keyword_id,
      keyword: row.keyword,
      volume: row.volume,
      kd: row.kd ?? 0,
      cpc: row.cpc ?? 0,
      density: row.competition ?? 0,
      competition: row.competition ?? 0,
      trend: row.trend ?? '',
      serp_features: row.serp_features ?? '',
      source: row.source,
      source_role: row.source_role,
      trend_direction: 'Insufficient Data',
      ...(section === 'supporting_keywords'
        ? { content_placement: placement, flag: 'Server fallback from validated current-page pool.' }
        : { content_format: placement, use_case: `Cover the search intent expressed by "${row.keyword}".` }),
    }
  }

  function refill(section: 'supporting_keywords' | 'longtail_keywords', preferred: (row: MetricRow) => boolean) {
    const candidates = [...availableCurrentRows.filter(preferred), ...availableCurrentRows.filter(row => !preferred(row))]
    for (const row of candidates) {
      if (data[section].length >= 5) break
      if (!row.keyword_id || usedIds.has(row.keyword_id)) continue
      data[section].push(fallbackKeyword(row, section))
      usedIds.add(row.keyword_id)
      fallbackExpansions.push({ section, keyword_id: row.keyword_id, keyword: row.keyword })
    }
  }

  refill('supporting_keywords', row => !isLongtail(row))
  refill('longtail_keywords', isLongtail)

  data.page_strategy_notes = {
    ...(data.page_strategy_notes && typeof data.page_strategy_notes === 'object' ? data.page_strategy_notes : {}),
    content_format: data.page_strategy_notes?.content_format ?? '',
    biggest_opportunity: data.page_strategy_notes?.biggest_opportunity ?? '',
    primary_risk: data.page_strategy_notes?.primary_risk ?? '',
    low_demand_modifier_guidance: lowDemandModifierGuidance.map(keyword => `${keyword} — Low demand (<30); use only as optional access/trust wording.`),
  }

  data.data_audit = {
    unsupported_ai_suggestions: unsupported,
    metric_corrections_applied: corrections,
    keyword_classification: classification,
    boundary_rejections: boundaryRejections,
    lexical_current_page_expansions: lexicalFallbackIds,
    section_fallback_expansions: fallbackExpansions,
  }

  return data
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const pageType = formData.get('pageType') as string
    const primaryKeyword = formData.get('primaryKeyword') as string
    const targetAudience = (formData.get('targetAudience') as string) || 'All / Undefined'

    if (!pageType || !primaryKeyword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    // --- Stage 1: Collect all sections (topic_keywords_file, related_keywords_file, etc.) ---
    const allRows: Awaited<ReturnType<typeof parseRows>>['rows'] = []
    const entries = Array.from(formData.entries())
    const fileEntries = entries.filter(([key]) => key.endsWith('_file'))
    const pasteEntries = entries.filter(([key, value]) =>
      key.endsWith('_paste') && typeof value === 'string' && value.trim()
    )

    if (fileEntries.length === 0 && pasteEntries.length === 0) {
      return NextResponse.json({ error: 'Please upload a keyword file or paste keyword rows.' }, { status: 400 })
    }

    for (const [key, value] of fileEntries) {
      const file = value as File
      const labelKey = key.replace('_file', '_label')
      const roleKey = key.replace('_file', '_role')
      const label = (formData.get(labelKey) as string) || key.replace('_file', '').replace(/_/g, ' ')
      const role = ((formData.get(roleKey) as string) || 'auto') as SourceRole

      const { rows: rawRows, error: fileError } = await fileToRows(file)
      if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

      const { rows, error: parseError } = parseRows(rawRows, label, role)
      if (parseError) return NextResponse.json({ error: parseError }, { status: 400 })

      allRows.push(...rows)
    }

    for (const [key, value] of pasteEntries) {
      const labelKey = key.replace('_paste', '_label')
      const roleKey = key.replace('_paste', '_role')
      const label = (formData.get(labelKey) as string) || key.replace('_paste', '').replace(/_/g, ' ')
      const role = ((formData.get(roleKey) as string) || 'custom') as SourceRole
      const { rows, error: pasteError } = pasteToRows(value as string, label, role)
      if (pasteError) return NextResponse.json({ error: pasteError }, { status: 400 })
      allRows.push(...rows)
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'No keywords found in uploaded files or pasted rows' }, { status: 400 })
    }

    const { filtered, stats } = mergeAndFilter(allRows)
    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No keywords remain after filtering (all had volume < 30)' }, { status: 400 })
    }

    // --- Get persistent prompt and brand scope (from KV if available) ---
    let prompt = DEFAULT_PROMPT
    let brandScope = DEFAULT_BRAND_SCOPE
    try {
      const { Redis } = await import('@upstash/redis')
      const kv = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      })
      const saved = await kv.get<string>('keyword-strategy-prompt')
      if (saved && isCompatiblePrompt(saved)) prompt = saved
      const savedBrandScope = await kv.get<string>('keyword-strategy-brand-scope')
      if (savedBrandScope?.trim()) brandScope = savedBrandScope.trim()
    } catch {
      // KV not configured, use defaults
    }

    const keywordList = formatForAI(filtered)
    const availableIds = new Set(filtered.map(row => row.keyword_id!).filter(Boolean))

    // --- Stage 1: classify exact IDs before generating recommendations ---
    const classificationRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: classificationPrompt(pageType, primaryKeyword, brandScope) },
          { role: 'user', content: `Keyword TSV (${filtered.length} rows):\n\n${keywordList}` },
        ],
      }),
    })

    if (!classificationRes.ok) {
      console.error('OpenAI classification error:', await classificationRes.text())
      return NextResponse.json({ error: 'Keyword classification failed. Please run the analysis again.' }, { status: 500 })
    }

    const classificationData = await classificationRes.json()
    const classificationText = classificationData.choices?.[0]?.message?.content ?? ''
    const classificationJson = extractJsonObject(classificationText)
    let classification: KeywordClassification | null = null
    try {
      classification = classificationJson ? parseClassification(JSON.parse(classificationJson), availableIds) : null
    } catch {
      classification = null
    }

    if (!classification) {
      console.error('Invalid keyword classification:', classificationText.slice(0, 500))
      return NextResponse.json({ error: 'Keyword classification returned invalid data. Please run the analysis again.' }, { status: 500 })
    }

    const expandedClassification = expandCurrentPageClassification(classification, filtered, primaryKeyword, pageType)
    classification = expandedClassification.classification
    const currentPageRows = filtered.filter(row => classification.current_page_ids.includes(row.keyword_id!))
    const lowDemandModifierGuidance = findLowDemandModifierGuidance([...allRows, ...filtered], new Set(classification.current_page_ids))
    const seeds = seedDiscoverySignals(allRows)

    if (currentPageRows.length === 0) {
      return NextResponse.json({ error: 'No uploaded keywords matched the submitted current page. Check the primary keyword or upload a closer broad-match export.' }, { status: 400 })
    }

    // --- Stage 2: generate strategy from separated, validated pools ---
    const finalPrompt = `${prompt
      .replace('{{PAGE_TYPE}}', pageType)
      .replace('{{PRIMARY_KEYWORD}}', primaryKeyword)
      .replace('{{TARGET_AUDIENCE}}', targetAudience)
      .replace('{{BRAND_SCOPE}}', brandScope)}

CLASSIFICATION POOLS (absolute rules):
CURRENT_PAGE_KEYWORD_IDS: ${classification.current_page_ids.join(', ')}
NEW_PAGE_KEYWORD_IDS: ${classification.new_page_ids.join(', ')}
OUT_OF_BRAND_KEYWORD_IDS: ${classification.out_of_brand_ids.join(', ')}
LOW_DEMAND_MODIFIER_GUIDANCE: ${lowDemandModifierGuidance.join(' | ') || 'None'}
SEED_DISCOVERY_SIGNALS (no metrics, never keyword targets): ${seeds.join(' | ') || 'None'}

For primary_keyword, supporting_keywords, and longtail_keywords, use only CURRENT_PAGE_KEYWORD_IDS.
For new_page_opportunities, use only NEW_PAGE_KEYWORD_IDS and the Brand Strategy Scope.
If a seed signal lacks corroborating measured NEW_PAGE_KEYWORD_IDS, place it in missing_exports only.`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: finalPrompt },
          {
            role: 'user',
            content: `Keyword list (${filtered.length} keywords after pre-filtering ${stats.total} total):\n\n${keywordList}`,
          },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.text()
      console.error('OpenAI API error:', err)
      return NextResponse.json({ error: 'OpenAI API call failed' }, { status: 500 })
    }

    const openaiData = await openaiRes.json()
    const finishReason = openaiData.choices?.[0]?.finish_reason
    const rawText = openaiData.choices?.[0]?.message?.content ?? ''
    const jsonText = extractJsonObject(rawText)

    if (!jsonText || finishReason === 'length') {
      console.error('OpenAI returned incomplete JSON:', {
        finishReason,
        preview: rawText.slice(0, 500),
      })
      return NextResponse.json({
        error: 'AI response was incomplete. Try a smaller upload or run again.',
      }, { status: 500 })
    }

    let result: unknown
    try {
      result = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Could not parse OpenAI JSON:', {
        parseError,
        finishReason,
        preview: rawText.slice(0, 500),
      })
      return NextResponse.json({
        error: 'AI returned invalid JSON. Please run the analysis again.',
      }, { status: 500 })
    }

    return NextResponse.json({
      result: applyExactMetrics(
        result,
        filtered,
        classification,
        lowDemandModifierGuidance,
        expandedClassification.addedIds,
        targetAudience.trim().toLowerCase() !== 'all / undefined'
      ),
      stats: { ...stats, sentToAI: filtered.length },
    })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
