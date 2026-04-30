import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { DEFAULT_PROMPT } from '@/lib/prompt'

function getKv() {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

export async function GET() {
  try {
    const kv = getKv()
    const saved = await kv.get<string>('keyword-strategy-prompt')
    return NextResponse.json({ prompt: saved ?? DEFAULT_PROMPT, isDefault: !saved })
  } catch {
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true, kvUnavailable: true })
  }
}

export async function POST(request: NextRequest) {
  const { prompt } = await request.json()
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 })
  }
  try {
    const kv = getKv()
    await kv.set('keyword-strategy-prompt', prompt)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Vercel KV is not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN to your environment variables.' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const kv = getKv()
    await kv.del('keyword-strategy-prompt')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'KV not configured' }, { status: 500 })
  }
}
