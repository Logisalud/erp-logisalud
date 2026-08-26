/**
 * Configuración compartida de autenticación del ERP.
 *
 * El interruptor central es NEXT_PUBLIC_REQUIRE_LOGIN. Ver la sección
 * "Autenticación" del README de la raíz antes de cambiarlo.
 */

/** Rutas que nunca exigen sesión, incluso con el login activado. */
export const RUTAS_PUBLICAS = ['/login', '/aceptar-invitacion', '/auth/callback'] as const

/**
 * ¿La app exige que cada persona inicie sesión con su propia cuenta?
 *
 * 'false' (el valor por defecto y el estado actual del proyecto) = modo de
 * prueba: la app se abre sin pedir nada y el servidor usa la cuenta
 * designada en TEST_MODE_USER_EMAIL para satisfacer las políticas RLS.
 *
 * Las políticas RLS están activas en los dos modos, siempre. Lo único que
 * cambia es de quién es la sesión que las satisface.
 */
export function requiereLogin(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_LOGIN === 'true'
}

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}

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
 * Para que el login sea uno solo en todo el ERP hace falta que las apps
 * vivan bajo un dominio propio compartido (ej. cobranzas.logisalud.com y
 * compras.logisalud.com) y setear NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.logisalud.com
 * en las dos.
 */
export function dominioCookie(): string | undefined {
  return process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN || undefined
}
