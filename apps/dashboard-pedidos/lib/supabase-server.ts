import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase de servidor con privilegios `service_role`.
 * Se utiliza exclusivamente en Server Components, Route Handlers y Server Actions
 * para consultar de forma segura y autorizada los pedidos sin bloqueos de RLS.
 * Las credenciales provienen estrictamente de las variables de entorno (.env.local).
 */
export function getSupabaseServerAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas en .env.local"
    );
  }

  return createClient(url, serviceKey, {
    db: { schema: "pedidos" },
    auth: { persistSession: false },
  });
}
