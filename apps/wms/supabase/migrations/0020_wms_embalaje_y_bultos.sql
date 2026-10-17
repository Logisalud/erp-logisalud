-- 0020 · WMS · Salidas · S7: embalaje y bultos (RUT-05)
--
-- Después de la conformidad, el pedido se embala: las unidades CONFIRMADAS se reparten en bultos («1 de 3»), cada uno con su código (el que va en el QR de la etiqueta).
--   · `embalar_salida` reparte TODO lo confirmado (lote por lote) en 1 a 99 bultos; no sobra ni falta una unidad y ningún bulto queda vacío.
--   · Los bultos no se editan: para rehacer el reparto se reabre el embalaje con motivo (los bultos anteriores quedan anulados, con su historia) y se embala de nuevo.
--   · El embalaje NO mueve stock (las unidades siguen en la zona de conformidad hasta la salida confirmada, D-51). Las zonas EMBALAJE y DESPACHO siguen apagadas hasta que Dirección Técnica las defina.
--   · «Listo para carga» = conforme + embalado + guía registrada + paquete documental completo (D-60): `listo_para_carga` lo calcula en un solo lugar.
-- Re-ejecutable. Se aplica a mano, después de la 0019. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos (D-86: decisión técnica reversible; se cambia con una fila)
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.permisos_rol (rol, accion) values ('auxiliar', 'embalar'), ('jefe_almacen', 'embalar'), ('jefe_transporte', 'embalar')
on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bultos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.bultos (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  secuencia integer not null check (secuencia >= 1),
  total integer not null check (total >= 1 and total <= 99),
  codigo text not null,                                         -- SAL-2026-00001-B1: es lo que lleva el QR
  estado text not null default 'EMBALADO' check (estado in ('EMBALADO', 'ANULADO')),
  embalado_por uuid not null,
  embalado_en timestamptz not null default now(),
  anulado_por uuid,
  anulado_en timestamptz,
  motivo_anulacion text,
  check (secuencia <= total),
  check ((estado = 'ANULADO') = (anulado_en is not null and nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null))
);
alter table wms.bultos enable row level security;
create unique index if not exists bultos_codigo_uk on wms.bultos (codigo) where estado = 'EMBALADO';
create unique index if not exists bultos_secuencia_uk on wms.bultos (salida_id, secuencia) where estado = 'EMBALADO';
create index if not exists bultos_salida_idx on wms.bultos (salida_id);

create table if not exists wms.bulto_contenido (
  bulto_id uuid not null references wms.bultos(id),
  linea_id uuid not null references wms.salida_lineas(id),
  lote_id uuid not null references wms.lotes(id),
  cantidad integer not null check (cantidad > 0),
  primary key (bulto_id, linea_id, lote_id)
);
alter table wms.bulto_contenido enable row level security;

do $$ declare t text; begin
  foreach t in array array['bultos', 'bulto_contenido'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- Un bulto no se edita: solo puede pasar a ANULADO (con motivo); su contenido no se toca ni se borra.
create or replace function wms._bulto_inmutable() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'bulto_contenido' then raise exception 'El contenido de un bulto no se edita: se reabre el embalaje con el motivo' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then raise exception 'Un bulto no se borra: se reabre el embalaje con el motivo' using errcode = 'P0001'; end if;
  if (new.salida_id, new.secuencia, new.total, new.codigo, new.embalado_por, new.embalado_en) is distinct from (old.salida_id, old.secuencia, old.total, old.codigo, old.embalado_por, old.embalado_en)
     or old.estado = 'ANULADO' then
    raise exception 'Un bulto no se edita: se reabre el embalaje con el motivo' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'bultos_inmutable' and tgrelid = 'wms.bultos'::regclass) then drop trigger bultos_inmutable on wms.bultos; end if; end $$;
create trigger bultos_inmutable before update or delete on wms.bultos for each row execute function wms._bulto_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'bulto_contenido_inmutable' and tgrelid = 'wms.bulto_contenido'::regclass) then drop trigger bulto_contenido_inmutable on wms.bulto_contenido; end if; end $$;
create trigger bulto_contenido_inmutable before update or delete on wms.bulto_contenido for each row execute function wms._bulto_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lo confirmado (lo que hay que embalar) y el estado del embalaje
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._confirmado_por_lote(p_salida uuid) returns table (linea_id uuid, lote_id uuid, cantidad integer)
language sql stable security definer set search_path = wms, pg_temp as $$
  select l.linea_id, l.lote_id, sum(l.cantidad)::integer
    from wms.ordenes_picking o join wms.ordenes_picking_lineas l on l.orden_id = o.id
   where o.salida_id = p_salida and o.estado <> 'CANCELADA' and l.conformidad = 'CONFORME'
   group by l.linea_id, l.lote_id
$$;

create or replace function wms._salida_embalada(p_salida uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.bultos where salida_id = p_salida and estado = 'EMBALADO')
$$;

-- «Listo para carga» = conforme + embalado + guía vigente + paquete documental completo (nada exigido falta, vence o está vencido).
create or replace function wms.listo_para_carga(p_salida uuid) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  return wms._salida_conforme(p_salida) and wms._salida_embalada(p_salida)
     and exists (select 1 from wms.guias_remision where salida_id = p_salida and estado = 'VIGENTE')
     and not exists (select 1 from wms.paquete_documental(p_salida) q where q.exigido and q.estado <> 'OK');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Embalar y reabrir
-- ─────────────────────────────────────────────────────────────────────────────

-- p_bultos = [{"contenido": [{"linea_id": …, "lote_id": …, "cantidad": n}, …]}, …]  (el orden del arreglo es el número del bulto)
create or replace function wms.embalar_salida(p_salida uuid, p_bultos jsonb) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  s wms.salidas; v_total integer; b jsonb; c jsonb; i integer := 0; v_id uuid; v_cant integer; r record; v_vistos text[];
begin
  perform wms._exigir_accion('embalar', 'No tienes permiso para embalar');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if not wms._salida_conforme(p_salida) then raise exception 'El embalaje empieza cuando todo el pedido tiene la conformidad' using errcode = 'P0001'; end if;
  if wms._salida_embalada(p_salida) then raise exception 'Este pedido ya está embalado. Para rehacerlo, reabre el embalaje con el motivo' using errcode = 'P0001'; end if;
  if p_bultos is null or jsonb_typeof(p_bultos) <> 'array' then raise exception 'Indica los bultos' using errcode = 'P0001'; end if;
  v_total := jsonb_array_length(p_bultos);
  if v_total < 1 or v_total > 99 then raise exception 'Un pedido se embala en 1 a 99 bultos' using errcode = 'P0001'; end if;

  -- todo lo confirmado, lote por lote, tiene que quedar repartido: ni más ni menos
  for b in select * from jsonb_array_elements(p_bultos) loop
    i := i + 1; v_vistos := array[]::text[];
    if jsonb_typeof(b->'contenido') <> 'array' or jsonb_array_length(b->'contenido') = 0 then raise exception 'El bulto % está vacío', i using errcode = 'P0001'; end if;
    for c in select * from jsonb_array_elements(b->'contenido') loop
      v_cant := (c->>'cantidad')::integer;
      if v_cant is null or v_cant <= 0 then raise exception 'Cada cantidad del bulto % debe ser mayor que cero', i using errcode = 'P0001'; end if;
      if (c->>'linea_id') || '|' || (c->>'lote_id') = any(v_vistos) then raise exception 'El bulto % repite un lote: súmalo en una sola celda', i using errcode = 'P0001'; end if;
      v_vistos := v_vistos || ((c->>'linea_id') || '|' || (c->>'lote_id'));
      if not exists (select 1 from wms._confirmado_por_lote(p_salida) k where k.linea_id = (c->>'linea_id')::uuid and k.lote_id = (c->>'lote_id')::uuid) then
        raise exception 'El bulto % tiene un lote que no está en lo confirmado de este pedido', i using errcode = 'P0001';
      end if;
    end loop;
  end loop;
  for r in
    with reparto as (
      select (c->>'linea_id')::uuid as linea_id, (c->>'lote_id')::uuid as lote_id, (c->>'cantidad')::integer as cantidad
        from jsonb_array_elements(p_bultos) bb, jsonb_array_elements(bb->'contenido') c)
    select k.linea_id, k.lote_id, k.cantidad as confirmado, coalesce((select sum(x.cantidad) from reparto x where x.linea_id = k.linea_id and x.lote_id = k.lote_id), 0)::integer as repartido,
           (select codigo from wms.lotes where id = k.lote_id) as lote
      from wms._confirmado_por_lote(p_salida) k
  loop
    if r.repartido < r.confirmado then raise exception 'Faltan % unidades del lote % por poner en un bulto', r.confirmado - r.repartido, r.lote using errcode = 'P0001'; end if;
    if r.repartido > r.confirmado then raise exception 'Sobran % unidades del lote %: solo se confirmaron %', r.repartido - r.confirmado, r.lote, r.confirmado using errcode = 'P0001'; end if;
  end loop;

  i := 0;
  for b in select * from jsonb_array_elements(p_bultos) loop
    i := i + 1; v_id := gen_random_uuid();
    insert into wms.bultos (id, salida_id, secuencia, total, codigo, embalado_por) values (v_id, p_salida, i, v_total, s.numero || '-B' || i, auth.uid());
    for c in select * from jsonb_array_elements(b->'contenido') loop
      insert into wms.bulto_contenido (bulto_id, linea_id, lote_id, cantidad) values (v_id, (c->>'linea_id')::uuid, (c->>'lote_id')::uuid, (c->>'cantidad')::integer);
    end loop;
  end loop;
  perform wms.registrar_audit('salida_embalada', 'salidas', p_salida::text, null, jsonb_build_object('bultos', v_total), null);
  return v_total;
end $$;

create or replace function wms.reabrir_embalaje(p_salida uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('embalar', 'No tienes permiso para reabrir el embalaje');
  if v_mot is null then raise exception 'Cuenta por qué se reabre el embalaje' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if not wms._salida_embalada(p_salida) then raise exception 'Este pedido no está embalado' using errcode = 'P0001'; end if;
  update wms.bultos set estado = 'ANULADO', anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = v_mot where salida_id = p_salida and estado = 'EMBALADO';
  perform wms.registrar_audit('embalaje_reabierto', 'salidas', p_salida::text, null, null, v_mot);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.embalar_salida(uuid, jsonb), wms.reabrir_embalaje(uuid, text), wms.listo_para_carga(uuid) to authenticated;
revoke execute on all functions in schema wms from public;
