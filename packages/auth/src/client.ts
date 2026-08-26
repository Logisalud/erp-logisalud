'use client'

import { createBrowserClient } from '@supabase/ssr'
import { anonKeySupabase, dominioCookie, urlSupabase } from './config'

/**
 * Cliente de Supabase para el navegador. Usa la anon key y queda sujeto a
 * RLS — nunca la service role key.
 *
 * `detectSessionInUrl` es lo que hace que el link de invitación funcione:
 * Supabase manda el token en el fragmento (#access_token=...&type=invite) y
 * supabase-js lo levanta solo al montar la pantalla.
 */
export function crearClienteNavegador() {
  return createBrowserClient(urlSupabase(), anonKeySupabase(), {
    cookieOptions: { domain: dominioCookie() },
    auth: { detectSessionInUrl: true, flowType: 'implicit' },
  })
}
