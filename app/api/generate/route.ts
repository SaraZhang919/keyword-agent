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
  lowDemandModifierGuidance: string[]
): unknown {
  if (!result || typeof result !== 'object') return result

  const byId = new Map(rows.filter(row => row.keyword_id).map(row => [row.keyword_id!, row]))
  const byKeyword = new Map(rows.map(row => [normalizeKeyword(row.keyword), row]))
  const data = result as Record<string, any>
  const unsupported: Array<Record<string, any>> = []
  const corrections: Array<Record<string, any>> = []
  const boundaryRejections: Array<Record<string, string>> = []
  const currentPageIds = new Set(classification.current_page_ids)
  const newPageIds = new Set(classification.new_page_ids)

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
    if (Array.isArray(data[key])) {
      data[key] = data[key].filter((item: unknown) => patchKeywordLike(item, key))
    }
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

  data.page_strategy_notes = {
    ...(data.page_strategy_notes && typeof data.page_strategy_notes === 'object' ? data.page_strategy_notes : {}),
    low_demand_modifier_guidance: lowDemandModifierGuidance.map(keyword => `${keyword} — Low demand (<30); use only as optional access/trust wording.`),
  }

  data.data_audit = {
    unsupported_ai_suggestions: unsupported,
    metric_corrections_applied: corrections,
    keyword_classification: classification,
    boundary_rejections: boundaryRejections,
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
        max_tokens: 3000,
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

    const currentPageRows = filtered.filter(row => classification!.current_page_ids.includes(row.keyword_id!))
    const newPageRows = filtered.filter(row => classification!.new_page_ids.includes(row.keyword_id!))
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
      result: applyExactMetrics(result, filtered, classification, lowDemandModifierGuidance),
      stats: { ...stats, sentToAI: filtered.length },
    })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
