import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password, type } = await request.json()

  const isAdmin = type === 'admin'
  const expected = isAdmin ? process.env.ADMIN_PASSWORD : process.env.TOOL_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  const cookieName = isAdmin ? 'admin_token' : 'auth_token'

  response.cookies.set(cookieName, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: isAdmin ? 60 * 60 * 4 : 60 * 60 * 24, // 4h admin, 24h tool
  })

  return response
}
