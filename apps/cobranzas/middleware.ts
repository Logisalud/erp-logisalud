import { RUTAS_VENDEDOR } from '@logisalud/auth/config'
import { middlewareSesion } from '@logisalud/auth/middleware'
import type { NextRequest } from 'next/server'

/**
 * Login del personal administrativo.
 *
 * RUTAS_VENDEDOR queda fuera a propósito: los vendedores entran por su link
 * con token rotativo (`/v/[token]`), sin cuenta ni sesión. Ese mecanismo es
 * anterior a este login y tiene que seguir funcionando igual — si el
 * middleware lo protegiera, los links dejarían de servir.
 */
export async function middleware(request: NextRequest) {
  return middlewareSesion(request, { rutasPublicas: RUTAS_VENDEDOR })
}

// El matcher va escrito como literal a propósito: Next lo lee en build y no
// resuelve una constante importada. Ver packages/auth/src/middleware.ts.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
