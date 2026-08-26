import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieNueva = { name: string; value: string; options?: CookieOptions }
import { anonKeySupabase, dominioCookie, esRutaPublica, requiereLogin, urlSupabase } from './config'

/**
 * Middleware de sesión compartido por todas las apps del ERP.
 *
 * Hace dos cosas según NEXT_PUBLIC_REQUIRE_LOGIN:
 *
 *   'true'  -> exige sesión real. Sin sesión, redirige a /login.
 *   'false' -> no redirige a nadie. Si no hay sesión, inicia una en el
 *              servidor con la cuenta designada en TEST_MODE_USER_EMAIL,
 *              para que las políticas RLS se cumplan igual que si esa
 *              persona hubiera entrado a mano.
 *
 * Las políticas RLS están activas en los dos modos. Lo único que cambia es
 * de quién es la sesión que las satisface.
 *
 * Las credenciales de prueba se leen sin el prefijo NEXT_PUBLIC_, así que
 * viven solo en el servidor y nunca llegan al navegador.
 */
export async function middlewareSesion(request: NextRequest) {
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

  // getUser() valida el token contra Supabase, no confía en la cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) return response

  if (!requiereLogin()) {
    // Modo de prueba: nadie inicia sesión a mano, el servidor lo hace.
    const email = process.env.TEST_MODE_USER_EMAIL
    const password = process.env.TEST_MODE_USER_PASSWORD

    if (!email || !password) {
      // Sin credenciales no hay sesión, así que RLS va a negar todo. Se deja
      // pasar igual: la app carga y muestra vacío en vez de romperse, y el
      // aviso queda en los logs del servidor.
      console.warn(
        '[auth] NEXT_PUBLIC_REQUIRE_LOGIN=false pero faltan TEST_MODE_USER_EMAIL / ' +
          'TEST_MODE_USER_PASSWORD. Sin sesión, las políticas RLS van a negar todo acceso.'
      )
      return response
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.warn(`[auth] No se pudo iniciar la sesión de prueba: ${error.message}`)
    }
    return response
  }

  // Login exigido y no hay sesión.
  if (esRutaPublica(request.nextUrl.pathname)) return response

  const destino = request.nextUrl.clone()
  destino.pathname = '/login'
  // Para volver a donde quería entrar después de loguearse.
  destino.searchParams.set('volver_a', request.nextUrl.pathname + request.nextUrl.search)
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
 * Excluye assets e imágenes para no pagar la validación de sesión por archivo.
 */
