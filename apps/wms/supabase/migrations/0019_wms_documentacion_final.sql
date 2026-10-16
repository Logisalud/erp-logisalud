-- 0019 · WMS · Salidas · S6b: documentación final (RUT-02)
--
-- Después de la conformidad se registra el N.° de la guía de remisión (GRE) y se revisa el paquete documental de los lotes EXACTOS que salen.
--   · La GRE se emite fuera del WMS (sin SUNAT, D-80/D-81): aquí solo se REGISTRA su número a mano. Las líneas de la guía salen de lo confirmado
--     (lote, vencimiento y cantidad de la conformidad: no se vuelven a escribir). Una guía no se edita: se anula con motivo y se registra otra.
--   · `paquete_documental(salida)` dice, por cada lote de la salida, qué documentos pide el cliente (perfil documental, 0016) y cómo está cada uno.
--   · Una salida con la conformidad completa y documentos faltantes o vencidos genera la alerta `DOCUMENTACION_INCOMPLETA` para el Jefe de Transporte.
-- Re-ejecutable. Se aplica a mano, después de la 0018. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Alerta y permisos
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'alertas_tipo_check' and conrelid = 'wms.alertas'::regclass) then
    alter table wms.alertas drop constraint alertas_tipo_check;
  end if;
  alter table wms.alertas add constraint alertas_tipo_check check (tipo in (
    'TEMPERATURA', 'RS_VENCIDO', 'DIVERGENCIA_COMPRAS', 'POR_TRASLADAR_VENCIDO', 'LOTE_POR_VENCER', 'LOTE_VENCIDO',
    'SOLICITUD_AJUSTADA', 'EXCEDE_OC', 'POR_REGISTRAR_EN_COMPRAS', 'NO_COINCIDE_CON_COMPRAS',
    'MOVIMIENTO_CON_DIFERENCIA', 'MOVIMIENTO_SIN_VERIFICAR', 'CONTEO_CON_DIFERENCIA', 'AJUSTE_POR_AUTORIZAR', 'PENDIENTE_AFECTA_PRODUCTO',
    'STOCK_INSUFICIENTE', 'PEDIDO_CAMBIADO', 'DOCUMENTO_VENCIDO', 'DOCUMENTACION_INCOMPLETA'));
end $$;

-- Quién registra la GRE (D-85: decisión técnica reversible; se cambia con una fila). Imprimir el paquete ya es del Jefe de Transporte (y de DT) desde la 0011.
insert into wms.permisos_rol (rol, accion) values
  ('jefe_transporte', 'registrar_documentacion'), ('asistente_dt', 'registrar_documentacion'), ('direccion_tecnica', 'registrar_documentacion')
on conflict (rol, accion) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Guías de remisión registradas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists wms.guias_remision (
  id uuid primary key default gen_random_uuid(),
  salida_id uuid not null references wms.salidas(id),
  numero text not null check (numero ~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$'),     -- T001-00001234, EG07-00002031
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'ANULADA')),
  lineas jsonb not null,                                                      -- [{producto_codigo, producto, lote, vence, cantidad}] tomadas de lo confirmado
  placa text,
  fecha_traslado date,
  nota text,
  registrada_por uuid not null,
  registrada_en timestamptz not null default now(),
  anulada_por uuid,
  anulada_en timestamptz,
  motivo_anulacion text,
  check ((estado = 'ANULADA') = (anulada_en is not null and nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null))
);
alter table wms.guias_remision enable row level security;
create unique index if not exists guias_remision_salida_uk on wms.guias_remision (salida_id) where estado = 'VIGENTE';     -- una guía viva por salida
create unique index if not exists guias_remision_numero_uk on wms.guias_remision (numero) where estado = 'VIGENTE';        -- un número, una salida
create index if not exists guias_remision_salida_idx on wms.guias_remision (salida_id);

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'guias_remision' and policyname = 'lectura') then drop policy lectura on wms.guias_remision; end if;
  create policy lectura on wms.guias_remision for select to authenticated using (wms.es_usuario());
end $$;
revoke all on wms.guias_remision from anon, authenticated;
grant select on wms.guias_remision to authenticated;

-- La guía no se edita: solo puede pasar a ANULADA (con motivo) y nada se borra.
create or replace function wms._guia_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una guía registrada no se borra: se anula con motivo' using errcode = 'P0001'; end if;
  if (new.salida_id, new.numero, new.lineas, new.placa, new.fecha_traslado, new.nota, new.registrada_por, new.registrada_en)
     is distinct from (old.salida_id, old.numero, old.lineas, old.placa, old.fecha_traslado, old.nota, old.registrada_por, old.registrada_en)
     or old.estado = 'ANULADA' then
    raise exception 'Una guía registrada no se edita: se anula con motivo y se registra otra' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'guias_remision_inmutable' and tgrelid = 'wms.guias_remision'::regclass) then drop trigger guias_remision_inmutable on wms.guias_remision; end if; end $$;
create trigger guias_remision_inmutable before update or delete on wms.guias_remision for each row execute function wms._guia_inmutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lo que sale: lotes confirmados y paquete documental
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Todas las líneas de la orden de picking vigente están conformes? (y existe la orden)
create or replace function wms._salida_conforme(p_salida uuid) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select exists (select 1 from wms.ordenes_picking o where o.salida_id = p_salida and o.estado <> 'CANCELADA')
     and not exists (
       select 1 from wms.ordenes_picking o join wms.ordenes_picking_lineas l on l.orden_id = o.id
        where o.salida_id = p_salida and o.estado <> 'CANCELADA' and l.conformidad <> 'CONFORME')
$$;

-- Las líneas de la guía: lo confirmado, agrupado por producto y lote.
create or replace function wms._lineas_de_guia(p_salida uuid) returns jsonb
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('producto_codigo', x.pcodigo, 'producto', x.producto, 'lote', x.lote, 'vence', x.vence, 'cantidad', x.cantidad)
                            order by x.pcodigo, x.vence, x.lote), '[]'::jsonb)
    from (
      select p.codigo as pcodigo, p.descripcion as producto, lt.codigo as lote, lt.vence, sum(l.cantidad)::integer as cantidad
        from wms.ordenes_picking o
        join wms.ordenes_picking_lineas l on l.orden_id = o.id
        join wms.lotes lt on lt.id = l.lote_id
        join catalogo.productos p on p.id = l.producto_id
       where o.salida_id = p_salida and o.estado <> 'CANCELADA' and l.conformidad = 'CONFORME'
       group by p.codigo, p.descripcion, lt.codigo, lt.vence
    ) x
$$;

-- El RUC del cliente de la salida (viene del pedido importado) y la fecha de entrega prevista (la de la ruta).
create or replace function wms._ruc_de_salida(p_salida uuid) returns text
language sql stable security definer set search_path = wms, pg_temp as $$
  select d.cliente_ruc from wms.salidas s join wms.pedidos_despacho d on d.pedido_id = s.referencia_id and d.vigente
   where s.id = p_salida and s.referencia_tipo = 'pedido'
$$;
create or replace function wms._entrega_de_salida(p_salida uuid) returns date
language sql stable security definer set search_path = wms, pg_temp as $$
  select r.fecha from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id
   where pa.salida_id = p_salida and pa.activa order by r.fecha desc limit 1
$$;

-- El paquete: por cada lote de la salida (con sus reservas vivas), los documentos que pide el cliente y su estado.
create or replace function wms.paquete_documental(p_salida uuid)
returns table (linea_id uuid, producto_id uuid, producto_codigo text, producto text, lote_id uuid, lote text, cantidad integer,
               tipo text, exigido boolean, estado text, documento_id uuid, nombre_archivo text, vigente_hasta date)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare r record; d record; v_ruc text; v_entrega date;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  if not exists (select 1 from wms.salidas where id = p_salida) then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  v_ruc := wms._ruc_de_salida(p_salida); v_entrega := wms._entrega_de_salida(p_salida);
  for r in
    select rv.linea_id, rv.producto_id, p.codigo as pcodigo, p.descripcion as pdesc, rv.lote_id, lt.codigo as lcodigo, sum(rv.cantidad)::integer as cant
      from wms.reservas rv join wms.salida_lineas sl on sl.id = rv.linea_id join wms.lotes lt on lt.id = rv.lote_id join catalogo.productos p on p.id = rv.producto_id
     where sl.salida_id = p_salida and rv.estado in ('ACTIVA', 'EN_TRANSITO', 'EN_STAGING', 'CONSUMIDA')
     group by rv.linea_id, rv.producto_id, p.codigo, p.descripcion, rv.lote_id, lt.codigo
     order by p.codigo, lt.codigo
  loop
    for d in select * from wms.estado_documental(r.lote_id, v_ruc, v_entrega) loop
      return query select r.linea_id, r.producto_id, r.pcodigo, r.pdesc, r.lote_id, r.lcodigo, r.cant, d.tipo, d.exigido, d.estado, d.documento_id, d.nombre_archivo, d.vigente_hasta;
    end loop;
  end loop;
end $$;

-- Resumen para la lista de salidas: ¿tiene guía? ¿cuántos documentos exigidos faltan o están vencidos?
create or replace function wms.documentacion_resumen()
returns table (salida_id uuid, guia_numero text, faltantes integer)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare s record;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  for s in select id from wms.salidas where estado = 'ABIERTA' loop
    return query select s.id, (select g.numero from wms.guias_remision g where g.salida_id = s.id and g.estado = 'VIGENTE'),
                        (select count(*)::integer from wms.paquete_documental(s.id) q where q.exigido and q.estado <> 'OK');
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Registrar y anular la guía
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.registrar_gre(p_salida uuid, p_numero text, p_nota text default null) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_num text := upper(btrim(coalesce(p_numero, ''))); v_id uuid := gen_random_uuid(); v_placa text; v_fecha date;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para registrar la guía de remisión');
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if v_num !~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$' then raise exception 'El número de la guía se escribe como T001-00001234 (serie, guion y número)' using errcode = 'P0001'; end if;
  if not wms._salida_conforme(p_salida) then raise exception 'La guía se registra cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision where salida_id = p_salida and estado = 'VIGENTE') then
    raise exception 'Este pedido ya tiene una guía registrada. Para cambiarla, anúlala con el motivo y registra la nueva' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guias_remision where numero = v_num and estado = 'VIGENTE') then
    raise exception 'La guía % ya está registrada en otra salida', v_num using errcode = 'P0001';
  end if;
  select ve.placa, r.fecha into v_placa, v_fecha
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id left join wms.vehiculos ve on ve.id = r.vehiculo_id
   where pa.salida_id = p_salida and pa.activa order by r.fecha desc limit 1;
  insert into wms.guias_remision (id, salida_id, numero, lineas, placa, fecha_traslado, nota, registrada_por)
  values (v_id, p_salida, v_num, wms._lineas_de_guia(p_salida), v_placa, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
  perform wms.registrar_audit('gre_registrada', 'guias_remision', v_id::text, null, jsonb_build_object('numero', v_num, 'salida', s.numero), null);
  return v_id;
end $$;

create or replace function wms.anular_gre(p_guia uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para anular la guía de remisión');
  if v_mot is null then raise exception 'Cuenta por qué se anula la guía' using errcode = 'P0001'; end if;
  select * into g from wms.guias_remision where id = p_guia for update;
  if not found then raise exception 'No encontramos esa guía' using errcode = 'P0001'; end if;
  if g.estado = 'ANULADA' then raise exception 'Esa guía ya está anulada' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.salidas where id = g.salida_id and estado <> 'ABIERTA') then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  update wms.guias_remision set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = v_mot where id = p_guia;
  perform wms.registrar_audit('gre_anulada', 'guias_remision', p_guia::text, jsonb_build_object('numero', g.numero), null, v_mot);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Alerta: conformidad completa con documentos por completar
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms._avisar_documentacion(p_salida uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; n integer; v_det text;
begin
  select * into s from wms.salidas where id = p_salida;
  if not found or s.estado <> 'ABIERTA' or not wms._salida_conforme(p_salida) then return; end if;
  select count(*)::integer,
         string_agg(case q.tipo when 'COA' then 'COA del lote ' || q.lote when 'BPM' then 'BPM de ' || q.producto_codigo else 'registro sanitario de ' || q.producto_codigo end
                    || case q.estado when 'FALTA' then ' (falta)' when 'VENCIDO' then ' (vencido)' else ' (vence antes de la entrega)' end, '; ' order by q.producto_codigo, q.lote)
    into n, v_det
    from wms.paquete_documental(p_salida) q where q.exigido and q.estado <> 'OK';
  if n > 0 then
    perform wms._alertar('DOCUMENTACION_INCOMPLETA', 'jefe_transporte', null, null, 'doc-salida:' || p_salida,
      format('El pedido de la salida %s tiene la conformidad completa, pero el paquete documental no: %s.', s.numero, v_det));
  end if;
end $$;

create or replace function wms._tr_conformidad_documentacion() returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  if new.conformidad = 'CONFORME' and old.conformidad is distinct from 'CONFORME' then
    perform wms._avisar_documentacion((select o.salida_id from wms.ordenes_picking o where o.id = new.orden_id));
  end if;
  return null;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'ordenes_picking_lineas_documentacion' and tgrelid = 'wms.ordenes_picking_lineas'::regclass) then drop trigger ordenes_picking_lineas_documentacion on wms.ordenes_picking_lineas; end if; end $$;
create trigger ordenes_picking_lineas_documentacion after update of conformidad on wms.ordenes_picking_lineas for each row execute function wms._tr_conformidad_documentacion();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.paquete_documental(uuid), wms.documentacion_resumen(), wms.registrar_gre(uuid, text, text), wms.anular_gre(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
