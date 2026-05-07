import { NextRequest, NextResponse } from 'next/server'
import { parseCSV, preFilter, formatForAI } from '@/lib/prefilter'
import { DEFAULT_PROMPT, MODEL } from '@/lib/prompt'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const pageType = formData.get('pageType') as string
    const primaryKeyword = formData.get('primaryKeyword') as string

    if (!file || !pageType || !primaryKeyword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
    }

    // --- Stage 1: Parse + Pre-filter ---
    const csvText = await file.text()
    const { rows, error: parseError } = parseCSV(csvText)
    if (parseError) return NextResponse.json({ error: parseError }, { status: 400 })
    if (rows.length === 0) return NextResponse.json({ error: 'No keywords found in CSV' }, { status: 400 })

    const { filtered, stats } = preFilter(rows)
    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No keywords remain after filtering (all had volume < 30)' }, { status: 400 })
    }

    // --- Get prompt (from KV if available, else default) ---
    let prompt = DEFAULT_PROMPT
    try {
      const { kv } = await import('@vercel/kv')
      const saved = await kv.get<string>('keyword-strategy-prompt')
      if (saved) prompt = saved
    } catch {
      // KV not configured, use default prompt
    }

    const finalPrompt = prompt
      .replace('{{PAGE_TYPE}}', pageType)
      .replace('{{PRIMARY_KEYWORD}}', primaryKeyword)

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
        max_tokens: 4000,
        response_format: { type: 'json_object' }, // enforces JSON output — no markdown fences
        messages: [
          {
            role: 'system',
            content: finalPrompt,
          },
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
    const rawText = openaiData.choices?.[0]?.message?.content ?? ''

    // Strip any accidental markdown fences (safety net)
    const jsonText = rawText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(jsonText)

    return NextResponse.json({ result, stats: { ...stats, sentToAI: filtered.length } })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
