import { NextRequest, NextResponse } from 'next/server'
import { fileToRows, parseRows, mergeAndFilter, formatForAI } from '@/lib/prefilter'
import { DEFAULT_PROMPT, MODEL } from '@/lib/prompt'

export const maxDuration = 60 // Vercel function timeout

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const pageType       = formData.get('pageType') as string
    const primaryKeyword = formData.get('primaryKeyword') as string

    if (!pageType || !primaryKeyword) {
      return NextResponse.json(
        { error: 'Page type and primary keyword are required.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured. Set ANTHROPIC_API_KEY in your environment.' },
        { status: 500 }
      )
    }

    // ── Collect up to 5 labeled file sections ──────────────────────────────
    // Each section is sent as:  file_N (File) + label_N (string)   where N = 0..4
    const MAX_SECTIONS = 5
    const allRows: ReturnType<typeof parseRows>['rows'] = []
    let totalFilesFound = 0

    for (let i = 0; i < MAX_SECTIONS; i++) {
      const file  = formData.get(`file_${i}`) as File | null
      const label = (formData.get(`label_${i}`) as string | null)?.trim() || `Section ${i + 1}`

      if (!file) continue
      totalFilesFound++

      const raw = await fileToRows(file)
      if (raw.error) {
        return NextResponse.json({ error: raw.error }, { status: 400 })
      }

      const parsed = parseRows(raw.rows, label)
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }

      allRows.push(...parsed.rows)
    }

    if (totalFilesFound === 0) {
      return NextResponse.json(
        { error: 'Please upload at least one keyword file.' },
        { status: 400 }
      )
    }

    if (allRows.length === 0) {
      return NextResponse.json(
        { error: 'No keywords found in uploaded files. Check column names (Keyword, Volume).' },
        { status: 400 }
      )
    }

    // ── Merge, dedup, filter ────────────────────────────────────────────────
    const { filtered, stats } = mergeAndFilter(allRows)

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: `No keywords remain after filtering (minimum volume: 30). Try uploading files with higher-volume keywords.` },
        { status: 400 }
      )
    }

    // ── Get prompt (from KV if available, else default) ────────────────────
    let systemPrompt = DEFAULT_PROMPT
    try {
      const { Redis } = await import('@upstash/redis')
      const kv = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      })
      const saved = await kv.get<string>('keyword-strategy-prompt')
      if (saved) systemPrompt = saved
    } catch { /* KV not configured — use default */ }

    const finalPrompt = systemPrompt
      .replace('{{PAGE_TYPE}}', pageType)
      .replace('{{PRIMARY_KEYWORD}}', primaryKeyword)

    // ── Build source breakdown for context ─────────────────────────────────
    const keywordList = formatForAI(filtered)
    const sourceBreakdown = Object.entries(stats.bySource)
      .map(([label, count]) => `${count} from "${label}"`)
      .join(', ')

    // ── Call AI API ────────────────────────────────────────────────────────
    const useAnthropic = !!process.env.ANTHROPIC_API_KEY

    let result: unknown

    if (useAnthropic) {
      // Anthropic Claude
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          system: finalPrompt,
          messages: [
            {
              role: 'user',
              content: `Keyword list: ${filtered.length} keywords (${sourceBreakdown}, filtered from ${stats.total} total):\n\n${keywordList}`,
            },
          ],
        }),
      })

      if (!anthropicRes.ok) {
        const err = await anthropicRes.text()
        console.error('Anthropic error:', err)
        return NextResponse.json({ error: 'AI API call failed. Check server logs.' }, { status: 500 })
      }

      const anthropicData = await anthropicRes.json()
      const rawText = anthropicData.content?.[0]?.text ?? ''
      const jsonText = rawText.replace(/```json|```/g, '').trim()
      result = JSON.parse(jsonText)

    } else {
      // OpenAI fallback
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
              content: `Keyword list: ${filtered.length} keywords (${sourceBreakdown}, filtered from ${stats.total} total):\n\n${keywordList}`,
            },
          ],
        }),
      })

      if (!openaiRes.ok) {
        const err = await openaiRes.text()
        console.error('OpenAI error:', err)
        return NextResponse.json({ error: 'AI API call failed. Check server logs.' }, { status: 500 })
      }

      const openaiData = await openaiRes.json()
      const rawText = openaiData.choices?.[0]?.message?.content ?? ''
      const jsonText = rawText.replace(/```json|```/g, '').trim()
      result = JSON.parse(jsonText)
    }

    return NextResponse.json({ result, stats })

  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Unexpected error. Check server logs.' }, { status: 500 })
  }
}
