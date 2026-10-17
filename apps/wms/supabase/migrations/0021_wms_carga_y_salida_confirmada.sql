-- 0021 · WMS · Salidas · S8: carga, conciliación, «Liberar unidad» y «Salida confirmada»
--
-- La unidad se carga bulto por bulto (se escanea el QR de la etiqueta o se marca a mano). Antes de salir:
--   1. Checklist del vehículo (los puntos son un parámetro: la lista oficial está PENDIENTE de Dirección Técnica).
--   2. Conciliación: todos los bultos de los pedidos que salen tienen que estar cargados. Si falta un bulto, el Jefe de Transporte puede dejar ESE pedido fuera de la salida (con motivo).
--   3. «Liberar unidad»: solo con el checklist cumplido, todos los pedidos «listos para carga» y todos sus bultos cargados.
--   4. «Salida confirmada» (`confirmar_salida_ruta`): ahí, y solo ahí, el stock SALE de verdad (una sola transacción; repetirla no descuenta dos veces, D-51).
-- Re-ejecutable. Se aplica a mano, después de la 0020. Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos y parámetros
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.permisos_rol (rol, accion) values
  ('auxiliar', 'cargar_ruta'), ('jefe_almacen', 'cargar_ruta'), ('jefe_transporte', 'cargar_ruta'), ('jefe_transporte', 'liberar_unidad')
on conflict (rol, accion) do nothing;

insert into wms.parametros (clave, valor, nota) values
  ('checklist_vehicular_items',
   '["Vehículo limpio y sin olores", "Equipo de control de temperatura operativo", "Carrocería cerrada, sin filtraciones", "Documentos del vehículo y del conductor vigentes"]',
   'PENDIENTE de Dirección Técnica: la lista oficial del checklist del vehículo. Mientras tanto se usan estos cuatro puntos, que se pueden cambiar sin tocar código.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Datos de la salida de la ruta
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.rutas add column if not exists checklist jsonb;                 -- [{item, ok, nota}]
alter table wms.rutas add column if not exists checklist_por uuid;
alter table wms.rutas add column if not exists checklist_en timestamptz;
alter table wms.rutas add column if not exists liberada_por uuid;
alter table wms.rutas add column if not exists liberada_en timestamptz;
alter table wms.rutas add column if not exists salio_por uuid;
alter table wms.rutas add column if not exists salio_en timestamptz;            -- hora real de salida (va al LS-FR.43.03)

create table if not exists wms.carga_bultos (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  bulto_id uuid not null references wms.bultos(id),
  estado text not null default 'CARGADO' check (estado in ('CARGADO', 'RETIRADO')),
  cargado_por uuid not null,
  cargado_en timestamptz not null default now(),
  retirado_por uuid,
  retirado_en timestamptz,
  motivo_retiro text,
  check ((estado = 'RETIRADO') = (retirado_en is not null and nullif(btrim(coalesce(motivo_retiro, '')), '') is not null))
);
alter table wms.carga_bultos enable row level security;
create unique index if not exists carga_bultos_vivo_uk on wms.carga_bultos (bulto_id) where estado = 'CARGADO';     -- un bulto, una carga viva
create index if not exists carga_bultos_ruta_idx on wms.carga_bultos (ruta_id);

create table if not exists wms.carga_exclusiones (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  salida_id uuid not null references wms.salidas(id),
  motivo text not null check (nullif(btrim(motivo), '') is not null),
  por uuid not null,
  en timestamptz not null default now(),
  unique (ruta_id, salida_id)
);
alter table wms.carga_exclusiones enable row level security;

do $$ declare t text; begin
  foreach t in array array['carga_bultos', 'carga_exclusiones'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('revoke all on wms.%I from anon, authenticated', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
end $$;

-- La historia de la carga no se borra: un bulto cargado solo pasa a RETIRADO (con motivo) y una exclusión no se toca.
create or replace function wms._carga_inmutable() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'carga_exclusiones' then raise exception 'Una exclusión de la salida no se edita ni se borra' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then raise exception 'La carga no se borra: el bulto se retira con motivo' using errcode = 'P0001'; end if;
  if (new.ruta_id, new.bulto_id, new.cargado_por, new.cargado_en) is distinct from (old.ruta_id, old.bulto_id, old.cargado_por, old.cargado_en) or old.estado = 'RETIRADO' then
    raise exception 'La carga no se edita: el bulto se retira con motivo' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'carga_bultos_inmutable' and tgrelid = 'wms.carga_bultos'::regclass) then drop trigger carga_bultos_inmutable on wms.carga_bultos; end if; end $$;
create trigger carga_bultos_inmutable before update or delete on wms.carga_bultos for each row execute function wms._carga_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'carga_exclusiones_inmutable' and tgrelid = 'wms.carga_exclusiones'::regclass) then drop trigger carga_exclusiones_inmutable on wms.carga_exclusiones; end if; end $$;
create trigger carga_exclusiones_inmutable before update or delete on wms.carga_exclusiones for each row execute function wms._carga_inmutable();

-- Con un bulto ya cargado no se reabre el embalaje de su pedido (primero se retira de la carga).
create or replace function wms._no_anular_bulto_cargado() returns trigger language plpgsql as $$
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' and exists (select 1 from wms.carga_bultos where bulto_id = old.id and estado = 'CARGADO') then
    raise exception 'Hay bultos de este pedido cargados en una ruta: retíralos de la carga antes de reabrir el embalaje' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'bultos_no_anular_cargado' and tgrelid = 'wms.bultos'::regclass) then drop trigger bultos_no_anular_cargado on wms.bultos; end if; end $$;
create trigger bultos_no_anular_cargado before update on wms.bultos for each row execute function wms._no_anular_bulto_cargado();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lo que se espera cargar (conciliación)
-- ─────────────────────────────────────────────────────────────────────────────

-- Cada parada viva con salida: sus bultos (cargado o no), o una fila sola si todavía no está embalada o se dejó fuera de la salida.
create or replace function wms.conciliacion_carga(p_ruta uuid)
returns table (salida_id uuid, salida_numero text, pedido_numero text, secuencia integer, bulto_id uuid, codigo text, bulto_secuencia integer, bulto_total integer,
               cargado boolean, listo boolean, excluida boolean)
language plpgsql stable security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare pa record; b record; v_listo boolean; v_excl boolean;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  if not exists (select 1 from wms.rutas where id = p_ruta) then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  for pa in
    select p.secuencia as sec, p.salida_id as sid, s.numero as snum, d.numero as pnum
      from wms.ruta_paradas p join wms.salidas s on s.id = p.salida_id join wms.pedidos_despacho d on d.id = p.pedido_despacho_id
     where p.ruta_id = p_ruta and p.activa order by p.secuencia
  loop
    v_excl := exists (select 1 from wms.carga_exclusiones x where x.ruta_id = p_ruta and x.salida_id = pa.sid);
    v_listo := not v_excl and wms.listo_para_carga(pa.sid);
    if v_excl or not exists (select 1 from wms.bultos where salida_id = pa.sid and estado = 'EMBALADO') then
      return query select pa.sid, pa.snum, pa.pnum, pa.sec, null::uuid, null::text, null::integer, null::integer, false, v_listo, v_excl;
    else
      for b in select bu.id, bu.codigo, bu.secuencia, bu.total,
                      exists (select 1 from wms.carga_bultos c where c.bulto_id = bu.id and c.ruta_id = p_ruta and c.estado = 'CARGADO') as cg
                 from wms.bultos bu where bu.salida_id = pa.sid and bu.estado = 'EMBALADO' order by bu.secuencia
      loop
        return query select pa.sid, pa.snum, pa.pnum, pa.sec, b.id, b.codigo, b.secuencia, b.total, b.cg, v_listo, false;
      end loop;
    end if;
  end loop;
end $$;

-- Las salidas que sí salen en esta ruta (vivas y no dejadas fuera).
create or replace function wms._salidas_que_salen(p_ruta uuid) returns table (salida_id uuid)
language sql stable security definer set search_path = wms, pg_temp as $$
  select p.salida_id from wms.ruta_paradas p
   where p.ruta_id = p_ruta and p.activa and p.salida_id is not null
     and not exists (select 1 from wms.carga_exclusiones x where x.ruta_id = p_ruta and x.salida_id = p.salida_id)
$$;

create or replace function wms._exigir_ruta_en_carga(p_ruta uuid) returns wms.rutas
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas;
begin
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('PLANIFICADA', 'LISTA_PARA_CARGA') then
    raise exception 'La ruta ya no está en carga (está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001';
  end if;
  return r;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Checklist, carga y exclusión
-- ─────────────────────────────────────────────────────────────────────────────

-- p_items = [{"item": "…", "ok": true|false, "nota": "…"}]; un punto «no» necesita su nota.
create or replace function wms.guardar_checklist_vehicular(p_ruta uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare x jsonb;
begin
  perform wms._exigir_accion('cargar_ruta', 'No tienes permiso para cargar la unidad');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El checklist no tiene puntos' using errcode = 'P0001'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    if nullif(btrim(coalesce(x->>'item', '')), '') is null or jsonb_typeof(x->'ok') <> 'boolean' then raise exception 'Cada punto del checklist necesita su nombre y un sí o un no' using errcode = 'P0001'; end if;
    if not (x->>'ok')::boolean and nullif(btrim(coalesce(x->>'nota', '')), '') is null then
      raise exception 'Cuenta qué pasa con «%»: un punto en no necesita su nota', x->>'item' using errcode = 'P0001';
    end if;
  end loop;
  update wms.rutas set checklist = p_items, checklist_por = auth.uid(), checklist_en = now() where id = p_ruta;
  perform wms.registrar_audit('checklist_vehicular_guardado', 'rutas', p_ruta::text, null, p_items, null);
end $$;

-- Escanear (o marcar) un bulto: 'CARGADO' o 'YA_CARGADO' (repetir el escaneo no falla ni duplica).
create or replace function wms.cargar_bulto(p_ruta uuid, p_codigo text) returns text
language plpgsql security definer set search_path = wms, pg_temp as $$
declare b wms.bultos; v_cod text := upper(btrim(coalesce(p_codigo, ''))); v_pedido text; v_otra uuid; v_salida text;
begin
  perform wms._exigir_accion('cargar_ruta', 'No tienes permiso para cargar la unidad');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if v_cod = '' then raise exception 'Escanea o escribe el código del bulto' using errcode = 'P0001'; end if;
  select * into b from wms.bultos where codigo = v_cod and estado = 'EMBALADO';
  if not found then
    if exists (select 1 from wms.bultos where codigo = v_cod) then raise exception 'Ese bulto se anuló al reabrir el embalaje: usa la etiqueta nueva' using errcode = 'P0001'; end if;
    raise exception 'No encontramos el bulto %', v_cod using errcode = 'P0001';
  end if;
  select numero into v_salida from wms.salidas where id = b.salida_id;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = b.salida_id) then
    select r.numero into v_pedido from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id where pa.salida_id = b.salida_id and pa.activa and pa.ruta_id <> p_ruta limit 1;
    raise exception 'El bulto % es del pedido de la salida %, que no está en esta ruta%', b.codigo, v_salida, coalesce(' (va en ' || v_pedido || ')', '') using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = b.salida_id) then raise exception 'El pedido de la salida % se dejó fuera de esta salida', v_salida using errcode = 'P0001'; end if;
  if not wms.listo_para_carga(b.salida_id) then
    raise exception 'El pedido de la salida % todavía no está listo para carga: faltan la guía, el paquete documental completo o el embalaje', v_salida using errcode = 'P0001';
  end if;
  select ruta_id into v_otra from wms.carga_bultos where bulto_id = b.id and estado = 'CARGADO';
  if found then
    if v_otra = p_ruta then return 'YA_CARGADO'; end if;
    raise exception 'El bulto % ya está cargado en otra ruta', b.codigo using errcode = 'P0001';
  end if;
  insert into wms.carga_bultos (ruta_id, bulto_id, cargado_por) values (p_ruta, b.id, auth.uid());
  return 'CARGADO';
end $$;

create or replace function wms.retirar_bulto_carga(p_ruta uuid, p_codigo text, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); c wms.carga_bultos; v_cod text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform wms._exigir_accion('cargar_ruta', 'No tienes permiso para cargar la unidad');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if v_mot is null then raise exception 'Cuenta por qué se retira el bulto de la carga' using errcode = 'P0001'; end if;
  select c2.* into c from wms.carga_bultos c2 join wms.bultos b on b.id = c2.bulto_id where c2.ruta_id = p_ruta and c2.estado = 'CARGADO' and b.codigo = v_cod;
  if not found then raise exception 'Ese bulto no está cargado en esta ruta' using errcode = 'P0001'; end if;
  update wms.carga_bultos set estado = 'RETIRADO', retirado_por = auth.uid(), retirado_en = now(), motivo_retiro = v_mot where id = c.id;
end $$;

-- Un pedido al que le falta un bulto (o que no puede salir) se deja fuera de ESTA salida: con motivo, solo quien libera la unidad.
create or replace function wms.excluir_pedido_de_carga(p_ruta uuid, p_salida uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_id uuid := gen_random_uuid();
begin
  perform wms._exigir_accion('liberar_unidad', 'No tienes permiso para dejar un pedido fuera de la salida');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if v_mot is null then raise exception 'Cuenta por qué el pedido se deja fuera de la salida' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida) then raise exception 'Ese pedido ya se dejó fuera de la salida' using errcode = 'P0001'; end if;
  insert into wms.carga_exclusiones (id, ruta_id, salida_id, motivo, por) values (v_id, p_ruta, p_salida, v_mot, auth.uid());
  update wms.carga_bultos c set estado = 'RETIRADO', retirado_por = auth.uid(), retirado_en = now(), motivo_retiro = 'El pedido se dejó fuera de la salida: ' || v_mot
   where c.ruta_id = p_ruta and c.estado = 'CARGADO' and exists (select 1 from wms.bultos b where b.id = c.bulto_id and b.salida_id = p_salida);
  perform wms.registrar_audit('pedido_fuera_de_la_salida', 'rutas', p_ruta::text, null, jsonb_build_object('salida', p_salida), v_mot);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Liberar la unidad y confirmar la salida
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.liberar_unidad(p_ruta uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; s record; v_faltan integer; v_n integer;
begin
  perform wms._exigir_accion('liberar_unidad', 'No tienes permiso para liberar la unidad');
  r := wms._exigir_ruta_en_carga(p_ruta);
  if r.vehiculo_id is null or r.conductor_id is null then raise exception 'La ruta necesita vehículo y conductor para liberar la unidad' using errcode = 'P0001'; end if;
  if r.checklist is null then raise exception 'Falta el checklist del vehículo' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(r.checklist) x where not (x->>'ok')::boolean) then raise exception 'El checklist del vehículo tiene puntos sin cumplir: no se libera la unidad' using errcode = 'P0001'; end if;
  select count(*) into v_n from wms._salidas_que_salen(p_ruta);
  if v_n = 0 then raise exception 'No queda ningún pedido para despachar en esta ruta' using errcode = 'P0001'; end if;
  for s in select q.salida_id, sa.numero from wms._salidas_que_salen(p_ruta) q join wms.salidas sa on sa.id = q.salida_id loop
    if not wms.listo_para_carga(s.salida_id) then raise exception 'El pedido de la salida % no está listo para carga: faltan la guía, el paquete documental completo o el embalaje', s.numero using errcode = 'P0001'; end if;
  end loop;
  select count(*) into v_faltan from wms.bultos b join wms._salidas_que_salen(p_ruta) q on q.salida_id = b.salida_id
   where b.estado = 'EMBALADO' and not exists (select 1 from wms.carga_bultos c where c.bulto_id = b.id and c.ruta_id = p_ruta and c.estado = 'CARGADO');
  if v_faltan > 0 then raise exception 'Faltan % bultos por cargar: cárgalos o deja ese pedido fuera de la salida', v_faltan using errcode = 'P0001'; end if;
  update wms.rutas set estado = 'LIBERADA', liberada_por = auth.uid(), liberada_en = now() where id = p_ruta;
  perform wms.registrar_audit('unidad_liberada', 'rutas', p_ruta::text, null, jsonb_build_object('pedidos', v_n), null);
end $$;

-- «Salida confirmada»: el stock SALE aquí. Una sola transacción (si falla un pedido, no sale ninguno) e idempotente (repetirla no descuenta dos veces).
create or replace function wms.confirmar_salida_ruta(p_ruta uuid, p_token text default null) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; s record; v_n integer := 0; v_tok text; v_pedidos integer := 0;
begin
  perform wms._exigir_accion('confirmar_salida', 'No tienes permiso para confirmar la salida');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado = 'EN_RUTA' then return 0; end if;
  if r.estado <> 'LIBERADA' then raise exception 'La unidad todavía no está liberada: libérala antes de confirmar la salida' using errcode = 'P0001'; end if;
  v_tok := coalesce(nullif(btrim(coalesce(p_token, '')), ''), 'ruta-' || p_ruta::text);
  for s in select q.salida_id from wms._salidas_que_salen(p_ruta) q order by q.salida_id loop
    v_n := v_n + wms.confirmar_salida(s.salida_id, v_tok || ':' || s.salida_id::text);
    v_pedidos := v_pedidos + 1;
  end loop;
  update wms.rutas set estado = 'EN_RUTA', salio_por = auth.uid(), salio_en = now() where id = p_ruta;
  perform wms.registrar_audit('salida_de_ruta_confirmada', 'rutas', p_ruta::text, null, jsonb_build_object('pedidos', v_pedidos, 'reservas', v_n), null);
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.conciliacion_carga(uuid), wms.guardar_checklist_vehicular(uuid, jsonb), wms.cargar_bulto(uuid, text), wms.retirar_bulto_carga(uuid, text, text),
  wms.excluir_pedido_de_carga(uuid, uuid, text), wms.liberar_unidad(uuid), wms.confirmar_salida_ruta(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
