-- 0067 · WMS · Stock del cliente de almacenamiento: página de SOLO LECTURA con enlace de token (decisión de Sebas, 2026-11-13)
--
-- Los clientes que guardan su mercadería (Diphasac, AJR Labs, Medic Pharma Lab, Triamed) abren un enlace y ven, en tiempo real, SU stock por producto y lote (sin ubicaciones), lo que ya venció o vence
-- pronto, y descargan SU Kardex en Excel con el modelo de Logisalud. Todavía NO crean salidas (las hace Logisalud); el usuario y la contraseña llegan después (D-67 / D-68: SEC1).
--   · Mismo patrón que el seguimiento de pedidos (0047): el cliente sin usuario (rol `anon`) llama SOLO a dos funciones; ninguna tabla tiene permiso para `anon`. Por eso no depende de SEC1 (no abre
--     ninguna política de lectura a usuarios autenticados).
--   · Interruptor `stock_cliente_habilitado` (apagado de fábrica; solo lo enciende un administrador de la base: un disparador se lo impide a la aplicación).
--   · Enlace con token de 4 UUID (≈488 bits); en la base solo queda su hash SHA-256, con vigencia (1 a 365 días) y revocable. Lo genera quien tiene el permiso `configurar` (Administrador).
--   · Límite de intentos fallidos reutilizando `seguimiento_intentos` (clave `stock-token`): respuesta idéntica si el enlace no existe, venció o se revocó.
--   · Qué ve: por producto y lote, el stock en almacén, lo disponible (aprobado menos lo comprometido en sus salidas), lo que está en revisión de Calidad y el vencimiento. Las bajas y rechazados no cuentan.
--     Nunca ubicaciones, precios ni datos del personal. El Kardex sale de `kardex_filas` (el libro mayor) sin la ubicación.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0012, 0028 y 0047.

insert into wms.parametros (clave, valor, nota) values
  ('stock_cliente_habilitado', 'false', 'Stock del cliente (enlace de solo lectura): apagado de fábrica. Solo lo enciende un administrador de la base, con aprobación de Sebas.')
on conflict (clave) do nothing;

-- La aplicación (authenticated o anon) no puede tocar los tres interruptores.
create or replace function wms.trg_proteger_acceso_clientes()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(new.clave, old.clave) in ('acceso_clientes_habilitado', 'seguimiento_cliente_habilitado', 'stock_cliente_habilitado') then
    raise exception 'Este interruptor solo lo habilita un administrador de la base (D-68, G.2)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create or replace function wms._stock_cliente_disponible() returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select valor from wms.parametros where clave = 'stock_cliente_habilitado'), 'false') = 'true'
$$;

create table if not exists wms.enlaces_stock_cliente (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null references wms.propietarios(id),
  etiqueta text,                                     -- para quién es («Sandra, compras de AJR»); solo lo ve el personal
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  revocado_en timestamptz,
  revocado_por uuid,
  ultima_vista_en timestamptz,
  check (vence_en > creado_en)
);
alter table wms.enlaces_stock_cliente enable row level security;
create index if not exists enlaces_stock_cliente_prop_idx on wms.enlaces_stock_cliente (propietario_id);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'enlaces_stock_cliente' and policyname = 'lectura') then
    create policy lectura on wms.enlaces_stock_cliente for select to authenticated using (wms.es_usuario());
  end if;
end $$;
revoke all on wms.enlaces_stock_cliente from anon;
grant select on wms.enlaces_stock_cliente to authenticated;

-- Resuelve el enlace: el propietario al que pertenece, o la respuesta (no disponible, espera, no encontrado) si no vale. Un enlace inválido, vencido o revocado responde siempre lo mismo.
create or replace function wms._stock_cliente_acceso(p_token text, p_ip text, out o_propietario uuid, out o_resp jsonb)
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_ip text := wms._seguimiento_hash(p_ip); v_esp integer; t record;
begin
  if not wms._stock_cliente_disponible() then o_resp := jsonb_build_object('estado', 'NO_DISPONIBLE'); return; end if;
  v_esp := wms._seguimiento_espera(v_ip, 'stock-token');
  if v_esp > 0 then o_resp := jsonb_build_object('estado', 'ESPERA', 'espera_segundos', v_esp); return; end if;
  select e.id, e.propietario_id into t from wms.enlaces_stock_cliente e
   where e.token_hash = wms._seguimiento_hash(btrim(coalesce(p_token, ''))) and e.revocado_en is null and e.vence_en > now()
     and exists (select 1 from wms.propietarios o where o.id = e.propietario_id and o.activo and not o.es_dueno_almacen);
  if not found then
    perform wms._seguimiento_intento(v_ip, 'stock-token', false);
    o_resp := jsonb_build_object('estado', 'NO_ENCONTRADO');
    return;
  end if;
  update wms.enlaces_stock_cliente set ultima_vista_en = now() where id = t.id;
  o_propietario := t.propietario_id;
end $$;

-- El stock del cliente: por producto y lote. Sin ubicaciones.
create or replace function wms.stock_cliente_por_token(p_token text, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_prop uuid; v_resp jsonb; v_hoy date := wms._hoy_lima(); v_cli record; v_prods jsonb; v_tramos text;
begin
  select a.o_propietario, a.o_resp into v_prop, v_resp from wms._stock_cliente_acceso(p_token, p_ip) a;
  if v_prop is null then return v_resp; end if;
  select o.codigo, o.razon_social into v_cli from wms.propietarios o where o.id = v_prop;
  v_tramos := coalesce(nullif(btrim((select valor from wms.parametros where clave = 'vencimiento_tramos_dias')), ''), '90,180,365');
  select coalesce(jsonb_agg(x.p order by x.cod), '[]'::jsonb) into v_prods from (
    select pr.codigo as cod, jsonb_build_object(
        'producto_id', pr.id, 'codigo', pr.codigo, 'descripcion', pr.descripcion, 'presentacion', pr.presentacion,
        'codigo_cliente', (select pc.codigo from wms.producto_codigos pc where pc.producto_id = pr.id and pc.tipo = 'CLIENTE' and pc.propietario_id = v_prop order by pc.creado_en limit 1),
        'stock', sum(l.stock)::integer, 'disponible', sum(l.disponible)::integer, 'en_revision', sum(l.en_revision)::integer,
        'vencido', coalesce(sum(l.stock) filter (where l.vence < v_hoy), 0)::integer,
        'lotes', jsonb_agg(jsonb_build_object('lote_id', l.lote_id, 'lote', l.lote, 'vence', l.vence, 'dias', (l.vence - v_hoy), 'vencido', coalesce(l.vence < v_hoy, false),
                                                'stock', l.stock, 'disponible', l.disponible, 'en_revision', l.en_revision) order by l.vence nulls last, l.lote)) as p
      from (
        select sa.producto_id, sa.lote_id, lo.codigo as lote, lo.vence,
               coalesce(sum(sa.cantidad) filter (where sa.estado <> 'BAJAS_RECHAZADOS'), 0)::integer as stock,
               coalesce(sum(sa.cantidad) filter (where sa.estado in ('CUARENTENA', 'DEVOLUCIONES')), 0)::integer as en_revision,
               greatest(coalesce(sum(sa.cantidad - wms._comprometido(sa.posicion_id, sa.lote_id, sa.estado, sa.procedencia_id)) filter (where sa.estado = 'APROBADO' and ps.tipo_area = 'APROBADOS'), 0), 0)::integer as disponible
          from wms.saldos sa
          join wms.lotes lo on lo.id = sa.lote_id
          join wms.posiciones ps on ps.id = sa.posicion_id
         where sa.propietario_id = v_prop and sa.cantidad > 0
         group by sa.producto_id, sa.lote_id, lo.codigo, lo.vence
        having coalesce(sum(sa.cantidad) filter (where sa.estado <> 'BAJAS_RECHAZADOS'), 0) > 0
      ) l join catalogo.productos pr on pr.id = l.producto_id
     group by pr.id, pr.codigo, pr.descripcion, pr.presentacion
  ) x;
  return jsonb_build_object('estado', 'OK', 'cliente', jsonb_build_object('codigo', v_cli.codigo, 'nombre', v_cli.razon_social),
                            'hoy', v_hoy, 'actualizado_en', now(), 'tramos', v_tramos, 'productos', v_prods);
end $$;

-- El Kardex del cliente (el modelo de Logisalud, sin la ubicación): de un producto o de todos los suyos, entre dos fechas (hora de Lima).
create or replace function wms.kardex_cliente_por_token(p_token text, p_producto uuid default null, p_desde date default null, p_hasta date default null, p_ip text default '') returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_prop uuid; v_resp jsonb; v_prods jsonb; v_cli record;
begin
  select a.o_propietario, a.o_resp into v_prop, v_resp from wms._stock_cliente_acceso(p_token, p_ip) a;
  if v_prop is null then return v_resp; end if;
  select o.codigo, o.razon_social into v_cli from wms.propietarios o where o.id = v_prop;
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', x.id, 'codigo', x.codigo, 'descripcion', x.descripcion,
    'filas', (select coalesce(jsonb_agg(jsonb_build_object(
        'orden', k.orden, 'es_saldo_inicial', k.es_saldo_inicial, 'fecha', k.fecha, 'tipo_documento', k.tipo_documento, 'numero_acta', k.numero_acta, 'fecha_acta', k.fecha_acta,
        'lote', k.lote, 'contraparte', k.contraparte, 'ruc', k.ruc, 'tipo_doc_ref', k.tipo_doc_ref, 'numero_doc_ref', k.numero_doc_ref,
        'entrada', k.entrada, 'salida', k.salida, 'saldo', k.saldo, 'tipo_ingreso', k.tipo_ingreso, 'propietario', k.propietario, 'es_reversa', k.es_reversa) order by k.orden), '[]'::jsonb)
                from wms.kardex_filas(x.id, null, v_prop, p_desde, p_hasta) k)) order by x.codigo), '[]'::jsonb) into v_prods
    from (select distinct pr.id, pr.codigo, pr.descripcion from wms.lotes lo join catalogo.productos pr on pr.id = lo.producto_id
           where lo.propietario_id = v_prop and (p_producto is null or pr.id = p_producto)) x;
  return jsonb_build_object('estado', 'OK', 'cliente', jsonb_build_object('codigo', v_cli.codigo, 'nombre', v_cli.razon_social), 'hoy', wms._hoy_lima(),
                            'formato', coalesce(nullif(btrim((select valor from wms.parametros where clave = 'kardex_codigo_formato')), ''), 'LS-FR-KDX (provisional)'), 'productos', v_prods);
end $$;

-- Del personal (permiso `configurar`: el Administrador): genera el enlace de un cliente. El token en claro se devuelve UNA vez; en la base solo queda su hash.
create or replace function wms.crear_enlace_stock_cliente(p_propietario uuid, p_dias integer default 90, p_etiqueta text default null) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_token text; v_id uuid := gen_random_uuid(); v_dias integer := coalesce(p_dias, 90); v_et text := nullif(btrim(coalesce(p_etiqueta, '')), ''); o record;
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para generar el enlace de stock de un cliente');
  if not wms._stock_cliente_disponible() then raise exception 'El stock para el cliente aún no está disponible' using errcode = 'P0001'; end if;
  if v_dias < 1 or v_dias > 365 then raise exception 'El enlace dura entre 1 y 365 días' using errcode = 'P0001'; end if;
  select id, codigo, activo, es_dueno_almacen into o from wms.propietarios where id = p_propietario;
  if not found or not o.activo then raise exception 'No encontramos a ese cliente' using errcode = 'P0001'; end if;
  if o.es_dueno_almacen then raise exception 'El enlace es para clientes que guardan su mercadería, no para el stock propio' using errcode = 'P0001'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into wms.enlaces_stock_cliente (id, propietario_id, etiqueta, token_hash, creado_por, vence_en)
  values (v_id, o.id, v_et, wms._seguimiento_hash(v_token), auth.uid(), now() + make_interval(days => v_dias));
  perform wms.registrar_audit('stock_cliente_enlace_creado', 'enlaces_stock_cliente', v_id::text, null, jsonb_build_object('propietario', o.codigo, 'dias', v_dias, 'etiqueta', v_et), null);
  return jsonb_build_object('id', v_id, 'token', v_token, 'vence_en', now() + make_interval(days => v_dias));
end $$;

create or replace function wms.revocar_enlace_stock_cliente(p_enlace uuid) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare e record;
begin
  perform wms._exigir_accion('configurar', 'No tienes permiso para revocar el enlace de stock de un cliente');
  select x.id, o.codigo into e from wms.enlaces_stock_cliente x join wms.propietarios o on o.id = x.propietario_id where x.id = p_enlace and x.revocado_en is null for update of x;
  if not found then return false; end if;
  update wms.enlaces_stock_cliente set revocado_en = now(), revocado_por = auth.uid() where id = e.id;
  perform wms.registrar_audit('stock_cliente_enlace_revocado', 'enlaces_stock_cliente', e.id::text, null, jsonb_build_object('propietario', e.codigo), null);
  return true;
end $$;

-- Permisos (default-deny): el cliente sin usuario solo llama a las dos consultas.
revoke execute on all functions in schema wms from public;
grant usage on schema wms to anon;
revoke all on all tables in schema wms from anon;
grant execute on function wms.stock_cliente_por_token(text, text), wms.kardex_cliente_por_token(text, uuid, date, date, text) to anon, authenticated;
grant execute on function wms.crear_enlace_stock_cliente(uuid, integer, text), wms.revocar_enlace_stock_cliente(uuid) to authenticated;
