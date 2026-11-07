-- ===================================================================
-- 0088 — Varias facturas por recepción, y corregir los papeles después
--
-- Pedido de Sebas (2026-11-04) con la OC-2026-0050 de DIMEXA: llegaron dos
-- facturas (F991-317017 y F991-317018) con una sola entrega. La recepción
-- solo aceptaba UNA factura, así que Charlie subió la 317017 en el espacio
-- de las guías, y una vez guardada no había forma de corregirlo. Lo pedido:
-- "que pueda colocar más de una factura, y más de una guía, y que pueda
-- incluir una después de cerrada por si acaso".
--
--  1. `almacen.recepciones_facturas`: una fila por factura (número + su
--     archivo), igual que `recepciones_guias` en 0064 y por la misma razón.
--     `recepciones.numero_factura` / `storage_path_factura_proveedor` quedan
--     como RESUMEN que mantiene la función de abajo — los leen pantallas y
--     reportes que no hace falta tocar.
--  2. `almacen.recepciones_documentos_cambios`: el rastro de cada papel que
--     se agrega, se quita o se reclasifica DESPUÉS de registrar. Cambiar el
--     respaldo documental es legítimo, pero no puede ser invisible (mismo
--     criterio que `voucher_reemplazado_*`, 0057).
--  3. `almacen.sincronizar_facturas_recepcion`: recalcula el resumen de la
--     recepción y el número/archivo de la factura en su obligación. SECURITY
--     DEFINER porque Almacén corrige sus papeles pero no escribe en Cuentas
--     por Pagar; la función revisa el área ella misma.
--
-- La obligación sigue siendo UNA por recepción: Almacén no declara qué línea
-- va en qué factura, así que partir la deuda sería inventar. Su
-- `numero_factura` pasa a listar todas ("F991-317017 / F991-317018").
--
-- Re-ejecutable.
-- ===================================================================

-- ── 1. Las facturas ───────────────────────────────────────────────────────
create table if not exists almacen.recepciones_facturas (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references almacen.recepciones(id) on delete cascade,
  numero text not null check (nullif(btrim(numero), '') is not null),
  storage_path text not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists recepciones_facturas_numero_unico
  on almacen.recepciones_facturas (recepcion_id, upper(btrim(numero)));
create index if not exists recepciones_facturas_recepcion_idx
  on almacen.recepciones_facturas (recepcion_id);

comment on table almacen.recepciones_facturas is
  'Una fila por factura del proveedor recibida con la mercadería: su número y su archivo (0088). '
  'recepciones.numero_factura / storage_path_factura_proveedor son el resumen que mantiene '
  'almacen.sincronizar_facturas_recepcion().';

-- Las 32 recepciones que existen tienen número Y archivo: pasan tal cual.
insert into almacen.recepciones_facturas (recepcion_id, numero, storage_path, created_by, created_at)
select r.id, btrim(r.numero_factura), r.storage_path_factura_proveedor, r.recibido_por, coalesce(r.fecha_conformidad, now())
from almacen.recepciones r
where nullif(btrim(r.numero_factura), '') is not null
  and r.storage_path_factura_proveedor is not null
  and not exists (select 1 from almacen.recepciones_facturas f where f.recepcion_id = r.id);

alter table almacen.recepciones_facturas enable row level security;

drop policy if exists recepciones_facturas_lectura on almacen.recepciones_facturas;
create policy recepciones_facturas_lectura on almacen.recepciones_facturas
  for select to authenticated using (public.mi_area() is not null);

-- Escribe Almacén (registra y corrige), y Contabilidad, que es quien detecta
-- el papel que falta al revisar la obligación.
drop policy if exists recepciones_facturas_escritura on almacen.recepciones_facturas;
create policy recepciones_facturas_escritura on almacen.recepciones_facturas
  for all to authenticated
  using (public.area_en('almacen', 'contabilidad', 'admin'))
  with check (public.area_en('almacen', 'contabilidad', 'admin'));

-- Las guías: misma corrección para Contabilidad. Policy aparte (se suma con
-- OR) para no tocar la de 0064.
drop policy if exists recepciones_guias_correccion_contabilidad on almacen.recepciones_guias;
create policy recepciones_guias_correccion_contabilidad on almacen.recepciones_guias
  for all to authenticated
  using (public.area_en('contabilidad'))
  with check (public.area_en('contabilidad'));

-- ── 2. El rastro de los cambios ──────────────────────────────────────────
create table if not exists almacen.recepciones_documentos_cambios (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references almacen.recepciones(id) on delete cascade,
  -- 'agregar' un papel que faltó, 'quitar' uno que no era de esta entrega,
  -- 'reclasificar' uno subido en el lugar equivocado (guía ↔ factura).
  accion text not null check (accion in ('agregar', 'quitar', 'reclasificar')),
  -- Qué ES el papel después del cambio (para 'quitar', qué era).
  tipo text not null check (tipo in ('guia', 'factura')),
  numero text not null,
  storage_path text,
  motivo text,
  hecho_por uuid references auth.users(id) default auth.uid(),
  hecho_en timestamptz not null default now(),
  -- Agregar se explica solo; quitar o reclasificar, no.
  constraint recepciones_documentos_cambios_motivo
    check (accion = 'agregar' or nullif(btrim(motivo), '') is not null)
);

create index if not exists recepciones_documentos_cambios_recepcion_idx
  on almacen.recepciones_documentos_cambios (recepcion_id, hecho_en);

alter table almacen.recepciones_documentos_cambios enable row level security;

drop policy if exists recepciones_documentos_cambios_lectura on almacen.recepciones_documentos_cambios;
create policy recepciones_documentos_cambios_lectura on almacen.recepciones_documentos_cambios
  for select to authenticated using (public.mi_area() is not null);

-- Solo se agrega: el rastro no se edita ni se borra.
drop policy if exists recepciones_documentos_cambios_alta on almacen.recepciones_documentos_cambios;
create policy recepciones_documentos_cambios_alta on almacen.recepciones_documentos_cambios
  for insert to authenticated
  with check (public.area_en('almacen', 'contabilidad', 'admin'));

-- ── 3. El resumen en la recepción y en su obligación ─────────────────────
create or replace function almacen.sincronizar_facturas_recepcion(p_recepcion_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numeros text;
  v_primer_path text;
begin
  if not public.area_en('almacen', 'contabilidad', 'admin') then
    raise exception 'Solo Almacén o Contabilidad corrigen los papeles de una recepción.';
  end if;

  select string_agg(upper(btrim(f.numero)), ' / ' order by f.created_at, f.numero),
         (array_agg(f.storage_path order by f.created_at, f.numero))[1]
    into v_numeros, v_primer_path
  from almacen.recepciones_facturas f
  where f.recepcion_id = p_recepcion_id;

  if v_numeros is null then
    raise exception 'La recepción tiene que quedar con al menos una factura.';
  end if;

  update almacen.recepciones
     set numero_factura = v_numeros,
         storage_path_factura_proveedor = v_primer_path
   where id = p_recepcion_id;

  update cuentas_x_pagar.obligaciones
     set numero_factura = v_numeros,
         factura_storage_path = v_primer_path
   where recepcion_id = p_recepcion_id
     and numero_factura is distinct from v_numeros;

  return v_numeros;
end;
$$;

revoke all on function almacen.sincronizar_facturas_recepcion(uuid) from public;
grant execute on function almacen.sincronizar_facturas_recepcion(uuid) to authenticated;

select public.aplicar_grants_del_modulo();
