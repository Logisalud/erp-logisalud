import { middlewareSesion } from '@logisalud/auth/middleware'
import type { NextRequest } from 'next/server'

/**
 * Todo el tablero pide sesión.
 *
 * Antes vivía en una URL pública de Vercel sin contraseña: cualquiera con
 * el enlace veía la venta y la clasificación de clientes. Ahora además
 * muestra cartera y morosidad, así que entra por el mismo login que el
 * resto del ERP.
 */
export async function middleware(request: NextRequest) {
  return middlewareSesion(request)
}

// El matcher va como literal: Next lo lee en build y no resuelve una
// constante importada. Mismo criterio que apps/cobranzas.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
