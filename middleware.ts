import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect /tool
  if (pathname.startsWith('/tool')) {
    const authToken = request.cookies.get('auth_token')?.value
    const toolPassword = process.env.TOOL_PASSWORD
    if (!toolPassword || authToken !== toolPassword) {
      return NextResponse.redirect(new URL('/tool', request.url))
    }
  }

  // Protect /admin
  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get('admin_token')?.value
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword || adminToken !== adminPassword) {
      // Let the admin page handle its own login gate (shows login form)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/tool/:path*', '/admin/:path*'],
}
