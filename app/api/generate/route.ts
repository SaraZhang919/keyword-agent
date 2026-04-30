import { NextRequest, NextResponse } from 'next/server'
import { parseCSV, mergeAndFilter, formatForAI } from '@/lib/prefilter'
import { DEFAULT_PROMPT, MODEL } from '@/lib/prompt'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const topicFile      = formData.get('topicFile') as File | null
    const relatedFile    = formData.get('relatedFile') as File | null
    const competitorFile = formData.get('competitorFile') as File | null
    const pageType       = formData.get('pageType') as string
    const primaryKeyword = formData.get('primaryKeyword') as string

    if (!topicFile || !pageType || !primaryKeyword) {
      return NextResponse.json({ error: 'Topic keyword file, page type, and primary keyword are required.' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    // --- Parse all uploaded files ---
    let allRows = []

    const topicResult = parseCSV(await topicFile.text(), 'topic')
    if (topicResult.error) return NextResponse.json({ error: topicResult.error }, { status: 400 })
    allRows.push(...topicResult.rows)

    if (relatedFile) {
      const relatedResult = parseCSV(await relatedFile.text(), 'related')
      if (relatedResult.error) return NextResponse.json({ error: relatedResult.error }, { status: 400 })
      allRows.push(...relatedResult.rows)
    }

    if (competitorFile) {
      const competitorResult = parseCSV(await competitorFile.text(), 'competitor')
      if (competitorResult.error) return NextResponse.json({ error: competitorResult.error }, { status: 400 })
      allRows.push(...competitorResult.rows)
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: 'No keywords found in uploaded files.' }, { status: 400 })
    }

    // --- Merge + pre-filter ---
    const { filtered, stats } = mergeAndFilter(allRows)
    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No keywords remain after filtering (all had volume < 30).' }, { status: 400 })
    }

    // --- Get prompt ---
    let prompt = DEFAULT_PROMPT
    try {
      const { kv } = await import('@vercel/kv')
      const saved = await kv.get<string>('keyword-strategy-prompt')
      if (saved) prompt = saved
    } catch {
      // KV not configured, use default
    }

    const finalPrompt = prompt
      .replace('{{PAGE_TYPE}}', pageType)
      .replace('{{PRIMARY_KEYWORD}}', primaryKeyword)

    // --- OpenAI API call ---
    const keywordList = formatForAI(filtered)

    const sourceBreakdown = [
      `${stats.topic} topic`,
      stats.related > 0 ? `${stats.related} related` : null,
      stats.competitor > 0 ? `${stats.competitor} competitor` : null,
    ].filter(Boolean).join(' + ')

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: finalPrompt },
          {
            role: 'user',
            content: `Keyword list: ${filtered.length} keywords (${sourceBreakdown}, after filtering ${stats.total} total, ${stats.brandTerms} brand terms included for competitor_insights):\n\n${keywordList}`
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
    const rawText = openaiData.choices?.[0]?.message?.content ?? ''
    const jsonText = rawText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(jsonText)

    return NextResponse.json({ result, stats: { ...stats, sentToAI: filtered.length } })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
