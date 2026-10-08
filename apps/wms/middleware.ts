import { NextResponse, type NextRequest } from 'next/server'
import { middlewareSesion } from '@logisalud/auth/middleware'
import { modoDemoActivo } from '@/lib/demo'
import { COOKIE_ROL_DEMO } from '@/lib/sesion-demo'

export async function middleware(request: NextRequest) {
  if (modoDemoActivo()) {
    // En demostración no hay Supabase: la "sesión" es una cookie con el rol que se prueba.
    const { pathname } = request.nextUrl // sin el basePath
    if (!request.cookies.get(COOKIE_ROL_DEMO)?.value && pathname !== '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
  return middlewareSesion(request, { rutasPublicas: ['/sin-acceso'] })
}

// Matcher literal (Next lo lee en build). Los paths se escriben SIN basePath.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
