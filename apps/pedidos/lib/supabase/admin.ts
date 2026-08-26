import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

/**
 * Cliente con service role key. Nunca importar desde código que se
 * ejecute en el navegador — ver docs/security.md.
 */
export function createAdminClient() {
  return createSupabaseClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      db: { schema: "pedidos" },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
