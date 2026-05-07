import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_PROMPT } from '@/lib/prompt'

async function getKV() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

export async function GET() {
  try {
    const kv = await getKV()
    const saved = await kv.get<string>('keyword-strategy-prompt')
    if (saved) return NextResponse.json({ prompt: saved, isDefault: false })
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true })
  } catch {
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true, kvUnavailable: true })
  }
}

export async function POST(request: NextRequest) {
  const { prompt } = await request.json()
  if (!prompt?.includes('{{PAGE_TYPE}}') || !prompt?.includes('{{PRIMARY_KEYWORD}}')) {
    return NextResponse.json(
      { error: 'Prompt must contain {{PAGE_TYPE}} and {{PRIMARY_KEYWORD}} placeholders.' },
      { status: 400 }
    )
  }
  try {
    const kv = await getKV()
    await kv.set('keyword-strategy-prompt', prompt)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'KV not configured — prompt not saved.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const kv = await getKV()
    await kv.del('keyword-strategy-prompt')
  } catch { /* ignore */ }
  return NextResponse.json({ success: true })
}
