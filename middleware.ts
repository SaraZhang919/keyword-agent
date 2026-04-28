import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow: login page, auth API, static files
  if (
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Check tool auth
  const authToken = request.cookies.get('auth_token')?.value
  const validToken = process.env.TOOL_PASSWORD
  if (authToken !== validToken) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Admin routes need additional admin auth
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/prompt')) {
    const adminToken = request.cookies.get('admin_token')?.value
    const validAdmin = process.env.ADMIN_PASSWORD
    if (adminToken !== validAdmin) {
      return NextResponse.redirect(new URL('/tool', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
