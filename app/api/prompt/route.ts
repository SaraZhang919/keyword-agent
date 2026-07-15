import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_BRAND_SCOPE, DEFAULT_PROMPT, isCompatiblePrompt } from '@/lib/prompt'

function isAdminAuthed(request: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD
  return !!expected && request.cookies.get('admin_token')?.value === expected
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
    const [saved, savedBrandScope] = await Promise.all([
      kv.get<string>('keyword-strategy-prompt'),
      kv.get<string>('keyword-strategy-brand-scope'),
    ])
    if (saved && isCompatiblePrompt(saved)) {
      return NextResponse.json({ prompt: saved, brandScope: savedBrandScope?.trim() || DEFAULT_BRAND_SCOPE, isDefault: false })
    }
    return NextResponse.json({ prompt: DEFAULT_PROMPT, brandScope: savedBrandScope?.trim() || DEFAULT_BRAND_SCOPE, isDefault: true })
  } catch {
    return NextResponse.json({ prompt: DEFAULT_PROMPT, brandScope: DEFAULT_BRAND_SCOPE, isDefault: true, kvUnavailable: true })
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 })
  }

  const { prompt, brandScope } = await request.json()
  if (
    !prompt?.includes('{{PAGE_TYPE}}') ||
    !prompt?.includes('{{PRIMARY_KEYWORD}}') ||
    !isCompatiblePrompt(prompt)
  ) {
    return NextResponse.json(
      { error: 'Prompt must contain the required page, audience, metric-safety, current-page boundary, and page-opportunity routing rules.' },
      { status: 400 }
    )
  }
  if (typeof brandScope !== 'string' || !brandScope.trim()) {
    return NextResponse.json({ error: 'Brand Strategy Scope is required.' }, { status: 400 })
  }
  try {
    const kv = await getKV()
    await Promise.all([
      kv.set('keyword-strategy-prompt', prompt),
      kv.set('keyword-strategy-brand-scope', brandScope.trim()),
    ])
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
    await Promise.all([
      kv.del('keyword-strategy-prompt'),
      kv.del('keyword-strategy-brand-scope'),
    ])
  } catch { /* ignore */ }
  return NextResponse.json({ success: true })
}
