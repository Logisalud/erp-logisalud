import { RUTAS_VENDEDOR } from '@logisalud/auth/config'
import { middlewareSesion } from '@logisalud/auth/middleware'
import type { NextRequest } from 'next/server'

/**
 * Login del personal administrativo.
 *
 * Dos exclusiones, por razones distintas:
 *
 * - RUTAS_VENDEDOR: los vendedores entran por su link con token rotativo
 *   (`/v/[token]`), sin cuenta ni sesión. Ese mecanismo es anterior a este
 *   login y tiene que seguir funcionando igual — si el middleware lo
 *   protegiera, los links dejarían de servir.
 *
 * - '/compras': esas rutas se reenvían por rewrite a apps/compras, que corre
 *   su propio middleware de sesión. Sin esta exclusión, `/compras/login`
 *   caería en el `/login` de cobranzas y la pantalla de login de compras
 *   quedaría inalcanzable. El middleware de Next corre ANTES de los rewrites
 *   de next.config, así que sin esto lo intercepta acá.
 */
export async function middleware(request: NextRequest) {
  return middlewareSesion(request, { rutasPublicas: [...RUTAS_VENDEDOR, '/compras'] })
}

// El matcher va escrito como literal a propósito: Next lo lee en build y no
// resuelve una constante importada. Ver packages/auth/src/middleware.ts.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
