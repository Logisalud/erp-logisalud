-- 0047 · WMS · Piloto (Fase 4, P9; G.2): seguimiento para el cliente, APAGADO en modo piloto
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0012, 0017, 0021, 0023, 0038 y 0043 (usa `ruta_paradas_eventos`).
--   · Parámetro `seguimiento_cliente_habilitado` (apagado). Solo lo cambia un administrador de la base (un disparador lo impide a la aplicación). Aunque se encienda, con `modo_piloto = si`
--     el seguimiento NO está disponible: no se genera ningún enlace y las consultas responden «aún no disponible».
--   · El cliente (sin usuario, rol `anon`) llama SOLO a dos funciones: `seguimiento_consultar(pedido, ruc, ip)` y `seguimiento_por_token(token, ip)`. Ven únicamente los hitos del pedido con fecha y hora
--     (recibido, en preparación, listo, en ruta, entregado o no entregado): sin hora estimada, sin precios, lotes ni datos del personal. Las tablas no tienen ningún permiso para `anon`.
--   · Límite de intentos (`seguimiento_intentos`): por pedido (5 fallos en 15 minutos), por IP (8) y global (300); con espera y sin revelar si el pedido existe (la respuesta es la misma si el
--     pedido no existe o el RUC no coincide). La IP la manda la aplicación: el límite por pedido es el que no se puede esquivar.
--   · Enlace con token: 4 UUID aleatorios (≈488 bits) pegados; solo se guarda su hash SHA-256, con vigencia y revocable. `crear_enlace_seguimiento` y `revocar_*` son del personal (permiso
--     `preparar_salidas`). El botón «Copiar enlace de seguimiento» de Pedidos NO se implementa aquí (docs/wms/piloto/seguimiento-cliente.md).

insert into wms.parametros (clave, valor, nota) values
  ('seguimiento_cliente_habilitado', 'false', 'P9 (G.2): apagado. Solo lo enciende un administrador de la base, con aprobación de Sebas; con modo_piloto = si el seguimiento sigue no disponible.')
on conflict (clave) do nothing;

-- La aplicación (authenticated o anon) no puede tocar los dos interruptores.
create or replace function wms.trg_proteger_acceso_clientes()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(new.clave, old.clave) in ('acceso_clientes_habilitado', 'seguimiento_cliente_habilitado') then
    raise exception 'Este interruptor solo lo habilita un administrador de la base (D-68, G.2)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create or replace function wms._seguimiento_disponible() returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select not coalesce(wms._modo_piloto(), true) and coalesce((select valor from wms.parametros where clave = 'seguimiento_cliente_habilitado'), 'false') = 'true'
$$;

create table if not exists wms.seguimiento_tokens (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null,                          -- el id del pedido en Pedidos
  pedido_numero text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  revocado_en timestamptz,
  revocado_por uuid,
  check (vence_en > creado_en)
);
alter table wms.seguimiento_tokens enable row level security;
create index if not exists seguimiento_tokens_pedido_idx on wms.seguimiento_tokens (pedido_id);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'seguimiento_tokens' and policyname = 'lectura') then
    create policy lectura on wms.seguimiento_tokens for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.seguimiento_tokens from anon;
grant select on wms.seguimiento_tokens to authenticated;

create table if not exists wms.seguimiento_intentos (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  clave text not null,                              -- el número de pedido que se escribió (o 'token'), en mayúsculas
  ok boolean not null,
  en timestamptz not null default now()
);
alter table wms.seguimiento_intentos enable row level security;
create index if not exists seguimiento_intentos_en_idx on wms.seguimiento_intentos (en);
create index if not exists seguimiento_intentos_clave_idx on wms.seguimiento_intentos (clave, en) where not ok;
create index if not exists seguimiento_intentos_ip_idx on wms.seguimiento_intentos (ip_hash, en) where not ok;
revoke all on wms.seguimiento_intentos from anon, authenticated;

-- La vista mínima: número de pedido y sus hitos (solo estado y hora; nada de precios, lotes ni personal). Respeta al que consulta: el personal ve lo suyo por RLS, el cliente no ve nada y
-- `anon` no tiene permiso; las funciones de más abajo la leen como dueñas.
create or replace view wms.v_seguimiento_pedido with (security_invoker = true) as
select pd.pedido_id, pd.numero,
  (select coalesce(jsonb_agg(jsonb_build_object('estado', h.estado, 'en', h.en) order by h.en, h.estado), '[]'::jsonb) from (
      select 'RECIBIDO'::text estado, (select min(x.importado_en) from wms.pedidos_despacho x where x.pedido_id = pd.pedido_id) en
      union all select 'EN_PREPARACION', s.creada_en from wms.salidas s where s.id = pd.salida_id and s.estado <> 'CANCELADA'
      union all select 'LISTO', s.conformada_en from wms.salidas s where s.id = pd.salida_id and s.estado <> 'CANCELADA' and s.conformada_en is not null
      union all select 'EN_RUTA', min(r.salio_en) from wms.ruta_paradas p join wms.rutas r on r.id = p.ruta_id where p.pedido_id = pd.pedido_id and p.activa and r.salio_en is not null having min(r.salio_en) is not null
      union all select case ev.evento when 'ENTREGADO' then 'ENTREGADO' else 'NO_ENTREGADO' end, ev.creado_en
        from wms.ruta_paradas p join wms.ruta_paradas_eventos ev on ev.parada_id = p.id and ev.evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO') where p.pedido_id = pd.pedido_id and p.activa
      union all select 'CANCELADO', pd.importado_en where pd.snapshot->>'estado' = 'CANCELLED'
  ) h where h.en is not null) as hitos
from wms.pedidos_despacho pd where pd.vigente;
revoke all on wms.v_seguimiento_pedido from public, anon;
grant select on wms.v_seguimiento_pedido to authenticated;

-- Espera (en segundos) si ya hubo demasiados intentos fallidos; 0 si puede intentar.
create or replace function wms._seguimiento_espera(p_ip text, p_clave text) returns integer
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_n integer; v_primero timestamptz; v_max integer := 0;
begin
  select count(*), min(en) into v_n, v_primero from wms.seguimiento_intentos where clave = p_clave and not ok and en > now() - interval '15 minutes';
  if v_n >= 5 then v_max := greatest(v_max, ceil(extract(epoch from (v_primero + interval '15 minutes' - now())))::integer); end if;
  select count(*), min(en) into v_n, v_primero from wms.seguimiento_intentos where ip_hash = p_ip and not ok and en > now() - interval '15 minutes';
  if v_n >= 8 then v_max := greatest(v_max, ceil(extract(epoch from (v_primero + interval '15 minutes' - now())))::integer); end if;
  select count(*), min(en) into v_n, v_primero from wms.seguimiento_intentos where not ok and en > now() - interval '15 minutes';
  if v_n >= 300 then v_max := greatest(v_max, ceil(extract(epoch from (v_primero + interval '15 minutes' - now())))::integer); end if;
  return greatest(v_max, 0);
end $$;

create or replace function wms._seguimiento_intento(p_ip text, p_clave text, p_ok boolean) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  insert into wms.seguimiento_intentos (ip_hash, clave, ok) values (p_ip, p_clave, p_ok);
  delete from wms.seguimiento_intentos where en < now() - interval '2 days';
end $$;

create or replace function wms._seguimiento_hash(p text) returns text
language sql immutable set search_path = pg_catalog as $$ select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex') $$;

create or replace function wms.seguimiento_consultar(p_pedido text, p_ruc text, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_clave text := upper(btrim(coalesce(p_pedido, ''))); v_ruc text := btrim(coalesce(p_ruc, '')); v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; v_fila record;
begin
  if not wms._seguimiento_disponible() then return jsonb_build_object('estado', 'NO_DISPONIBLE'); end if;
  -- sin datos: solo pregunta si el seguimiento está disponible (la página lo usa al abrirse); no cuenta como intento
  if v_clave = '' and v_ruc = '' then return jsonb_build_object('estado', 'LISTO'); end if;
  v_esp := wms._seguimiento_espera(v_ip, v_clave);
  if v_esp > 0 then return jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); end if;
  select v.numero, v.hitos into v_fila from wms.v_seguimiento_pedido v join wms.pedidos_despacho pd on pd.pedido_id = v.pedido_id and pd.vigente
   where upper(v.numero) = v_clave and v_ruc ~ '^[0-9]{11}$' and pd.cliente_ruc = v_ruc limit 1;
  if not found then
    perform wms._seguimiento_intento(v_ip, left(v_clave, 60), false);
    return jsonb_build_object('estado', 'NO_ENCONTRADO');   -- la misma respuesta si el pedido no existe o el RUC no coincide
  end if;
  perform wms._seguimiento_intento(v_ip, left(v_clave, 60), true);
  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos);
end $$;

create or replace function wms.seguimiento_por_token(p_token text, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; t record; v_fila record;
begin
  if not wms._seguimiento_disponible() then return jsonb_build_object('estado', 'NO_DISPONIBLE'); end if;
  v_esp := wms._seguimiento_espera(v_ip, 'token');
  if v_esp > 0 then return jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); end if;
  select * into t from wms.seguimiento_tokens where token_hash = wms._seguimiento_hash(btrim(coalesce(p_token, ''))) and revocado_en is null and vence_en > now();
  if not found then
    perform wms._seguimiento_intento(v_ip, 'token', false);
    return jsonb_build_object('estado', 'NO_ENCONTRADO');
  end if;
  select v.numero, v.hitos into v_fila from wms.v_seguimiento_pedido v where v.pedido_id = t.pedido_id limit 1;
  if not found then perform wms._seguimiento_intento(v_ip, 'token', false); return jsonb_build_object('estado', 'NO_ENCONTRADO'); end if;
  return jsonb_build_object('estado', 'OK', 'pedido', v_fila.numero, 'hitos', v_fila.hitos);
end $$;

-- Del personal: genera el enlace (el token en claro se devuelve UNA vez; en la base solo queda su hash).
create or replace function wms.crear_enlace_seguimiento(p_pedido_numero text, p_dias integer default 30) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_token text; v_pd record; v_id uuid := gen_random_uuid(); v_dias integer := coalesce(p_dias, 30);
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para generar enlaces de seguimiento');
  if not wms._seguimiento_disponible() then raise exception 'Seguimiento aún no disponible' using errcode = 'P0001'; end if;
  if v_dias < 1 or v_dias > 90 then raise exception 'El enlace dura entre 1 y 90 días' using errcode = 'P0001'; end if;
  select pedido_id, numero into v_pd from wms.pedidos_despacho where upper(numero) = upper(btrim(coalesce(p_pedido_numero, ''))) and vigente limit 1;
  if not found then raise exception 'No encontramos ese pedido' using errcode = 'P0001'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into wms.seguimiento_tokens (id, pedido_id, pedido_numero, token_hash, creado_por, vence_en)
  values (v_id, v_pd.pedido_id, v_pd.numero, wms._seguimiento_hash(v_token), auth.uid(), now() + make_interval(days => v_dias));
  perform wms.registrar_audit('seguimiento_enlace_creado', 'seguimiento_tokens', v_id::text, null, jsonb_build_object('pedido', v_pd.numero, 'dias', v_dias), null);
  return jsonb_build_object('id', v_id, 'token', v_token, 'vence_en', now() + make_interval(days => v_dias));
end $$;

create or replace function wms.revocar_enlaces_seguimiento(p_pedido_numero text) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_n integer;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para revocar enlaces de seguimiento');
  update wms.seguimiento_tokens set revocado_en = now(), revocado_por = auth.uid() where upper(pedido_numero) = upper(btrim(coalesce(p_pedido_numero, ''))) and revocado_en is null;
  get diagnostics v_n = row_count;
  perform wms.registrar_audit('seguimiento_enlaces_revocados', 'seguimiento_tokens', coalesce(p_pedido_numero, ''), null, jsonb_build_object('revocados', v_n), null);
  return v_n;
end $$;

-- Permisos (default-deny): el cliente sin usuario solo llama a las dos consultas.
revoke execute on all functions in schema wms from public;
grant usage on schema wms to anon;
revoke all on all tables in schema wms from anon;
grant execute on function wms.seguimiento_consultar(text, text, text), wms.seguimiento_por_token(text, text) to anon, authenticated;
grant execute on function wms.crear_enlace_seguimiento(text, integer), wms.revocar_enlaces_seguimiento(text) to authenticated;
