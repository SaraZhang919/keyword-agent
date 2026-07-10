import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD
  const isAdmin = !!expected && request.cookies.get('admin_token')?.value === expected
  return NextResponse.json({ isAdmin })
}
