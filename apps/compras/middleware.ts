import { middlewareSesion } from '@logisalud/auth/middleware'
import type { NextRequest } from 'next/server'

/**
 * Login del personal administrativo. Acá no hay rutas de vendedor que excluir:
 * los vendedores solo entran a apps/cobranzas.
 */
export async function middleware(request: NextRequest) {
  return middlewareSesion(request)
}

// El matcher va escrito como literal a propósito: Next lo lee en build y no
// resuelve una constante importada. Ver packages/auth/src/middleware.ts.
//
// Los paths acá se escriben SIN el basePath: Next lo aplica solo.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
