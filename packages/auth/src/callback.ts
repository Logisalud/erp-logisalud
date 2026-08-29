import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { anonKeySupabase, dominioCookie, urlSupabase } from './config'

type CookieNueva = { name: string; value: string; options?: CookieOptions }

/**
 * Canje del código del link del correo por una sesión.
 *
 * El link de magic link llega a `/auth/callback?code=...`. Acá se canjea ese
 * código y se escriben las cookies de sesión, antes de redirigir. Tiene que
 * pasar en el servidor: si lo hiciera el cliente, la primera request ya
 * habría pasado por el middleware sin sesión y habría rebotado a /login.
 *
 * Se monta en cada app como:
 *
 *   // app/auth/callback/route.ts
 *   export { GET } from '@logisalud/auth/callback'
 */

/**
 * Arma un redirect a una ruta interna (con o sin querystring) que respeta el
 * basePath de la app — clonar `request.nextUrl` y mutar pathname/search es
 * lo único que lo antepone solo (confirmado: es el mismo patrón que ya usa
 * middleware.ts para el redirect a /login, y ese sí sale con basePath).
 * Un `NextResponse.redirect(`${origin}${ruta}`)` con string armado a mano
 * NO antepone basePath — mandaba a la persona a la raíz del dominio
 * (Cobranzas) en vez de /compras/..., un 404 real reportado en producción.
 */
function redirectInterno(request: NextRequest, rutaConQuery: string) {
  const [ruta, query = ''] = rutaConQuery.split('?')
  const destino = request.nextUrl.clone()
  destino.pathname = ruta
  destino.search = query
  return NextResponse.redirect(destino)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const volverA = searchParams.get('volver_a')

  // Solo rutas internas: un link armado a mano no puede usar el callback
  // como redirección a un sitio externo.
  const destino =
    volverA?.startsWith('/') && !volverA.startsWith('//') ? volverA : '/'

  const errorDescripcion = searchParams.get('error_description')
  if (errorDescripcion) {
    return redirectInterno(request, `/login?error=${encodeURIComponent(errorDescripcion)}`)
  }

  if (!code) {
    return redirectInterno(
      request,
      `/login?error=${encodeURIComponent('El link no trae código. Abrilo tal como llegó en el correo.')}`
    )
  }

  let response = redirectInterno(request, destino)

  const supabase = createServerClient(urlSupabase(), anonKeySupabase(), {
    cookieOptions: { domain: dominioCookie() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (nuevas: CookieNueva[]) => {
        nuevas.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // El caso típico: el link se pidió en un navegador y se abrió en otro.
    // PKCE guarda el verificador en el navegador que lo pidió, así que el
    // canje falla. La salida es el código de 6 dígitos, y el mensaje lo dice.
    return redirectInterno(
      request,
      `/login?error=${encodeURIComponent(
        'No se pudo validar el link. Si lo abriste en otro dispositivo, vuelve a pedirlo y usa el código de 6 dígitos del correo.'
      )}`
    )
  }

  return response
}
