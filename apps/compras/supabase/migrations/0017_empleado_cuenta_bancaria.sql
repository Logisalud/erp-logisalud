-- Fase 1.3: cuenta bancaria de empleados. Un reembolso/anticipo/reposición de
-- caja chica se paga a una PERSONA (cuentas_x_pagar.obligaciones.beneficiario_persona),
-- no a un proveedor — y hasta ahora no había dónde guardar a qué cuenta
-- depositarle. Mismo patrón que compras.proveedor_cuentas_bancarias, pero en
-- `public` (junto a perfiles) porque es dato de la persona, no de un
-- Bounded Context de compras.

create table if not exists public.empleado_cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  banco text not null,
  tipo_cuenta text check (tipo_cuenta in ('ahorros', 'corriente')),
  numero_cuenta text not null,
  cci text not null check (char_length(cci) = 20),
  moneda text not null check (moneda in ('PEN', 'USD')),
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists empleado_cuenta_principal_unica
  on public.empleado_cuentas_bancarias (usuario_id, moneda) where es_principal;

alter table public.empleado_cuentas_bancarias enable row level security;

-- Cada quien administra su propia cuenta. Contabilidad/Tesorería/admin
-- necesitan leer la de cualquiera para elegir el destino al ejecutar un pago
-- (ver app/cuentas-por-pagar/propuestas/[id]/pago.tsx) — nunca escribirla.
drop policy if exists empleado_cuentas_bancarias_lectura on public.empleado_cuentas_bancarias;
create policy empleado_cuentas_bancarias_lectura on public.empleado_cuentas_bancarias
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_admin()
    or public.area_en('contabilidad')
    or public.area_en('tesoreria')
  );

drop policy if exists empleado_cuentas_bancarias_escritura on public.empleado_cuentas_bancarias;
create policy empleado_cuentas_bancarias_escritura on public.empleado_cuentas_bancarias
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.empleado_cuentas_bancarias to authenticated;

alter table cuentas_x_pagar.pagos
  add column if not exists cuenta_bancaria_empleado_id uuid
    references public.empleado_cuentas_bancarias(id);
