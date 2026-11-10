-- 0038 · WMS · Piloto: seguridad (modo piloto, copia inmutable de las órdenes de compra, nada hacia Pedidos)
--
-- Tres piezas, todas aditivas y re-ejecutables. Se aplica a mano (nunca al mergear). Requiere 0034 y 0036. Termina con el `revoke execute … from public`.
--
--   1. `modo_piloto` (parámetro `si` | `no`, validado). Mientras esté en `si` (el valor con el que nace, y el que se asume si el parámetro faltara) el WMS se comporta como piloto:
--      banner y marca de agua en la aplicación, Nubefact solo DEMO y NADA sale hacia Pedidos. Apagarlo es parte del go-live y lo hace el Administrador junto con las variables de entorno.
--   2. Lo que el WMS manda a Pedidos queda RETENIDO: con `modo_piloto = si`, los eventos de `wms.eventos_pedidos` (guía emitida / guía anulada, con el número de guía y las líneas
--      conformadas) nacen con estado `RETENIDO_PILOTO`, que no es entregable: ni la aplicación los envía ni `marcar_evento_pedidos` los puede dar por enviados. Recibir pedidos sigue igual.
--      Hoy no existe ninguna publicación de stock hacia Pedidos; si se agregara, tendría que pasar por esta misma retención.
--   3. Copia inmutable de cada orden de compra (A.1): `wms.oc_versiones` (solo se agregan filas; nunca se actualiza ni se borra) y las funciones `wms.sincronizar_oc(oc)` y
--      `wms.sincronizar_ocs_abiertas()`, que LEEN Compras (`wms.v_oc_lineas`) y crean la versión 1 o, si el contenido cambió, una versión nueva con la alerta `OC_CAMBIADA`.
--      El WMS no escribe nada en Compras ni en el catálogo desde esta migración (lo vigila `tests/db/solo-lee-compras.test.ts`).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Parámetro `modo_piloto`
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('modo_piloto', 'si', 'si = piloto (banner «PILOTO, datos de prueba», marca de agua «PILOTO, SIN VALOR» en todos los PDF, Nubefact solo DEMO y nada se envía a Pedidos); no = go-live. Lo cambia el Administrador junto con WMS_GO_LIVE=1 en producción.')
on conflict (clave) do nothing;

-- Misma función de la 0036 más una regla: `modo_piloto` solo admite si o no.
create or replace function wms.trg_validar_parametro() returns trigger
language plpgsql as $$
declare v text := btrim(coalesce(new.valor, ''));
begin
  if new.clave like 'guia\_motivo\_codigo\_%' and v !~ '^[0-9]{2}$' then
    raise exception 'El código del motivo de traslado son 2 números (Catálogo 20 de SUNAT), por ejemplo 01, 06 o 13' using errcode = 'P0001';
  end if;
  if new.clave like 'guia\_motivo\_otros\_descripcion\_%' then
    if char_length(v) < 1 or char_length(v) > 70 then
      raise exception 'La descripción del motivo «otros» lleva entre 1 y 70 caracteres (Nubefact no acepta más)' using errcode = 'P0001';
    end if;
    new.valor := v;
  end if;
  if new.clave = 'factura_anulacion_directa_dias' and (v !~ '^[0-9]{1,3}$' or v::integer < 1) then
    raise exception 'El plazo de anulación directa de la factura son días enteros, de 1 a 999' using errcode = 'P0001';
  end if;
  if new.clave = 'guia_modo' then
    if upper(v) not in ('WMS', 'PANEL') then
      raise exception 'La guía se emite con el WMS o en el panel: escribe WMS o PANEL' using errcode = 'P0001';
    end if;
    new.valor := upper(v);
  end if;
  if new.clave = 'modo_piloto' then
    if lower(v) not in ('si', 'no') then
      raise exception 'El modo piloto se enciende con «si» y se apaga con «no»' using errcode = 'P0001';
    end if;
    new.valor := lower(v);
  end if;
  return new;
end $$;

-- ¿Está encendido el modo piloto? Falla cerrada: si el parámetro faltara o estuviera vacío, se asume que SÍ (es lo seguro).
create or replace function wms._modo_piloto() returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select lower(btrim(valor)) from wms.parametros where clave = 'modo_piloto'), 'si') <> 'no'
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Nada hacia Pedidos en el piloto: los eventos nacen RETENIDO_PILOTO
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.eventos_pedidos', 'eventos_pedidos_estado_check', 'estado', array['RETENIDO_PILOTO']);

-- El contenido del evento no se edita; solo se anota el envío. Un evento retenido en el piloto no cambia de estado (no es entregable).
create or replace function wms._evento_pedidos_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Un evento hacia Pedidos no se borra' using errcode = 'P0001'; end if;
  if (new.tipo, new.salida_id, new.guia_id, new.pedido_id, new.payload, new.creado_en) is distinct from (old.tipo, old.salida_id, old.guia_id, old.pedido_id, old.payload, old.creado_en)
     or (old.estado = 'ENVIADO' and new.estado <> 'ENVIADO')
     or (old.estado = 'RETENIDO_PILOTO' and new.estado <> 'RETENIDO_PILOTO')
     or (new.estado = 'RETENIDO_PILOTO' and old.estado <> 'RETENIDO_PILOTO') then
    raise exception 'Un evento hacia Pedidos no se edita' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Mismo aviso de la 0034; lo único que cambia es el estado con el que nace: en el piloto, RETENIDO_PILOTO (no entregable).
create or replace function wms._encolar_evento_guia(p_guia uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; s wms.salidas; v_ped record; v_id uuid := gen_random_uuid(); v_payload jsonb;
  v_dias text := (select valor from wms.parametros where clave = 'factura_anulacion_directa_dias');
begin
  select * into g from wms.guias_remision where id = p_guia;
  select * into s from wms.salidas where id = g.salida_id;
  if s.tipo <> 'DISTRIBUCION' then return null; end if;
  select pedido_id, numero into v_ped from wms.pedidos_despacho where salida_id = s.id order by vigente desc, version desc limit 1;
  v_payload := jsonb_build_object('guia', g.numero, 'origen', g.origen, 'entorno', g.entorno, 'enlace', g.enlace, 'enlace_xml', g.enlace_xml, 'estado_sunat', g.estado_sunat, 'salida', s.numero,
                                  'pedido_id', v_ped.pedido_id, 'pedido_numero', coalesce(v_ped.numero, s.pedido_numero), 'por_conciliar', s.por_conciliar,
                                  'fecha_traslado', coalesce(g.fecha_inicio_traslado, g.fecha_traslado),
                                  'bultos', coalesce(g.bultos, s.bultos_conformidad), 'lineas', g.lineas);
  if p_tipo = 'GUIA_ANULADA' then
    v_payload := v_payload || jsonb_build_object('caso', g.caso_anulacion, 'motivo', g.motivo_anulacion, 'baja_sunat', g.baja_sunat,
      'salida_confirmada', s.estado = 'CONFIRMADA', 'falta_guia_vigente', true, 'factura_anulacion_directa_dias', coalesce(nullif(v_dias, '')::integer, 7),
      'aviso', 'El WMS no modifica la factura: Pedidos decide si se anula directo en Nubefact (hasta ' || coalesce(nullif(v_dias, ''), '7') || ' días después de emitida) o si corresponde una nota de crédito');
  end if;
  insert into wms.eventos_pedidos (id, tipo, salida_id, guia_id, pedido_id, payload, estado)
  values (v_id, p_tipo, s.id, g.id, v_ped.pedido_id, v_payload, case when wms._modo_piloto() then 'RETENIDO_PILOTO' else 'PENDIENTE' end);
  return v_id;
end $$;

-- Misma función de la 0024 más una regla: en el piloto no se puede dar un evento por enviado (la aplicación tampoco lo intenta).
create or replace function wms.marcar_evento_pedidos(p_evento uuid, p_enviado boolean, p_error text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para enviar eventos a Pedidos');
  if p_enviado and wms._modo_piloto() then
    raise exception 'En el piloto no se envía nada a Pedidos: los avisos quedan retenidos' using errcode = 'P0001';
  end if;
  update wms.eventos_pedidos
     set intentos = intentos + 1, estado = case when p_enviado then 'ENVIADO' else estado end,
         enviado_en = case when p_enviado then now() else enviado_en end, ultimo_error = case when p_enviado then null else nullif(btrim(coalesce(p_error, '')), '') end
   where id = p_evento and estado = 'PENDIENTE';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Copia inmutable de las órdenes de compra
-- ─────────────────────────────────────────────────────────────────────────────

select wms._ampliar_check_in('wms.alertas', 'alertas_tipo_check', 'tipo', array['OC_CAMBIADA']);

-- Una fila por versión de cada OC. Sin llave foránea a Compras a propósito: la copia tiene que sobrevivir aunque la OC se borrara allá.
-- `encabezado` y `lineas` son lo que el WMS necesita de la OC (no incluye lo recibido ni lo facturado, que cambian a diario sin que la OC cambie); `hash` es el sha256 de ambos
-- y es lo que se compara para saber si la OC cambió. `eliminada_en_compras`: la OC ya no existe en Compras (se conserva la última copia en la versión anterior).
create table if not exists wms.oc_versiones (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null,
  oc_codigo text not null,
  version integer not null check (version >= 1),
  estado_oc text,
  encabezado jsonb not null,
  lineas jsonb not null,
  hash text not null,
  eliminada_en_compras boolean not null default false,
  creada_en timestamptz not null default now(),
  creada_por uuid,
  unique (oc_id, version)
);
create index if not exists oc_versiones_codigo_idx on wms.oc_versiones (oc_codigo);
alter table wms.oc_versiones enable row level security;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'oc_versiones' and policyname = 'lectura') then drop policy lectura on wms.oc_versiones; end if;
  create policy lectura on wms.oc_versiones for select to authenticated using (wms.es_usuario());
end $$;
revoke all on wms.oc_versiones from anon, authenticated;
grant select on wms.oc_versiones to authenticated;

-- Solo se agregan filas: ni UPDATE ni DELETE ni TRUNCATE, ni siquiera con permisos de administrador de la base (hay que quitar el disparador a propósito).
create or replace function wms._oc_version_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'La copia de una orden de compra no se edita ni se borra: si Compras cambia, se agrega una versión nueva' using errcode = 'P0001';
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'oc_versiones_inmutable' and tgrelid = 'wms.oc_versiones'::regclass) then drop trigger oc_versiones_inmutable on wms.oc_versiones; end if;
  if exists (select 1 from pg_trigger where tgname = 'oc_versiones_sin_truncate' and tgrelid = 'wms.oc_versiones'::regclass) then drop trigger oc_versiones_sin_truncate on wms.oc_versiones; end if;
end $$;
create trigger oc_versiones_inmutable before update or delete on wms.oc_versiones for each row execute function wms._oc_version_inmutable();
create trigger oc_versiones_sin_truncate before truncate on wms.oc_versiones for each statement execute function wms._oc_version_inmutable();

-- La versión vigente de cada OC (la más reciente).
create or replace view wms.v_oc_versiones_vigentes with (security_invoker = true) as
select distinct on (oc_id) id, oc_id, oc_codigo, version, estado_oc, encabezado, lineas, hash, eliminada_en_compras, creada_en, creada_por
  from wms.oc_versiones order by oc_id, version desc;
grant select on wms.v_oc_versiones_vigentes to authenticated;

-- Copia la OC si no tiene copia, o agrega una versión si su contenido cambió. Interna: quien la llama ya verificó el permiso.
-- Devuelve {oc_id, codigo, accion, version}; `accion` = CREADA | SIN_CAMBIOS | CAMBIADA | ELIMINADA | AUSENTE (no existe en Compras ni tuvo copia).
create or replace function wms._sincronizar_oc(p_oc uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_ult wms.oc_versiones;
  v_enc jsonb; v_lin jsonb; v_hash text; v_codigo text; v_estado text;
  v_ver integer; v_id uuid; v_msg text;
  v_mas integer; v_menos integer; v_dif integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('wms.oc_versiones:' || p_oc::text, 0));
  select * into v_ult from wms.oc_versiones where oc_id = p_oc order by version desc limit 1;

  select jsonb_build_object('oc_id', l.oc_id, 'codigo', l.oc_codigo, 'proveedor_id', l.proveedor_id, 'proveedor_nombre', l.proveedor_nombre, 'proveedor_ruc', l.proveedor_ruc,
                            'anulada', l.estado_oc = 'anulada'),
         l.oc_codigo, l.estado_oc
    into v_enc, v_codigo, v_estado
    from wms.v_oc_lineas l where l.oc_id = p_oc limit 1;

  if v_enc is null then
    -- Compras ya no tiene esa OC (o no tiene líneas): si había copia, se deja constancia con una versión nueva; la copia anterior queda intacta.
    if v_ult.id is null then return jsonb_build_object('oc_id', p_oc, 'accion', 'AUSENTE'); end if;
    if v_ult.eliminada_en_compras then return jsonb_build_object('oc_id', p_oc, 'codigo', v_ult.oc_codigo, 'accion', 'SIN_CAMBIOS', 'version', v_ult.version); end if;
    v_ver := v_ult.version + 1;
    v_enc := v_ult.encabezado || jsonb_build_object('eliminada', true);
    v_lin := '[]'::jsonb;
    v_hash := encode(sha256(convert_to(jsonb_build_object('encabezado', v_enc, 'lineas', v_lin)::text, 'UTF8')), 'hex');
    insert into wms.oc_versiones (oc_id, oc_codigo, version, estado_oc, encabezado, lineas, hash, eliminada_en_compras, creada_por)
    values (p_oc, v_ult.oc_codigo, v_ver, null, v_enc, v_lin, v_hash, true, auth.uid()) returning id into v_id;
    v_msg := format('La orden de compra %s ya no existe en Compras. El WMS conserva su copia (versión %s). Avisa a Compras: si había mercadería en camino, hay que aclararlo antes de recibirla.', v_ult.oc_codigo, v_ult.version);
    perform wms._alertar('OC_CAMBIADA', 'asistente_dt', null, null, 'oc-cambiada:' || p_oc || ':' || v_ver, v_msg);
    perform wms.registrar_audit('oc_version_creada', 'oc_versiones', v_id::text, null, jsonb_build_object('oc', v_ult.oc_codigo, 'version', v_ver, 'eliminada_en_compras', true), null);
    return jsonb_build_object('oc_id', p_oc, 'codigo', v_ult.oc_codigo, 'accion', 'ELIMINADA', 'version', v_ver);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('oc_item_id', l.oc_item_id, 'producto_id', l.producto_id, 'producto_codigo', l.producto_codigo,
                                               'producto_descripcion', l.producto_descripcion, 'cantidad_pedida', l.cantidad_pedida) order by l.oc_item_id), '[]'::jsonb)
    into v_lin from wms.v_oc_lineas l where l.oc_id = p_oc;
  v_hash := encode(sha256(convert_to(jsonb_build_object('encabezado', v_enc, 'lineas', v_lin)::text, 'UTF8')), 'hex');

  if v_ult.id is not null and v_ult.hash = v_hash then
    return jsonb_build_object('oc_id', p_oc, 'codigo', v_codigo, 'accion', 'SIN_CAMBIOS', 'version', v_ult.version);
  end if;

  v_ver := coalesce(v_ult.version, 0) + 1;
  insert into wms.oc_versiones (oc_id, oc_codigo, version, estado_oc, encabezado, lineas, hash, creada_por)
  values (p_oc, v_codigo, v_ver, v_estado, v_enc, v_lin, v_hash, auth.uid()) returning id into v_id;

  if v_ult.id is not null then
    -- Qué cambió, en palabras: líneas con otra cantidad, agregadas y quitadas; si anularon la OC o cambió el proveedor.
    select count(*) filter (where a.oc_item_id is null), count(*) filter (where n.oc_item_id is null),
           count(*) filter (where a.oc_item_id is not null and n.oc_item_id is not null and a.cantidad_pedida is distinct from n.cantidad_pedida)
      into v_mas, v_menos, v_dif
      from jsonb_to_recordset(v_ult.lineas) as a(oc_item_id uuid, cantidad_pedida numeric)
      full join jsonb_to_recordset(v_lin) as n(oc_item_id uuid, cantidad_pedida numeric) on a.oc_item_id = n.oc_item_id;
    v_msg := format('La orden de compra %s cambió en Compras (ahora es la versión %s): %s.', v_codigo, v_ver,
      concat_ws('; ',
        case when (v_enc->>'anulada')::boolean and not coalesce((v_ult.encabezado->>'anulada')::boolean, false) then 'la anularon' end,
        case when v_enc->>'proveedor_id' is distinct from v_ult.encabezado->>'proveedor_id' then 'cambió el proveedor' end,
        case when v_dif > 0 then v_dif || (case when v_dif = 1 then ' línea con otra cantidad' else ' líneas con otra cantidad' end) end,
        case when v_mas > 0 then v_mas || (case when v_mas = 1 then ' línea agregada' else ' líneas agregadas' end) end,
        case when v_menos > 0 then v_menos || (case when v_menos = 1 then ' línea quitada' else ' líneas quitadas' end) end,
        case when v_ult.eliminada_en_compras then 'volvió a aparecer en Compras' end));
    v_msg := v_msg || ' Revisa las solicitudes de ingreso que la usan; la copia anterior sigue guardada.';
    perform wms._alertar('OC_CAMBIADA', 'asistente_dt', null, null, 'oc-cambiada:' || p_oc || ':' || v_ver, v_msg);
  end if;
  perform wms.registrar_audit('oc_version_creada', 'oc_versiones', v_id::text, null,
    jsonb_build_object('oc', v_codigo, 'version', v_ver, 'lineas', jsonb_array_length(v_lin)), null);
  return jsonb_build_object('oc_id', p_oc, 'codigo', v_codigo, 'accion', case when v_ult.id is null then 'CREADA' else 'CAMBIADA' end, 'version', v_ver);
end $$;

-- Una OC (la que se está por recibir): la copia o agrega la versión nueva.
create or replace function wms.sincronizar_oc(p_oc uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para copiar órdenes de compra');
  if to_regclass('wms.v_oc_lineas') is null then
    raise exception 'Compras no está conectado a esta base: no hay órdenes de compra que copiar' using errcode = 'P0001';
  end if;
  return wms._sincronizar_oc(p_oc);
end $$;

-- Todas las abiertas (enviada, confirmada o parcialmente recibida) y las que ya tienen copia (para notar si cambiaron, se anularon o desaparecieron).
create or replace function wms.sincronizar_ocs_abiertas() returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_oc uuid; r jsonb; v_rev integer := 0; v_nuevas integer := 0; v_cambiadas integer := 0; v_eliminadas integer := 0;
begin
  perform wms._exigir_accion('ejecutar', 'No tienes permiso para copiar órdenes de compra');
  if to_regclass('wms.v_oc_lineas') is null then
    raise exception 'Compras no está conectado a esta base: no hay órdenes de compra que copiar' using errcode = 'P0001';
  end if;
  for v_oc in
    select oc_id from wms.v_oc_items union select oc_id from wms.oc_versiones order by 1
  loop
    r := wms._sincronizar_oc(v_oc);
    if r->>'accion' = 'AUSENTE' then continue; end if;
    v_rev := v_rev + 1;
    case r->>'accion' when 'CREADA' then v_nuevas := v_nuevas + 1; when 'CAMBIADA' then v_cambiadas := v_cambiadas + 1; when 'ELIMINADA' then v_eliminadas := v_eliminadas + 1; else null; end case;
  end loop;
  return jsonb_build_object('revisadas', v_rev, 'nuevas', v_nuevas, 'cambiadas', v_cambiadas, 'eliminadas', v_eliminadas, 'sin_cambios', v_rev - v_nuevas - v_cambiadas - v_eliminadas);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.sincronizar_oc(uuid), wms.sincronizar_ocs_abiertas(), wms.marcar_evento_pedidos(uuid, boolean, text) to authenticated;
revoke execute on all functions in schema wms from public;
