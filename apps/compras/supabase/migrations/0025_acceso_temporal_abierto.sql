-- Acceso temporal abierto — decisión explícita de Sebas mientras se valida
-- el módulo end-to-end: cualquier usuario interno autenticado (login por
-- magic link, con fila en public.perfiles — sin importar el área: compras,
-- almacen, contabilidad, tesoreria, gerencia, gestion_humana, legal,
-- direccion_tecnica, ventas, admin, otro) puede ver y usar TODOS los
-- botones y flujos de Compras y Pagos, no solo los de su área.
--
-- Reversible sin re-mergear nada: `update compras.flags set valor = false
-- where clave = 'acceso_abierto_temporal'` apaga el acceso abierto al
-- instante y vuelve a las policies por área de siempre (0002 y las
-- siguientes) — nunca se tocaron ni se borraron, esta migración solo AGREGA
-- una policy permissive más por tabla, que Postgres combina con OR.
--
-- NO toca public.area_en() (compartida con apps/cobranzas — tocarla
-- filtraría el acceso abierto a Cuentas por Cobrar, que no es lo que se
-- pidió) ni ninguna tabla fuera de los 8 schemas de este módulo. El flujo
-- de vendedores por /v/[token] no pasa por auth.uid()/public.perfiles ni
-- por estas tablas — no se ve afectado.

create table if not exists compras.flags (
  clave text primary key,
  valor boolean not null
);

insert into compras.flags (clave, valor)
values ('acceso_abierto_temporal', true)
on conflict (clave) do nothing;

alter table compras.flags enable row level security;

drop policy if exists flags_lectura on compras.flags;
create policy flags_lectura on compras.flags
  for select to authenticated
  using (true);

drop policy if exists flags_escritura on compras.flags;
create policy flags_escritura on compras.flags
  for all to authenticated
  using (public.area_en('admin'))
  with check (public.area_en('admin'));

create or replace function public.compras_acceso_abierto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (select 1 from public.perfiles where id = auth.uid())
    and coalesce(
      (select valor from compras.flags where clave = 'acceso_abierto_temporal'),
      false
    );
$$;

do $$
declare t record;
begin
  for t in
    select schemaname, tablename from pg_tables
    where schemaname in (
      'compras','servicios','almacen','cuentas_x_pagar',
      'gastos','caja_chica','financiamiento','impuestos'
    )
    and tablename <> 'flags'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      t.tablename || '_acceso_temporal', t.schemaname, t.tablename
    );
    execute format(
      'create policy %I on %I.%I for all to authenticated using (public.compras_acceso_abierto()) with check (public.compras_acceso_abierto())',
      t.tablename || '_acceso_temporal', t.schemaname, t.tablename
    );
  end loop;
end $$;
