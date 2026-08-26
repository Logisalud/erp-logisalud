/**
 * Configuración compartida de autenticación del ERP.
 *
 * El login es real desde el día uno y aplica **solo al personal
 * administrativo**. No hay modo de prueba ni variable de bypass: si una
 * pantalla no muestra datos, se revisa el perfil de la sesión, no se
 * desactiva nada.
 *
 * Los vendedores NO usan este login. Entran por su link con token rotativo
 * (`/v/[token]`), que es un mecanismo aparte y anterior a esto. Ver
 * RUTAS_VENDEDOR abajo.
 */

/** Rutas del propio flujo de autenticación. Nunca exigen sesión. */
export const RUTAS_AUTH = ['/login', '/aceptar-invitacion', '/auth/callback'] as const

/**
 * Acceso de vendedores en apps/cobranzas — **no tocar sin leer esto**.
 *
 * Los vendedores no tienen cuenta ni sesión: entran por un link con token
 * que rota (`vendedores.token_acceso`). Cada una de estas rutas resuelve el
 * vendedor por ese token y verifica `activo`, por su cuenta, sin depender de
 * Supabase Auth:
 *
 *   /v/[token]                 la vista de cobranzas (SSR, token en la ruta)
 *   /api/acceso                registra el acceso        (token en el body)
 *   /api/whatsapp-enviado      registra un envío         (token en el body)
 *   /api/v/exportar-clientes   exporta su cartera        (token en el query)
 *   /api/base-url              da la URL de producción con la que se arman
 *                              los links de vendedor
 *
 * Si el middleware las protegiera, los vendedores caerían en /login y el
 * link dejaría de servir. Quedan explícitamente fuera.
 */
export const RUTAS_VENDEDOR = [
  '/v',
  '/api/acceso',
  '/api/whatsapp-enviado',
  '/api/v',
  '/api/base-url',
] as const

/**
 * Crons de Vercel. Se autentican con CRON_SECRET en el header Authorization,
 * no con una sesión — si el middleware los redirigiera a /login, los jobs
 * diarios se romperían en silencio.
 */
export const RUTAS_CRON = ['/api/cron'] as const

export function urlSupabase(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!v) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')
  return v
}

export function anonKeySupabase(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!v) throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return v
}

/**
 * Dominio para la cookie de sesión.
 *
 * Sin esto, cada app queda con su propia sesión: las cookies no se comparten
 * entre `erp-logisalud.vercel.app` y `erp-compras.vercel.app` porque son
 * hosts distintos y `.vercel.app` está en la Public Suffix List, así que el
 * navegador no permite una cookie de dominio padre.
 *
 * Para que el login sea uno solo en todo el ERP, las apps tienen que vivir
 * bajo un dominio propio compartido (ej. cobranzas.logisalud.com y
 * compras.logisalud.com) con NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.logisalud.com
 * en las dos.
 */
export function dominioCookie(): string | undefined {
  return process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN || undefined
}

/** ¿Esta ruta se sirve sin sesión iniciada? */
export function esRutaPublica(pathname: string, extras: readonly string[] = []): boolean {
  const publicas = [...RUTAS_AUTH, ...RUTAS_CRON, ...extras]
  return publicas.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}
