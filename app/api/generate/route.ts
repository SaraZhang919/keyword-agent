import { NextRequest, NextResponse } from 'next/server'
import { fileToRows, parseRows, pasteToRows, mergeAndFilter, formatForAI, type SourceRole } from '@/lib/prefilter'
import { DEFAULT_PROMPT, MODEL } from '@/lib/prompt'

function supportsArticleIdeaExpansions(prompt: string): boolean {
  return (
    prompt.includes('{{TARGET_AUDIENCE}}') &&
    prompt.includes('article_idea_expansions') &&
    prompt.includes('keyword_id') &&
    prompt.includes('source_role') &&
    prompt.includes('competition') &&
    prompt.includes('serp_features') &&
    prompt.includes('trend') &&
    prompt.includes('TOPICAL RELEVANCE / OUTCOME MATCH RULE') &&
    prompt.includes('SECTION BOUNDARY')
  )
}

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

function normalizeKeyword(keyword: unknown): string {
  return String(keyword ?? '').trim().toLowerCase()
}

function keywordTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )
}

function groupMatch(text: string, groups: Record<string, string[]>): Set<string> {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const tokens = keywordTokens(text)
  const matches = new Set<string>()
  for (const [group, terms] of Object.entries(groups)) {
    if (terms.some(term => term.includes(' ') ? normalized.includes(` ${term} `) : tokens.has(term))) {
      matches.add(group)
    }
  }
  return matches
}

function hasSharedGroup(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true
  }
  return false
}

const FORMAT_GROUPS: Record<string, string[]> = {
  document: ['pdf', 'doc', 'docx', 'document', 'documents', 'file', 'files', 'paper', 'report', 'contract'],
  text_content: ['article', 'articles', 'blog', 'blogs', 'email', 'emails', 'text', 'texts', 'webpage', 'webpages'],
  video: ['video', 'videos', 'youtube', 'tiktok', 'reels', 'shorts', 'mp4'],
  image: ['image', 'images', 'photo', 'photos', 'picture', 'pictures', 'png', 'jpg', 'jpeg'],
  audio: ['audio', 'podcast', 'voice', 'mp3', 'transcript', 'transcription'],
}

const TASK_GROUPS: Record<string, string[]> = {
  summarize: ['summarize', 'summarise', 'summarizer', 'summariser', 'summary', 'summaries', 'summarization', 'summarisation', 'key points', 'main points', 'notes'],
  compress: ['compress', 'compression', 'reduce size', 'file size', 'smaller', 'resize'],
  convert: ['convert', 'converter', 'conversion', 'to text', 'ocr', 'extract text', 'extractor', 'rip text', 'copy text', 'recognize text', 'recognition'],
  edit: ['edit', 'editor', 'merge', 'split', 'annotate', 'annotator', 'sign', 'fill', 'add text', 'type on'],
  protect: ['unlock', 'lock', 'protect', 'unprotect', 'password', 'permissions'],
  chat_read: ['chat', 'read', 'reader', 'ask'],
  study: ['flashcard', 'flashcards', 'study guide', 'study tools', 'studying'],
  translate: ['translate', 'translation'],
}

function isCurrentPageKeywordTextMatch(keyword: string, primaryKeyword: string): boolean {
  const primaryFormats = groupMatch(primaryKeyword, FORMAT_GROUPS)
  const primaryTasks = groupMatch(primaryKeyword, TASK_GROUPS)
  if (primaryFormats.size === 0 && primaryTasks.size === 0) return true

  const keywordFormats = groupMatch(keyword, FORMAT_GROUPS)
  const keywordTasks = groupMatch(keyword, TASK_GROUPS)

  if (primaryFormats.size > 0 && keywordFormats.size > 0 && !hasSharedGroup(primaryFormats, keywordFormats)) {
    return false
  }
  if (primaryTasks.size > 0 && keywordTasks.size > 0 && !hasSharedGroup(primaryTasks, keywordTasks)) {
    return false
  }
  if (primaryFormats.size > 0 && primaryTasks.size > 0 && keywordFormats.size === 0 && keywordTasks.size === 0) {
    return false
  }
  if (primaryFormats.size > 0 && keywordFormats.size === 0 && keywordTasks.size > 0) {
    return false
  }
  if (primaryTasks.size > 0 && keywordTasks.size === 0 && keywordFormats.size === 0) {
    return false
  }

  return true
}

function applyExactMetrics(result: unknown, rows: MetricRow[], primaryKeyword: string): unknown {
  if (!result || typeof result !== 'object') return result

  const byId = new Map(rows.filter(row => row.keyword_id).map(row => [row.keyword_id!, row]))
  const byKeyword = new Map(rows.map(row => [normalizeKeyword(row.keyword), row]))
  const data = result as Record<string, any>
  const unsupported: Array<Record<string, any>> = []
  const corrections: Array<Record<string, any>> = []
  const currentPageMismatches: Array<Record<string, any>> = []

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

    if (
      (section === 'supporting_keywords' || section === 'longtail_keywords') &&
      !isCurrentPageKeywordTextMatch(row.keyword, primaryKeyword)
    ) {
      currentPageMismatches.push({
        section,
        keyword_id: row.keyword_id ?? null,
        keyword: row.keyword,
        reason: 'Keyword text does not match the submitted current-page object/task. Page/topic metadata may still inform new page opportunities.',
      })
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

  patchKeywordLike(data.primary_keyword, 'primary_keyword')
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

  data.data_audit = {
    unsupported_ai_suggestions: unsupported,
    metric_corrections_applied: corrections,
    current_page_mismatches_removed: currentPageMismatches,
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

    const { filtered, stats } = mergeAndFilter(allRows, { primaryKeyword, pageType })
    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No keywords remain after filtering (all had volume < 30)' }, { status: 400 })
    }

    // --- Get prompt (from KV if available, else default) ---
    let prompt = DEFAULT_PROMPT
    try {
      const { Redis } = await import('@upstash/redis')
      const kv = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      })
      const saved = await kv.get<string>('keyword-strategy-prompt')
      if (saved && supportsArticleIdeaExpansions(saved)) prompt = saved
    } catch {
      // KV not configured, use default prompt
    }

    const finalPrompt = prompt
      .replace('{{PAGE_TYPE}}', pageType)
      .replace('{{PRIMARY_KEYWORD}}', primaryKeyword)
      .replace('{{TARGET_AUDIENCE}}', targetAudience)

    // --- Stage 2: OpenAI API ---
    const keywordList = formatForAI(filtered)
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
      result: applyExactMetrics(result, filtered, primaryKeyword),
      stats: { ...stats, sentToAI: filtered.length },
    })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
