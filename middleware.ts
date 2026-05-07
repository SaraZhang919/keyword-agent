import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin')) {
    // Let the admin page handle its own login gate
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
