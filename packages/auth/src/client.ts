'use client'

import { createBrowserClient } from '@supabase/ssr'
import { anonKeySupabase, dominioCookie, urlSupabase } from './config'

/**
 * Cliente de Supabase para el navegador. Usa la anon key y queda sujeto a
 * RLS — nunca la service role key.
 *
 * Flujo PKCE, no implicit: con PKCE el link del correo llega con un `code`
 * que se canjea por sesión en el servidor (`/auth/callback`), y las cookies
 * quedan escritas antes del primer render. Con implicit el token viene en el
 * fragmento de la URL, que no viaja al servidor, así que el middleware no ve
 * la sesión en la primera request y rebota a /login.
 *
 * `detectSessionInUrl: false` a propósito: quien canjea el código es la ruta
 * de callback, no el cliente. Si los dos lo intentan, el segundo falla porque
 * el código es de un solo uso.
 */
export function crearClienteNavegador() {
  return createBrowserClient(urlSupabase(), anonKeySupabase(), {
    cookieOptions: { domain: dominioCookie() },
    auth: { detectSessionInUrl: false, flowType: 'pkce' },
  })
}
