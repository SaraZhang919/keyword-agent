import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: login, admin, auth API, prompt API, static files
  if (
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/prompt') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Everything else requires tool password cookie
  const authToken = request.cookies.get('auth_token')?.value
  const validToken = process.env.TOOL_PASSWORD
  if (authToken !== validToken) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
