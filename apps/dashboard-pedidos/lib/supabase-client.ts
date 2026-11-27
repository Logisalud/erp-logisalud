import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase del lado del navegador para suscripciones WebSocket Realtime.
 * Las credenciales provienen estrictamente de las variables de entorno (.env.local).
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no configuradas en .env.local"
    );
  }

  return createClient(url, anonKey, {
    db: { schema: "pedidos" },
  });
}
