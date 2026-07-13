import { NextRequest, NextResponse } from 'next/server'
import { fileToRows, parseRows, pasteToRows, mergeAndFilter, formatForAI } from '@/lib/prefilter'
import { DEFAULT_PROMPT, MODEL } from '@/lib/prompt'

function supportsArticleIdeaExpansions(prompt: string): boolean {
  return (
    prompt.includes('{{TARGET_AUDIENCE}}') &&
    prompt.includes('article_idea_expansions') &&
    prompt.includes('source, keyword, volume, kd, cpc')
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
  keyword: string
  volume: number
  kd?: number
  cpc?: number
  source: string
}

function normalizeKeyword(keyword: unknown): string {
  return String(keyword ?? '').trim().toLowerCase()
}

function applyExactMetrics(result: unknown, rows: MetricRow[]): unknown {
  if (!result || typeof result !== 'object') return result

  const byKeyword = new Map(rows.map(row => [normalizeKeyword(row.keyword), row]))
  const data = result as Record<string, any>

  function patchKeywordLike(item: unknown) {
    if (!item || typeof item !== 'object') return
    const target = item as Record<string, any>
    const row = byKeyword.get(normalizeKeyword(target.keyword))
    if (!row) return

    target.keyword = row.keyword
    target.volume = row.volume
    if (row.kd !== undefined) target.kd = row.kd
    if (row.cpc !== undefined) target.cpc = row.cpc
    target.source = row.source
  }

  patchKeywordLike(data.primary_keyword)
  for (const key of ['supporting_keywords', 'longtail_keywords', 'competitor_insights']) {
    if (Array.isArray(data[key])) data[key].forEach(patchKeywordLike)
  }

  if (Array.isArray(data.new_page_opportunities)) {
    for (const item of data.new_page_opportunities) {
      if (!item || typeof item !== 'object') continue
      const target = item as Record<string, any>
      const row = byKeyword.get(normalizeKeyword(target.primary_keyword))
      if (!row) continue
      target.primary_keyword = row.keyword
      target.primary_keyword_volume = row.volume
      if (row.kd !== undefined) target.primary_keyword_kd = row.kd
    }
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
      const label = (formData.get(labelKey) as string) || key.replace('_file', '').replace(/_/g, ' ')

      const { rows: rawRows, error: fileError } = await fileToRows(file)
      if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

      const { rows, error: parseError } = parseRows(rawRows, label)
      if (parseError) return NextResponse.json({ error: parseError }, { status: 400 })

      allRows.push(...rows)
    }

    for (const [key, value] of pasteEntries) {
      const labelKey = key.replace('_paste', '_label')
      const label = (formData.get(labelKey) as string) || key.replace('_paste', '').replace(/_/g, ' ')
      const { rows, error: pasteError } = pasteToRows(value as string, label)
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
      result: applyExactMetrics(result, filtered),
      stats: { ...stats, sentToAI: filtered.length },
    })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
