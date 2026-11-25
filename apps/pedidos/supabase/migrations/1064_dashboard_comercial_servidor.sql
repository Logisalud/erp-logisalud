-- 1064 — El tablero comercial lee desde el servidor, no desde el navegador.
--
-- El dashboard dejó de ser un HTML público servido en un proyecto de Vercel
-- aparte y pasó a ser `apps/dashboard-comercial`, detrás del login del ERP.
-- Antes consultaba Supabase desde el navegador con la clave publicable y
-- `public.dashboard_comercial()`, que exige que el correo esté en
-- `comercial.usuarios_dashboard`: una segunda lista de acceso, aparte de
-- `public.perfiles`, que había que mantener a mano y que ya se contradecía
-- con las áreas del ERP.
--
-- Ahora la app lee con service role desde su ruta `/api/datos`, después de
-- pasar por `exigirArea`. Con service role `auth.uid()` es null, así que la
-- función pública siempre levantaría 42501.
--
-- Este envoltorio es el mismo dato sin ese chequeo y **solo para
-- `service_role`**: se le revoca a anon y a authenticated, que es lo que
-- Supabase concede por defecto a todo lo que se crea en `public`. Nadie lo
-- puede llamar desde un navegador.
--
-- `public.dashboard_comercial()` queda intacta: la sigue usando cualquier
-- cuenta que esté en la lista vieja.
--
-- Este archivo documenta un cambio que se aplicó a mano contra la base (ver
-- el README de migraciones). Es re-ejecutable.
create or replace function public.dashboard_comercial_servidor()
returns jsonb
language sql
stable
security definer
set search_path to 'comercial', 'public'
as $$ select comercial.dashboard_datos() $$;

revoke all on function public.dashboard_comercial_servidor() from public, anon, authenticated;
grant execute on function public.dashboard_comercial_servidor() to service_role;
