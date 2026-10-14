-- Personas sin usuario: a quién se le puede armar un anticipo (y pagarle)
-- sin que tenga login en el ERP. (Sebas, 2026-10-14.)
--
-- El caso: los viáticos de los vendedores. Un anticipo "para otra persona"
-- solo podía asignarse a un usuario (`asignado_a` → auth.users), y el pago
-- iba a la cuenta que esa persona matriculó con su login. Los vendedores no
-- tienen login — entran a Cobranzas por su link /v/, un sistema aparte que
-- este módulo NO lee ni toca —, así que no había forma de asignárselos.
--
-- Decisión de Sebas: una lista propia, mantenida por Contabilidad, con
-- nombre, DNI y cuenta bancaria. No se les crea usuario (no necesitan
-- entrar a Compras y Pagos) ni se leen de public.vendedores (Cobranzas).
--
-- Re-ejecutable.

-- ===================================================================
-- 1. La lista
-- ===================================================================
create table if not exists public.personas_sin_usuario (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (nullif(btrim(nombre), '') is not null),
  dni text check (dni is null or dni ~ '^\d{8}$'),
  -- Nunca se borra (una obligación ya pagada la referencia): se desactiva y
  -- deja de ofrecerse en el buscador.
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create unique index if not exists personas_sin_usuario_nombre_unico
  on public.personas_sin_usuario (lower(btrim(nombre)));

alter table public.personas_sin_usuario enable row level security;

-- Lectura para cualquier usuario: quien arma el anticipo tiene que poder
-- elegirla, y el jefe que lo revisa tiene que ver "Para: <nombre>".
drop policy if exists personas_sin_usuario_lectura on public.personas_sin_usuario;
create policy personas_sin_usuario_lectura on public.personas_sin_usuario
  for select to authenticated using (true);

-- Escritura: Contabilidad (y admin), que es quien mantiene la lista.
drop policy if exists personas_sin_usuario_escritura on public.personas_sin_usuario;
create policy personas_sin_usuario_escritura on public.personas_sin_usuario
  for all to authenticated
  using (public.es_admin() or public.area_en('contabilidad'))
  with check (public.es_admin() or public.area_en('contabilidad'));

-- Sin GRANT explícito: los privilegios por defecto de Supabase en `public`
-- ya se los dan a `authenticated` al crear la tabla (verificado con
-- has_table_privilege). Lo que manda es la RLS de arriba; `anon` no tiene
-- ninguna policy, así que no ve nada.

comment on table public.personas_sin_usuario is
  'A quién se le arma un anticipo y se le paga sin que tenga login (ej. vendedores). La mantiene Contabilidad. Migración 0081.';

-- ===================================================================
-- 2. Su cuenta bancaria, en la MISMA tabla que la de los empleados
-- ===================================================================
-- Así todo el circuito de pago (propuesta, elegir la cuenta, el aviso de
-- "falta cuenta", pagos.cuenta_bancaria_empleado_id) funciona sin cambios:
-- una cuenta es de un usuario O de una persona sin usuario, nunca de los dos.
alter table public.empleado_cuentas_bancarias
  alter column usuario_id drop not null;
alter table public.empleado_cuentas_bancarias
  add column if not exists persona_sin_usuario_id uuid
    references public.personas_sin_usuario(id) on delete cascade;

-- Todas las filas existentes tienen usuario_id: el CHECK valida sin
-- normalizar nada antes.
alter table public.empleado_cuentas_bancarias
  drop constraint if exists empleado_cuentas_bancarias_un_titular;
alter table public.empleado_cuentas_bancarias
  add constraint empleado_cuentas_bancarias_un_titular
  check (num_nonnulls(usuario_id, persona_sin_usuario_id) = 1);

create unique index if not exists empleado_cuenta_principal_unica_sin_usuario
  on public.empleado_cuentas_bancarias (persona_sin_usuario_id, moneda)
  where es_principal and persona_sin_usuario_id is not null;

-- La lectura de la 0017 ya cubre a Contabilidad/Tesorería/admin para
-- cualquier fila. La escritura de la 0017 es solo "la mía" (usuario_id =
-- auth.uid()), que nunca calza con estas filas: la de una persona sin
-- usuario la escribe Contabilidad.
drop policy if exists empleado_cuentas_bancarias_escritura_sin_usuario on public.empleado_cuentas_bancarias;
create policy empleado_cuentas_bancarias_escritura_sin_usuario on public.empleado_cuentas_bancarias
  for all to authenticated
  using (persona_sin_usuario_id is not null and (public.es_admin() or public.area_en('contabilidad')))
  with check (persona_sin_usuario_id is not null and (public.es_admin() or public.area_en('contabilidad')));

-- ===================================================================
-- 3. El anticipo y la obligación pueden ser para una persona sin usuario
-- ===================================================================
alter table gastos.solicitudes_gasto
  add column if not exists asignado_persona_id uuid references public.personas_sin_usuario(id);
alter table gastos.solicitudes_gasto
  drop constraint if exists solicitudes_gasto_un_asignado;
alter table gastos.solicitudes_gasto
  add constraint solicitudes_gasto_un_asignado
  check (num_nonnulls(asignado_a, asignado_persona_id) <= 1);

alter table cuentas_x_pagar.obligaciones
  add column if not exists beneficiario_sin_usuario_id uuid references public.personas_sin_usuario(id);
alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_un_beneficiario;
alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_un_beneficiario
  check (num_nonnulls(beneficiario_persona, beneficiario_sin_usuario_id) <= 1);

-- Lo que leen las pantallas, los reportes y el pago: "a quién se le paga",
-- sea usuario o no. Una sola columna para que ningún listado tenga que
-- acordarse de mirar las dos (los UUID no chocan entre tablas).
alter table cuentas_x_pagar.obligaciones
  add column if not exists beneficiario_id uuid
    generated always as (coalesce(beneficiario_persona, beneficiario_sin_usuario_id)) stored;

comment on column cuentas_x_pagar.obligaciones.beneficiario_id is
  'beneficiario_persona (usuario) o beneficiario_sin_usuario_id (personas_sin_usuario). Para leer; se escribe una de las otras dos. Migración 0081.';

-- ===================================================================
-- 4. Los vendedores que pidió Sebas
-- ===================================================================
-- Sin DNI ni cuenta: los completa Contabilidad desde la pantalla. Hasta
-- entonces se les puede armar el anticipo, y la propuesta de pago avisa
-- que falta la cuenta (igual que con un empleado que no la cargó).
insert into public.personas_sin_usuario (nombre, created_by)
select v.nombre, null
  from (values
    ('Omar Rubio'), ('Jessica Mendoza'), ('Milagros Soto'), ('Omar Quevedo'),
    ('Fabiola Samaniego'), ('Malena Gaona'), ('Bryan Palomino'), ('Luis Vargas')
  ) as v(nombre)
 where not exists (
   select 1 from public.personas_sin_usuario p where lower(btrim(p.nombre)) = lower(btrim(v.nombre))
 );
