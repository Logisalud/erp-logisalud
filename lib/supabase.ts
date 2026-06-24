import { createClient } from '@supabase/supabase-js';

// Fuerza cache: 'no-store' en cada HTTP call de supabase-js.
// No confiar en que force-dynamic lo propague — hay casos donde no llega
// a librerías de terceros que capturan fetch antes del patch de Next.js.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

export function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: noStoreFetch } },
  );
}

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { global: { fetch: noStoreFetch } },
  );
}
