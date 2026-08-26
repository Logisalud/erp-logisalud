import { middlewareSesion } from '@logisalud/auth/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return middlewareSesion(request)
}

// El matcher va escrito como literal a propósito: Next lo lee en build y no
// resuelve una constante importada. Ver packages/auth/src/middleware.ts.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
