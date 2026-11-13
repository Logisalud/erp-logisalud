-- 0069 · WMS · Pantalla de seguimiento para el cliente (pedidos de distribución) — pedido de Sebas, 2026-11-13
--
-- Se reutiliza el acceso que ya existe (número de pedido + RUC; límite de intentos por pedido, por IP y global; respuesta idéntica para cualquier falla). NO se agregan enlaces nuevos.
-- Lo que cambia es lo que la página recibe y cómo:
--   · 5 pasos, de lo que ya registra el WMS: Pedido recibido (Orden de Salida creada) · Preparando (picking, conformidad, pre-guía y embalaje) · En camino (Salida confirmada) · Llegó (evento «Llegué»
--     de «Mis rutas») · Entregado (evento «Entregado»). «No entregado» y «Rechazado» salen como un solo aviso neutral. Sin hora estimada y sin GPS.
--   · «Van X de Y entregas de tu ruta»: solo cuenta paradas (parámetro `seguimiento_ruta_visible`); sin nombres ni datos de otros clientes; no sale si la ruta tiene una sola parada.
--   · Contacto para «Escribir a mi vendedor» (WhatsApp): SOLO el número del vendedor, de la tabla `contactos_vendedores` (nombre tal como llega de Pedidos → teléfono +51…). Si el vendedor no tiene
--     número cargado no hay botón: NO existe un contacto público de Logisalud (decisión de Sebas). En modo piloto SIEMPRE el número de prueba (`seguimiento_whatsapp_prueba`), nunca el del vendedor real.
--   · «Ver guía de remisión»: solo si la guía fue ACEPTADA y existe su enlace de Nubefact (en modo prueba el enlace no llega: no hay botón, sin error). Parámetro `seguimiento_guia_visible`:
--     `SIEMPRE` (por defecto) o `DESPUES_ENTREGA`.
--   · «¿Cómo fue tu entrega?» (1 = Mal, 2 = Regular, 3 = Muy bien): `seguimiento_responder` guarda UNA respuesta por pedido ya entregado. No se envía a Pedidos.
--   · Una pedido sin parada en una ruta de Logisalud (por ejemplo, provincia por agencia) termina su línea de tiempo en «En camino» (la página no inventa pasos).
-- Todo lo lee `anon` SOLO por las funciones `seguimiento_consultar`, `seguimiento_por_token` (sin cambios de acceso) y `seguimiento_responder`; ninguna tabla tiene permiso para él.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0043, 0047, 0054 y 0068.

insert into wms.parametros (clave, valor, nota) values
  ('seguimiento_ruta_visible', 'true', 'Seguimiento: «Van X de Y entregas de tu ruta» (true/false)'),
  ('seguimiento_guia_visible', 'SIEMPRE', 'Seguimiento: SIEMPRE o DESPUES_ENTREGA (el PDF de la guía trae productos, lotes y datos del conductor)'),
  ('seguimiento_whatsapp_prueba', '', 'Número de prueba (+51…) que usa «Escribir a mi vendedor» en modo piloto; nunca el del vendedor real'),
  ('seguimiento_base_url', '', 'Dirección propia del seguimiento para el go-live (https://…/seguimiento); la usará el botón «Copiar seguimiento» de Pedidos')
on conflict (clave) do nothing;

-- Nombres de vendedores: se comparan sin tildes, sin mayúsculas y sin espacios de más.
create or replace function wms._norm_nombre(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g'))
$$;

-- «+51 987 654 321», «987654321» o «51987654321» → «+51987654321»; otra cosa → null.
create or replace function wms._tel_pe(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when d ~ '^51[0-9]{9}$' then '+' || d when d ~ '^[0-9]{9}$' then '+51' || d else null end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create table if not exists wms.contactos_vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),            -- tal como llega de Pedidos (`vendedor`)
  telefono text not null check (telefono ~ '^\+51[0-9]{9}$'),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);
create unique index if not exists contactos_vendedores_nombre_uk on wms.contactos_vendedores (wms._norm_nombre(nombre));
alter table wms.contactos_vendedores enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'contactos_vendedores' and policyname = 'lectura') then
    create policy lectura on wms.contactos_vendedores for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.contactos_vendedores from anon;
grant select on wms.contactos_vendedores to authenticated;

-- Una respuesta por pedido entregado. Anónima (no guarda quién ni de dónde).
create table if not exists wms.respuestas_entrega (
  pedido_id text primary key,
  valor smallint not null check (valor between 1 and 3),
  respondida_en timestamptz not null default now()
);
alter table wms.respuestas_entrega enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'respuestas_entrega' and policyname = 'lectura') then
    create policy lectura on wms.respuestas_entrega for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.respuestas_entrega from anon;
grant select on wms.respuestas_entrega to authenticated;

-- Los pasos del pedido, con su hora (solo estado y hora). Sustituye la línea de la 0047: ahora son los 5 pasos de la pantalla.
create or replace view wms.v_seguimiento_pedido with (security_invoker = true) as
select pd.pedido_id, pd.numero,
  (select coalesce(jsonb_agg(jsonb_build_object('estado', h.estado, 'en', h.en) order by h.en, h.estado), '[]'::jsonb) from (
      select 'RECIBIDO'::text estado, s.creada_en en from wms.salidas s where s.id = pd.salida_id and s.estado <> 'CANCELADA'
      union all select 'PREPARANDO', least((select min(op.generada_en) from wms.ordenes_picking op where op.salida_id = pd.salida_id), s.conformada_en)
        from wms.salidas s where s.id = pd.salida_id and s.estado <> 'CANCELADA'
      union all select 'EN_CAMINO', coalesce((select min(m.creado_en) from wms.salida_movimientos m where m.salida_id = pd.salida_id and m.tipo = 'SALIDA'),
                                             (select min(r.salio_en) from wms.ruta_paradas p join wms.rutas r on r.id = p.ruta_id where p.pedido_id = pd.pedido_id and p.activa and r.salio_en is not null))
        from wms.salidas s where s.id = pd.salida_id and s.estado <> 'CANCELADA'
      union all select 'LLEGO', min(ev.creado_en) from wms.ruta_paradas p join wms.ruta_paradas_eventos ev on ev.parada_id = p.id and ev.evento = 'LLEGUE' where p.pedido_id = pd.pedido_id and p.activa having min(ev.creado_en) is not null
      union all select case ev.evento when 'ENTREGADO' then 'ENTREGADO' else 'NO_ENTREGADO' end, ev.creado_en
        from wms.ruta_paradas p join wms.ruta_paradas_eventos ev on ev.parada_id = p.id and ev.evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO') where p.pedido_id = pd.pedido_id and p.activa
      union all select 'CANCELADO', pd.importado_en where pd.snapshot->>'estado' = 'CANCELLED'
  ) h where h.en is not null) as hitos
from wms.pedidos_despacho pd where pd.vigente;
revoke all on wms.v_seguimiento_pedido from public, anon;
grant select on wms.v_seguimiento_pedido to authenticated;

-- Todo lo que la página necesita de UN pedido, en un solo JSON (interna: solo la llaman las consultas del seguimiento).
create or replace function wms._seguimiento_datos(p_pedido_id text) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare
  pd record; v_hitos jsonb; v_ruta record; v_total integer; v_atendidas integer; v_ruta_json jsonb; v_vend text; v_tel_v text; v_tel text;
  v_contacto jsonb; v_guia text; v_entregado boolean; v_guia_param text; v_resp smallint; v_prueba boolean := coalesce(wms._modo_piloto(), true);
begin
  select p.pedido_id, p.numero, p.cliente_ruc, p.salida_id, p.snapshot into pd from wms.pedidos_despacho p where p.pedido_id = p_pedido_id and p.vigente limit 1;
  if not found then return null; end if;
  select v.hitos into v_hitos from wms.v_seguimiento_pedido v where v.pedido_id = pd.pedido_id limit 1;
  v_entregado := exists (select 1 from jsonb_array_elements(coalesce(v_hitos, '[]'::jsonb)) h where h->>'estado' = 'ENTREGADO');

  -- la ruta de este pedido y cuántas paradas lleva atendidas (solo cuentas: nada de otros clientes)
  select r.id, r.estado into v_ruta from wms.ruta_paradas p join wms.rutas r on r.id = p.ruta_id where p.pedido_id = pd.pedido_id and p.activa and r.estado <> 'CANCELADA' order by r.fecha desc limit 1;
  if found then
    select count(*), count(*) filter (where exists (select 1 from wms.ruta_paradas_eventos ev where ev.parada_id = p.id and ev.evento in ('ENTREGADO', 'NO_ENTREGADO', 'RECHAZADO')))
      into v_total, v_atendidas from wms.ruta_paradas p where p.ruta_id = v_ruta.id and p.activa;
    if coalesce((select valor from wms.parametros where clave = 'seguimiento_ruta_visible'), 'true') = 'true' and v_total >= 2 and v_ruta.estado in ('EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA') then
      v_ruta_json := jsonb_build_object('atendidas', v_atendidas, 'total', v_total);
    end if;
  end if;

  -- a quién escribir: solo el vendedor del pedido (si tiene número cargado); en modo piloto, solo el número de prueba
  v_vend := nullif(btrim(coalesce(pd.snapshot->>'vendedor', '')), '');
  select c.telefono into v_tel_v from wms.contactos_vendedores c where v_vend is not null and wms._norm_nombre(c.nombre) = wms._norm_nombre(v_vend) limit 1;
  if v_prueba then
    v_tel := nullif(wms._tel_pe((select valor from wms.parametros where clave = 'seguimiento_whatsapp_prueba')), '');
    if v_vend is null then v_tel := null; end if;   -- sin vendedor no hay a quién escribir, ni en la prueba
  else
    v_tel := v_tel_v;                                -- sin número del vendedor no hay botón
  end if;
  v_contacto := case when v_tel is null then null else jsonb_build_object('nombre', v_vend, 'telefono', v_tel) end;

  -- la guía: aceptada y con su enlace de Nubefact (en modo prueba no llega: sin botón)
  v_guia_param := upper(coalesce((select valor from wms.parametros where clave = 'seguimiento_guia_visible'), 'SIEMPRE'));
  if v_guia_param = 'SIEMPRE' or v_entregado then
    select g.enlace into v_guia from wms.guias_remision g where g.salida_id = pd.salida_id and g.estado = 'VIGENTE' and g.estado_sunat = 'ACEPTADA' and nullif(btrim(coalesce(g.enlace, '')), '') ~* '^https?://\S+$'
     order by g.fecha_emision desc nulls last, g.id limit 1;
  end if;

  select r.valor into v_resp from wms.respuestas_entrega r where r.pedido_id = pd.pedido_id;

  return jsonb_build_object('pedido', pd.numero, 'cliente', nullif(btrim(coalesce(pd.snapshot->'cliente'->>'nombre', '')), ''), 'hitos', coalesce(v_hitos, '[]'::jsonb),
    'tiene_parada', v_ruta.id is not null, 'ruta', v_ruta_json, 'contacto', v_contacto, 'guia', case when v_guia is null then null else jsonb_build_object('enlace', v_guia) end,
    'respuesta', v_resp, 'prueba', v_prueba, 'deuda', wms._deuda_cliente(pd.cliente_ruc));
end $$;

-- Las dos consultas públicas (mismo acceso de siempre) devuelven ahora el JSON completo.
create or replace function wms.seguimiento_consultar(p_pedido text, p_ruc text, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_clave text := upper(btrim(coalesce(p_pedido, ''))); v_ruc text := btrim(coalesce(p_ruc, '')); v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; v_pid text;
begin
  if not wms._seguimiento_disponible() then return jsonb_build_object('estado', 'NO_DISPONIBLE'); end if;
  -- sin datos: solo pregunta si el seguimiento está disponible (la página lo usa al abrirse); no cuenta como intento
  if v_clave = '' and v_ruc = '' then return jsonb_build_object('estado', 'LISTO'); end if;
  v_esp := wms._seguimiento_espera(v_ip, v_clave);
  if v_esp > 0 then return jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); end if;
  select pd.pedido_id into v_pid from wms.pedidos_despacho pd where pd.vigente and upper(pd.numero) = v_clave and v_ruc ~ '^[0-9]{11}$' and pd.cliente_ruc = v_ruc limit 1;
  if v_pid is null then
    perform wms._seguimiento_intento(v_ip, left(v_clave, 60), false);
    return jsonb_build_object('estado', 'NO_ENCONTRADO');   -- la misma respuesta si el pedido no existe o el RUC no coincide
  end if;
  perform wms._seguimiento_intento(v_ip, left(v_clave, 60), true);
  return jsonb_build_object('estado', 'OK') || wms._seguimiento_datos(v_pid);
end $$;

create or replace function wms.seguimiento_por_token(p_token text, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; t record; v_datos jsonb;
begin
  if not wms._seguimiento_disponible() then return jsonb_build_object('estado', 'NO_DISPONIBLE'); end if;
  v_esp := wms._seguimiento_espera(v_ip, 'token');
  if v_esp > 0 then return jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); end if;
  select * into t from wms.seguimiento_tokens where token_hash = wms._seguimiento_hash(btrim(coalesce(p_token, ''))) and revocado_en is null and vence_en > now();
  if not found then
    perform wms._seguimiento_intento(v_ip, 'token', false);
    return jsonb_build_object('estado', 'NO_ENCONTRADO');
  end if;
  v_datos := wms._seguimiento_datos(t.pedido_id);
  if v_datos is null then perform wms._seguimiento_intento(v_ip, 'token', false); return jsonb_build_object('estado', 'NO_ENCONTRADO'); end if;
  return jsonb_build_object('estado', 'OK') || v_datos;
end $$;

-- La carita: una respuesta por pedido entregado. Mismo acceso, mismo límite y misma respuesta idéntica que la consulta.
create or replace function wms.seguimiento_responder(p_pedido text, p_ruc text, p_valor integer, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_clave text := upper(btrim(coalesce(p_pedido, ''))); v_ruc text := btrim(coalesce(p_ruc, '')); v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; v_pid text; v_n integer;
begin
  if not wms._seguimiento_disponible() then return jsonb_build_object('estado', 'NO_DISPONIBLE'); end if;
  v_esp := wms._seguimiento_espera(v_ip, v_clave);
  if v_esp > 0 then return jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); end if;
  select pd.pedido_id into v_pid from wms.pedidos_despacho pd where pd.vigente and upper(pd.numero) = v_clave and v_ruc ~ '^[0-9]{11}$' and pd.cliente_ruc = v_ruc limit 1;
  if v_pid is null then
    perform wms._seguimiento_intento(v_ip, left(v_clave, 60), false);
    return jsonb_build_object('estado', 'NO_ENCONTRADO');
  end if;
  perform wms._seguimiento_intento(v_ip, left(v_clave, 60), true);
  if p_valor is null or p_valor not between 1 and 3 then return jsonb_build_object('estado', 'ERROR'); end if;
  if not exists (select 1 from wms.ruta_paradas p join wms.ruta_paradas_eventos ev on ev.parada_id = p.id and ev.evento = 'ENTREGADO' where p.pedido_id = v_pid and p.activa) then
    return jsonb_build_object('estado', 'AUN_NO');
  end if;
  insert into wms.respuestas_entrega (pedido_id, valor) values (v_pid, p_valor) on conflict (pedido_id) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('estado', case when v_n = 1 then 'OK' else 'YA_RESPONDIDA' end);
end $$;

-- Del Administrador (permiso `configurar`): los contactos de los vendedores y las opciones del seguimiento.
create or replace function wms.guardar_contacto_vendedor(p_nombre text, p_telefono text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_nombre text := btrim(coalesce(p_nombre, '')); v_tel text := wms._tel_pe(p_telefono); v_id uuid;
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para editar los contactos de los vendedores');
  if v_nombre = '' then raise exception 'Escribe el nombre del vendedor, tal como llega de Pedidos' using errcode = 'P0001'; end if;
  if v_tel is null then raise exception 'El teléfono debe ser de 9 dígitos, por ejemplo 987654321 o +51 987 654 321' using errcode = 'P0001'; end if;
  insert into wms.contactos_vendedores (nombre, telefono, actualizado_por) values (v_nombre, v_tel, auth.uid())
  on conflict (wms._norm_nombre(nombre)) do update set nombre = excluded.nombre, telefono = excluded.telefono, actualizado_por = auth.uid(), actualizado_en = now()
  returning id into v_id;
  perform wms.registrar_audit('contacto_vendedor_guardado', 'contactos_vendedores', v_id::text, null, jsonb_build_object('nombre', v_nombre), null);
  return v_id;
end $$;

create or replace function wms.eliminar_contacto_vendedor(p_id uuid) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_nombre text;
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para editar los contactos de los vendedores');
  delete from wms.contactos_vendedores where id = p_id returning nombre into v_nombre;
  if v_nombre is null then return false; end if;
  perform wms.registrar_audit('contacto_vendedor_eliminado', 'contactos_vendedores', p_id::text, null, jsonb_build_object('nombre', v_nombre), null);
  return true;
end $$;

-- Carga por CSV: [{nombre, telefono}, …]. Guarda las filas buenas y dice cuáles no (fila, nombre y motivo); no es todo o nada.
create or replace function wms.cargar_contactos_vendedores(p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare f jsonb; i integer := 0; v_ok integer := 0; v_err jsonb := '[]'::jsonb; v_nombre text; v_tel text;
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para editar los contactos de los vendedores');
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then raise exception 'El archivo no trae filas' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_filas) > 2000 then raise exception 'El archivo trae demasiadas filas (máximo 2000)' using errcode = 'P0001'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1; v_nombre := btrim(coalesce(f->>'nombre', '')); v_tel := wms._tel_pe(f->>'telefono');
    if v_nombre = '' then v_err := v_err || jsonb_build_object('fila', i, 'nombre', v_nombre, 'motivo', 'Falta el nombre'); continue; end if;
    if v_tel is null then v_err := v_err || jsonb_build_object('fila', i, 'nombre', v_nombre, 'motivo', 'El teléfono no tiene 9 dígitos'); continue; end if;
    insert into wms.contactos_vendedores (nombre, telefono, actualizado_por) values (v_nombre, v_tel, auth.uid())
    on conflict (wms._norm_nombre(nombre)) do update set nombre = excluded.nombre, telefono = excluded.telefono, actualizado_por = auth.uid(), actualizado_en = now();
    v_ok := v_ok + 1;
  end loop;
  perform wms.registrar_audit('contactos_vendedores_cargados', 'contactos_vendedores', 'csv', null, jsonb_build_object('guardados', v_ok, 'con_error', jsonb_array_length(v_err)), null);
  return jsonb_build_object('guardados', v_ok, 'errores', v_err);
end $$;

create or replace function wms.guardar_opcion_seguimiento(p_clave text, p_valor text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v text := btrim(coalesce(p_valor, ''));
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para cambiar las opciones del seguimiento');
  if p_clave = 'seguimiento_ruta_visible' then
    if v not in ('true', 'false') then raise exception 'Elige si se muestra o no' using errcode = 'P0001'; end if;
  elsif p_clave = 'seguimiento_guia_visible' then
    v := upper(v); if v not in ('SIEMPRE', 'DESPUES_ENTREGA') then raise exception 'Elige «siempre» o «solo después de entregado»' using errcode = 'P0001'; end if;
  elsif p_clave = 'seguimiento_whatsapp_prueba' then
    if v <> '' then v := coalesce(wms._tel_pe(v), null); if v is null then raise exception 'El teléfono debe ser de 9 dígitos, por ejemplo 987654321' using errcode = 'P0001'; end if; end if;
  elsif p_clave = 'seguimiento_base_url' then
    if v <> '' and v !~* '^https://\S+$' then raise exception 'La dirección empieza con https://' using errcode = 'P0001'; end if;
  else raise exception 'Esa opción no se cambia aquí' using errcode = 'P0001'; end if;
  update wms.parametros set valor = v where clave = p_clave;
  perform wms.registrar_audit('opcion_seguimiento_cambiada', 'parametros', p_clave, null, jsonb_build_object('clave', p_clave), null);
end $$;

-- Permisos (default-deny): el cliente sin usuario llama solo a las tres funciones del seguimiento.
revoke execute on all functions in schema wms from public;
grant usage on schema wms to anon;
revoke all on all tables in schema wms from anon;
grant execute on function wms.seguimiento_consultar(text, text, text), wms.seguimiento_por_token(text, text), wms.seguimiento_responder(text, text, integer, text) to anon, authenticated;
grant execute on function wms.guardar_contacto_vendedor(text, text), wms.eliminar_contacto_vendedor(uuid), wms.cargar_contactos_vendedores(jsonb), wms.guardar_opcion_seguimiento(text, text) to authenticated;
