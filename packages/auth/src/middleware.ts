import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { anonKeySupabase, dominioCookie, esRutaPublica, urlSupabase } from './config'

type CookieNueva = { name: string; value: string; options?: CookieOptions }

export type OpcionesSesion = {
  /**
   * Rutas de esta app que se sirven sin sesión, además de las del flujo de
   * auth y los crons.
   *
   * En apps/cobranzas hay que pasar RUTAS_VENDEDOR: los vendedores entran por
   * un link con token, no tienen cuenta, y sin esta exclusión caerían en
   * /login y el link dejaría de funcionar.
   */
  rutasPublicas?: readonly string[]
}

/**
 * Middleware de sesión compartido por las apps del ERP.
 *
 * Login real: sin sesión, a /login. No hay modo de prueba ni bypass.
 *
 * Aplica al personal administrativo. Los vendedores no pasan por acá — sus
 * rutas se excluyen vía `rutasPublicas`.
 */
export async function middlewareSesion(request: NextRequest, opciones: OpcionesSesion = {}) {
  const { pathname } = request.nextUrl

  // Se resuelve antes de hablar con Supabase: una ruta de vendedor no debe
  // pagar la latencia de validar una sesión que no existe, y así no hay forma
  // de que un error de red la termine redirigiendo a /login.
  if (esRutaPublica(pathname, opciones.rutasPublicas)) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(urlSupabase(), anonKeySupabase(), {
    cookieOptions: { domain: dominioCookie() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (nuevas: CookieNueva[]) => {
        nuevas.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        nuevas.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser() valida el token contra Supabase; no confía en la cookie sola.
  // Como efecto lateral renueva la sesión y escribe las cookies nuevas.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) return response

  const destino = request.nextUrl.clone()
  destino.pathname = '/login'
  destino.search = ''
  // Para volver a donde quería entrar, una vez que inicie sesión.
  destino.searchParams.set('volver_a', pathname + request.nextUrl.search)
  return NextResponse.redirect(destino)
}

/**
 * Matcher recomendado, para copiar tal cual en el middleware.ts de cada app:
 *
 *   export const config = {
 *     matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
 *   }
 *
 * Tiene que estar escrito como literal en el archivo de la app: Next lee
 * `config.matcher` en tiempo de build y no resuelve una constante importada
 * (falla con "Unknown identifier" y se cae al matcher por defecto, que corre
 * el middleware también en los assets estáticos).
 *
 * Las rutas públicas NO se excluyen acá sino en `rutasPublicas`: es una lista
 * legible y con comentarios, en vez de un lookahead cada vez más largo.
 */
