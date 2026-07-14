import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_PROMPT } from '@/lib/prompt'

function isAdminAuthed(request: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD
  return !!expected && request.cookies.get('admin_token')?.value === expected
}

function supportsArticleIdeaExpansions(prompt: string): boolean {
  return (
    prompt.includes('{{TARGET_AUDIENCE}}') &&
    prompt.includes('article_idea_expansions') &&
    prompt.includes('keyword_id') &&
    prompt.includes('source_role') &&
    prompt.includes('competition') &&
    prompt.includes('serp_features') &&
    prompt.includes('trend')
  )
}

async function getKV() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 })
  }

  try {
    const kv = await getKV()
    const saved = await kv.get<string>('keyword-strategy-prompt')
    if (saved && supportsArticleIdeaExpansions(saved)) {
      return NextResponse.json({ prompt: saved, isDefault: false })
    }
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true })
  } catch {
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true, kvUnavailable: true })
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 })
  }

  const { prompt } = await request.json()
  if (
    !prompt?.includes('{{PAGE_TYPE}}') ||
    !prompt?.includes('{{PRIMARY_KEYWORD}}') ||
    !supportsArticleIdeaExpansions(prompt)
  ) {
    return NextResponse.json(
      { error: 'Prompt must contain {{PAGE_TYPE}}, {{PRIMARY_KEYWORD}}, {{TARGET_AUDIENCE}}, article_idea_expansions, keyword_id, source_role, competition, serp_features, and trend rules.' },
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

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 })
  }

  try {
    const kv = await getKV()
    await kv.del('keyword-strategy-prompt')
  } catch { /* ignore */ }
  return NextResponse.json({ success: true })
}
