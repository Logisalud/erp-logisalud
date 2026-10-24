-- 0032 · WMS · Salidas · SB-B: devolución al proveedor con aviso, numeración atómica de las guías (serie TTT1 compartida con el panel de Nubefact) y muestras a un trabajador
--
-- Decisiones D-161 a D-168 (docs/wms/decisiones-pendientes.md):
--   1. Devolución al proveedor (D-161): el proveedor pide al menos 3 meses (90 días) antes del vencimiento. Es un AVISO, no un bloqueo: si a una línea le faltan menos días,
--      la orden se crea igual si quien la crea escribe el motivo (se guarda en `salidas.devolucion_aviso_motivo` y queda en la auditoría). Parámetro
--      `devolucion_proveedor_aviso_dias` = 90. Lo que bloquea sigue igual: lote vencido y la política de canje (`canje_dias_*`). `crear_orden_salida_manual` se parchea por texto.
--   2. Numeración de las guías (D-162 a D-164). La serie es TTT1, la del mismo RUC: el panel de Nubefact y el WMS numeran sobre la MISMA serie, y la API exige que el WMS
--      mande el número correlativo, sin saltos. Por eso: (a) `reservar_numero_guia` reserva el número de forma atómica y deja UNA sola guía en curso por serie (candado de fila
--      en `guia_correlativos`); si el envío falla sin que Nubefact la reciba, `liberar_numero_guia` devuelve el número y la siguiente guía lo usa primero (sin huecos); si no se sabe
--      si la recibió, la reserva queda y el reintento reutiliza el MISMO número; (b) no se emite una guía REAL (entorno PRODUCCION) mientras nadie confirme el correlativo inicial
--      (`confirmar_correlativo_guia`; lo indica Sebas al salir a producción); (c) «ya existe» → `marcar_numero_guia_ocupado` (alguien emitió desde el panel: el número se da por
--      usado y se sigue con el siguiente); «salto» → no se emite nada y `corregir_correlativo_guia` fija el último número que muestra Nubefact, con motivo. Regla: desde que el WMS
--      emite guías reales, el panel de Nubefact solo se usa para dar de baja. Tabla nueva `guia_numeros` (estado de cada número; el historial va en la auditoría).
--   3. Muestra a nombre de un trabajador (D-165): el destinatario de una muestra puede ser una persona con DNI (8 números) en vez de RUC (`cliente_manual.tipo_documento`).
--      El código del motivo de traslado sale de parámetros (`guia_motivo_codigo_venta` 01, `_devolucion` 06 DEVOLUCION, `_muestra` 13 OTROS con `motivo_de_traslado_otros_descripcion`, máx. 70 caracteres): confirmado por Sebas.
--   4. Una guía dada de baja en el panel de Nubefact (D-166): `actualizar_estado_guia` aprende el estado 'ANULADA' (la baja ya está hecha en SUNAT): la guía queda anulada con su
--      motivo y se avisa a Pedidos; la orden vuelve a necesitar guía.
-- Requiere 0024, 0026, 0028 y 0030. Re-ejecutable. Se aplica a mano (nunca al mergear). RLS desde el `create table`. Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Parámetros
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('devolucion_proveedor_aviso_dias', '90', 'Devolución al proveedor: el proveedor pide al menos 3 meses (90 días) antes del vencimiento. Si a una línea le faltan menos días, la orden avisa y pide el motivo para continuar (NO bloquea).'),
  ('guia_correlativo_inicial', 'PENDIENTE', 'Primer número de la serie de guías que usará el WMS al salir a producción. PENDIENTE: lo indica Sebas y lo registra el Jefe de Transporte en «Numeración de guías». Sin él no se emite ninguna guía real.'),
  ('guia_motivo_codigo_venta', '01', 'Código del motivo de traslado (Catálogo 20 de SUNAT) de una venta. 01 = venta.'),
  ('guia_motivo_codigo_devolucion', '06', 'Código del motivo de traslado de una devolución al proveedor: 06 = DEVOLUCION (lo indicó Sebas; no es 04).'),
  ('guia_motivo_codigo_muestra', '13', 'Código del motivo de traslado de una muestra sin venta (también a nombre de un trabajador) y del retorno de un rechazo: 13 = OTROS (lo indicó Sebas); va con la descripción de «otros».'),
  ('guia_motivo_otros_descripcion_muestra', 'MUESTRA SIN VALOR COMERCIAL', 'Texto de motivo_de_traslado_otros_descripcion cuando el motivo es 13 en una muestra sin venta (máximo 70 caracteres).'),
  ('guia_motivo_otros_descripcion_retorno', 'RETORNO DE RECHAZO', 'Texto de motivo_de_traslado_otros_descripcion cuando el motivo es 13 en el retorno de un rechazo (máximo 70 caracteres).')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lo que una salida recuerda de la devolución
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.salidas add column if not exists devolucion_aviso_motivo text;     -- el motivo escrito para continuar una devolución con menos de 90 días

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Numeración de las guías
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.guia_correlativos add column if not exists confirmado boolean not null default false;
alter table wms.guia_correlativos add column if not exists confirmado_por uuid;
alter table wms.guia_correlativos add column if not exists confirmado_en timestamptz;

-- El estado de cada número de la serie (el historial completo va en la auditoría). Un número es de una sola serie y de una sola guía a la vez.
create table if not exists wms.guia_numeros (
  id uuid primary key default gen_random_uuid(),
  serie text not null check (serie ~ '^T[A-Z0-9]{3}$'),
  numero integer not null check (numero between 1 and 99999999),
  estado text not null check (estado in ('RESERVADO', 'USADO', 'LIBERADO', 'OCUPADO')),
  salida_id uuid references wms.salidas(id),
  entorno text check (entorno is null or entorno in ('SIMULADOR', 'PRUEBA', 'PRODUCCION')),
  guia_id uuid references wms.guias_remision(id),
  detalle text,
  reservado_por uuid,
  reservado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  /** Se archiva (no se borra) cuando se confirma o corrige el correlativo: ya no cuenta para la numeración vigente. */
  archivado boolean not null default false
);
create unique index if not exists guia_numeros_vigente_uk on wms.guia_numeros (serie, numero) where not archivado;
create index if not exists guia_numeros_estado_ix on wms.guia_numeros (serie, estado) where not archivado;
alter table wms.guia_numeros enable row level security;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'guia_numeros' and policyname = 'lectura') then drop policy lectura on wms.guia_numeros; end if;
  create policy lectura on wms.guia_numeros for select to authenticated using (wms.es_usuario());
end $$;
revoke all on wms.guia_numeros from anon, authenticated;
grant select on wms.guia_numeros to authenticated;

-- Reserva el número de la próxima guía: una sola guía en curso por serie. Devuelve {numero, reintento}. `reintento` = ese número ya estaba reservado para esta misma orden
-- (un envío anterior no terminó): quien lo llama pregunta a Nubefact si ya lo tiene antes de volver a enviar.
create or replace function wms.reservar_numero_guia(p_serie text, p_entorno text, p_salida uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare c wms.guia_correlativos; n wms.guia_numeros; v_serie text := upper(btrim(coalesce(p_serie, ''))); v_num integer; v_sal text;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para emitir la guía de remisión');
  if p_entorno is null or p_entorno not in ('SIMULADOR', 'PRUEBA', 'PRODUCCION') then raise exception 'Falta el entorno de Nubefact con el que se emite' using errcode = 'P0001'; end if;
  if p_salida is null then raise exception 'Falta la orden de la guía' using errcode = 'P0001'; end if;
  select * into c from wms.guia_correlativos where serie = v_serie for update;
  if not found then raise exception 'La serie % de guías no está configurada', v_serie using errcode = 'P0001'; end if;
  if p_entorno = 'PRODUCCION' and not c.confirmado then
    raise exception 'Todavía no se puede emitir una guía real: falta confirmar con qué número empieza la serie %. Lo indica Sebas al salir a producción y lo registra el Jefe de Transporte en «Numeración de guías». Mientras tanto se emite en el simulador o en el entorno de pruebas.', v_serie using errcode = 'P0001';
  end if;
  if p_entorno <> 'PRODUCCION' and c.confirmado then
    raise exception 'La serie % ya está confirmada para producción: no se emiten guías de prueba con sus números', v_serie using errcode = 'P0001';
  end if;
  select * into n from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and not archivado order by numero limit 1 for update;
  if found then
    if n.salida_id = p_salida then
      update wms.guia_numeros set reservado_por = auth.uid(), reservado_en = now() where id = n.id;
      perform wms.registrar_audit('guia_numero_reintento', 'guia_numeros', n.id::text, null, jsonb_build_object('serie', v_serie, 'numero', n.numero), null);
      return jsonb_build_object('numero', n.numero, 'reintento', true);
    end if;
    select numero into v_sal from wms.salidas where id = n.salida_id;
    raise exception 'Se está emitiendo otra guía de la serie % (la de %) con el número %. Espera un momento y vuelve a intentar: así la numeración no se salta.', v_serie, coalesce(v_sal, 'otra orden'), n.numero using errcode = 'P0001';
  end if;
  -- primero un número devuelto (sin huecos); si no hay, el siguiente de la serie
  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and estado = 'LIBERADO' and not archivado;
  if v_num is not null then
    update wms.guia_numeros set estado = 'RESERVADO', salida_id = p_salida, entorno = p_entorno, guia_id = null, detalle = null, reservado_por = auth.uid(), reservado_en = now(), resuelto_en = null
     where serie = v_serie and numero = v_num and not archivado;
  else
    v_num := c.ultimo + 1;
    if v_num > 99999999 then raise exception 'La serie % llegó a su último número', v_serie using errcode = 'P0001'; end if;
    update wms.guia_correlativos set ultimo = v_num where serie = v_serie;
    insert into wms.guia_numeros (serie, numero, estado, salida_id, entorno, reservado_por) values (v_serie, v_num, 'RESERVADO', p_salida, p_entorno, auth.uid());
  end if;
  perform wms.registrar_audit('guia_numero_reservado', 'guia_numeros', v_serie || '-' || v_num, null, jsonb_build_object('serie', v_serie, 'numero', v_num, 'entorno', p_entorno, 'salida', p_salida), null);
  return jsonb_build_object('numero', v_num, 'reintento', false);
end $$;

-- Nubefact NO recibió la guía (la rechazó antes de generarla): el número vuelve a estar libre y lo usa primero la siguiente guía. Devuelve si había algo que liberar.
create or replace function wms.liberar_numero_guia(p_serie text, p_numero integer, p_motivo text default null) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare n wms.guia_numeros; v_serie text := upper(btrim(coalesce(p_serie, '')));
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para emitir la guía de remisión');
  select * into n from wms.guia_numeros where serie = v_serie and numero = p_numero and not archivado for update;
  if not found or n.estado <> 'RESERVADO' then return false; end if;
  update wms.guia_numeros set estado = 'LIBERADO', resuelto_en = now(), detalle = nullif(btrim(coalesce(p_motivo, '')), '') where id = n.id;
  perform wms.registrar_audit('guia_numero_liberado', 'guia_numeros', v_serie || '-' || p_numero, null, jsonb_build_object('serie', v_serie, 'numero', p_numero), nullif(btrim(coalesce(p_motivo, '')), ''));
  return true;
end $$;

-- «Ya existe»: alguien emitió ese número desde el panel de Nubefact. Se da por usado (no es una guía del WMS) y la siguiente guía sigue con el número que viene.
create or replace function wms.marcar_numero_guia_ocupado(p_serie text, p_numero integer, p_detalle text default null) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare n wms.guia_numeros; v_serie text := upper(btrim(coalesce(p_serie, '')));
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para emitir la guía de remisión');
  select * into n from wms.guia_numeros where serie = v_serie and numero = p_numero and not archivado for update;
  if not found or n.estado <> 'RESERVADO' then return false; end if;
  update wms.guia_numeros set estado = 'OCUPADO', resuelto_en = now(), detalle = coalesce(nullif(btrim(coalesce(p_detalle, '')), ''), 'Ya existía en Nubefact') where id = n.id;
  perform wms.registrar_audit('guia_numero_ocupado', 'guia_numeros', v_serie || '-' || p_numero, null, jsonb_build_object('serie', v_serie, 'numero', p_numero),
                              'Ya existía en Nubefact: alguien emitió una guía desde el panel');
  return true;
end $$;

-- Confirma con qué número empieza la serie: el PRIMER número que usará el WMS (lo indica Sebas al salir a producción). Mientras no se confirme no se emite una guía real.
-- Solo mientras el WMS no haya emitido guías reales de esa serie; después se corrige con `corregir_correlativo_guia`.
create or replace function wms.confirmar_correlativo_guia(p_serie text, p_inicial integer, p_nota text default null) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare c wms.guia_correlativos; v_serie text := upper(btrim(coalesce(p_serie, '')));
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('anular_guia') or wms.tiene_permiso('configurar')) then
    raise exception 'Solo el Jefe de Transporte o la administración del WMS confirman el correlativo de las guías' using errcode = '42501';
  end if;
  if p_inicial is null or p_inicial < 1 or p_inicial > 99999999 then
    raise exception 'Escribe el primer número que usará el WMS: un entero de 1 a 99 999 999 (el siguiente al último que muestra Nubefact)' using errcode = 'P0001';
  end if;
  select * into c from wms.guia_correlativos where serie = v_serie for update;
  if not found then raise exception 'La serie % de guías no está configurada', v_serie using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision where origen = 'NUBEFACT' and entorno = 'PRODUCCION' and numero like v_serie || '-%') then
    raise exception 'El WMS ya emitió guías reales de la serie %: el correlativo no se cambia aquí, se corrige con «Corregir el correlativo» y un motivo', v_serie using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and not archivado) then
    raise exception 'Hay una guía en curso en la serie %: espera a que termine para confirmar el correlativo', v_serie using errcode = 'P0001';
  end if;
  update wms.guia_numeros set archivado = true where serie = v_serie and not archivado;          -- lo de pruebas queda como historia, no se borra
  update wms.guia_correlativos set ultimo = p_inicial - 1, confirmado = true, confirmado_por = auth.uid(), confirmado_en = now(),
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Correlativo inicial confirmado: la primera guía real será la ' || p_inicial) where serie = v_serie;
  update wms.parametros set valor = p_inicial::text where clave = 'guia_correlativo_inicial';
  perform wms.registrar_audit('guia_correlativo_confirmado', 'guia_correlativos', v_serie, jsonb_build_object('ultimo', c.ultimo, 'confirmado', c.confirmado),
                              jsonb_build_object('inicial', p_inicial), nullif(btrim(coalesce(p_nota, '')), ''));
end $$;

-- Después de una guía real: fija el ÚLTIMO número que muestra Nubefact (por ejemplo, tras un «salto» porque alguien emitió o anuló desde el panel). Con motivo; deja la auditoría.
create or replace function wms.corregir_correlativo_guia(p_serie text, p_ultimo integer, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare c wms.guia_correlativos; v_serie text := upper(btrim(coalesce(p_serie, ''))); v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not (wms.tiene_permiso('anular_guia') or wms.tiene_permiso('configurar')) then
    raise exception 'Solo el Jefe de Transporte o la administración del WMS confirman el correlativo de las guías' using errcode = '42501';
  end if;
  if p_ultimo is null or p_ultimo < 0 or p_ultimo > 99999999 then raise exception 'Escribe el último número que muestra Nubefact (un entero de 0 a 99 999 999)' using errcode = 'P0001'; end if;
  if v_mot is null then raise exception 'Cuenta por qué se corrige el correlativo' using errcode = 'P0001'; end if;
  select * into c from wms.guia_correlativos where serie = v_serie for update;
  if not found then raise exception 'La serie % de guías no está configurada', v_serie using errcode = 'P0001'; end if;
  if not c.confirmado then raise exception 'Primero confirma con qué número empieza la serie %', v_serie using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and not archivado) then
    raise exception 'Hay una guía en curso en la serie %: espera a que termine para corregir el correlativo', v_serie using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guia_numeros where serie = v_serie and estado = 'USADO' and not archivado and numero > p_ultimo) then
    raise exception 'Una guía del WMS ya usó un número mayor que %: el último de Nubefact no puede ser menor', p_ultimo using errcode = 'P0001';
  end if;
  update wms.guia_numeros set archivado = true where serie = v_serie and not archivado and estado <> 'USADO';
  update wms.guia_correlativos set ultimo = p_ultimo where serie = v_serie;
  perform wms.registrar_audit('guia_correlativo_corregido', 'guia_correlativos', v_serie, jsonb_build_object('ultimo', c.ultimo), jsonb_build_object('ultimo', p_ultimo), v_mot);
end $$;

-- La función de la 0024 se conserva (sus pruebas la usan) pero ya no se puede usar para saltarse la reserva en una serie confirmada para producción.
create or replace function wms.siguiente_numero_guia(p_serie text) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_n integer; v_serie text := upper(btrim(coalesce(p_serie, ''))); v_confirmado boolean;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para emitir la guía de remisión');
  select confirmado into v_confirmado from wms.guia_correlativos where serie = v_serie;
  if v_confirmado then raise exception 'La numeración de la serie % va por la reserva de números (reservar_numero_guia): así no se salta un número', v_serie using errcode = 'P0001'; end if;
  update wms.guia_correlativos set ultimo = ultimo + 1 where serie = v_serie returning ultimo into v_n;
  if v_n is null then raise exception 'La serie % de guías no está configurada', v_serie using errcode = 'P0001'; end if;
  return v_n;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Registrar la guía: el número reservado pasa a USADO, y una guía real exige correlativo confirmado
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_oid oid; v_def text;
  v_ancla text := $q$  perform wms.registrar_audit('guia_electronica_emitida'$q$;
  v_nuevo text := $q$  -- 0032: el número reservado pasa a USADO (y una guía REAL exige que el correlativo de su serie esté confirmado)
  if p_entorno = 'PRODUCCION' and not coalesce((select confirmado from wms.guia_correlativos where serie = split_part(v_num, '-', 1)), false) then
    raise exception 'Todavía no se puede emitir una guía real: falta confirmar con qué número empieza la serie %', split_part(v_num, '-', 1) using errcode = 'P0001';
  end if;
  update wms.guia_numeros set estado = 'USADO', guia_id = v_id, resuelto_en = now()
   where serie = split_part(v_num, '-', 1) and numero = split_part(v_num, '-', 2)::integer and estado = 'RESERVADO' and not archivado;
$q$ || v_ancla;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'registrar_guia_electronica' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('0032: el número reservado pasa a USADO' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.registrar_guia_electronica: %', v_ancla; end if;
  execute replace(v_def, v_ancla, v_nuevo);
end $$;

-- La guía registrada entra con el número reservado: si el número ya estaba USADO por otra guía, la restricción de la 0024 («ya está registrada») lo rechaza igual.
-- El contexto de la guía suma el estado del correlativo (para bloquear la emisión real en la pantalla antes de enviar).
do $$
declare
  v_oid oid; v_def text;
  v_ancla text := $q$    'parametros', v_par);$q$;
  v_nuevo text := $q$    'parametros', v_par,
    'correlativo', (select jsonb_build_object('confirmado', gc.confirmado, 'ultimo', gc.ultimo) from wms.guia_correlativos gc where gc.serie = coalesce(nullif(v_par->>'guia_serie', ''), 'TTT1')));$q$;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'contexto_guia' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position($q$'correlativo', (select jsonb_build_object('confirmado'$q$ in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(v_ancla in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.contexto_guia: %', v_ancla; end if;
  execute replace(v_def, v_ancla, v_nuevo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Una guía dada de baja en el panel de Nubefact (D-166) y las otras dos respuestas de SUNAT
-- ─────────────────────────────────────────────────────────────────────────────

-- Igual que la 0024, más el estado 'ANULADA': la guía se dio de baja en el panel de Nubefact (la baja ya está hecha ante SUNAT). Funciona con la guía vigente en cualquier estado
-- de SUNAT. Se avisa a Pedidos (GUIA_ANULADA) y la orden vuelve a necesitar guía; el WMS no toca el stock ni la factura.
create or replace function wms.actualizar_estado_guia(
  p_guia uuid, p_estado text, p_enlace text default null, p_enlace_xml text default null, p_enlace_cdr text default null, p_hash text default null, p_respuesta jsonb default null, p_error text default null
) returns text
language plpgsql security definer set search_path = wms, pg_temp as $$
declare g wms.guias_remision; v_err text := nullif(btrim(coalesce(p_error, '')), '');
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para actualizar la guía de remisión');
  select * into g from wms.guias_remision where id = p_guia for update;
  if not found then raise exception 'No encontramos esa guía' using errcode = 'P0001'; end if;
  if g.origen <> 'NUBEFACT' then raise exception 'Solo las guías emitidas con Nubefact tienen estado de SUNAT' using errcode = 'P0001'; end if;
  if p_estado = 'ANULADA' then
    if g.estado = 'ANULADA' then return 'ANULADA'; end if;
    update wms.guias_remision set estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(),
           motivo_anulacion = 'Se dio de baja en el panel de Nubefact' || coalesce(': ' || v_err, ''), baja_sunat = 'HECHA' where id = p_guia;
    perform wms._encolar_evento_guia(p_guia, 'GUIA_ANULADA');
    perform wms.registrar_audit('guia_anulada_en_nubefact', 'guias_remision', p_guia::text, jsonb_build_object('numero', g.numero), jsonb_build_object('baja_sunat', 'HECHA'), v_err);
    return 'ANULADA';
  end if;
  if g.estado <> 'VIGENTE' or g.estado_sunat <> 'PENDIENTE' then return g.estado_sunat; end if;      -- ya resuelta: consultar otra vez no cambia nada
  if p_estado = 'PENDIENTE' then return 'PENDIENTE'; end if;
  if p_estado = 'ACEPTADA' then
    if nullif(btrim(coalesce(p_enlace, '')), '') is null then raise exception 'Falta el enlace de la guía que devolvió Nubefact' using errcode = 'P0001'; end if;
    update wms.guias_remision set estado_sunat = 'ACEPTADA', enlace = btrim(p_enlace), enlace_xml = nullif(btrim(coalesce(p_enlace_xml, '')), ''),
           enlace_cdr = nullif(btrim(coalesce(p_enlace_cdr, '')), ''), hash_nubefact = nullif(btrim(coalesce(p_hash, '')), ''), respuesta = coalesce(p_respuesta, respuesta) where id = p_guia;
    perform wms._encolar_evento_guia(p_guia, 'GUIA_EMITIDA');
    perform wms.registrar_audit('guia_electronica_aceptada', 'guias_remision', p_guia::text, null, jsonb_build_object('numero', g.numero), null);
    return 'ACEPTADA';
  elsif p_estado = 'RECHAZADA' then
    if v_err is null then raise exception 'Indica por qué SUNAT rechazó la guía' using errcode = 'P0001'; end if;
    update wms.guias_remision set estado_sunat = 'RECHAZADA', respuesta = coalesce(p_respuesta, respuesta), estado = 'ANULADA', anulada_por = auth.uid(), anulada_en = now(),
           motivo_anulacion = 'SUNAT rechazó la guía: ' || v_err, baja_sunat = 'NO_APLICA' where id = p_guia;
    perform wms.registrar_audit('guia_electronica_rechazada', 'guias_remision', p_guia::text, null, jsonb_build_object('numero', g.numero), v_err);
    return 'RECHAZADA';
  end if;
  raise exception 'El estado de SUNAT es aceptada, pendiente, rechazada o anulada' using errcode = 'P0001';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. crear_orden_salida_manual (0028 + 0030): aviso de la devolución y muestra con DNI. Parche por texto; si el texto no está, falla en voz alta.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_oid oid; v_def text;
  -- (1) variables nuevas
  a1 text := $q$v_disp integer; v_enbajas integer; v_cliente jsonb; v_pd wms.pedidos_despacho; v_actual jsonb;$q$;
  n1 text := $q$v_disp integer; v_enbajas integer; v_cliente jsonb; v_pd wms.pedidos_despacho; v_actual jsonb;
  v_aviso_dias integer := coalesce((select nullif(btrim(valor), '')::integer from wms.parametros where clave = 'devolucion_proveedor_aviso_dias'), 90);
  v_n_aviso integer := 0; v_aviso_motivo text; v_tipo_doc text := 'RUC';$q$;
  -- (2) el documento del destinatario de una muestra: RUC o DNI (solo en el bloque del tipo C)
  a2 text := $q$'Escribe a quién va la muestra' end using errcode = 'P0001';
    end if;
    if v_ruc !~ '^[0-9]{11}$' then raise exception 'El RUC tiene 11 números' using errcode = 'P0001'; end if;$q$;
  n2 text := $q$'Escribe a quién va la muestra' end using errcode = 'P0001';
    end if;
    -- 0032: una muestra puede ir a nombre de un trabajador (DNI de 8 números); todo lo demás lleva RUC. El motivo para continuar una devolución con poco plazo viaja aquí.
    v_tipo_doc := case when p_motivo = 'MUESTRA' and upper(coalesce(p_cliente->>'tipo_documento', '')) = 'DNI' then 'DNI' else 'RUC' end;
    v_aviso_motivo := nullif(btrim(coalesce(p_cliente->>'aviso_motivo', '')), '');
    if v_tipo_doc = 'DNI' then
      if v_ruc !~ '^[0-9]{8}$' then raise exception 'El DNI tiene 8 números' using errcode = 'P0001'; end if;
    elsif v_ruc !~ '^[0-9]{11}$' then raise exception 'El RUC tiene 11 números' using errcode = 'P0001'; end if;$q$;
  a3 text := $q$v_cliente := jsonb_build_object('ruc', v_ruc, 'razon_social', btrim(p_cliente->>'razon_social'), 'direccion', btrim(p_cliente->>'direccion'), 'ubigeo', v_ubigeo);$q$;
  n3 text := $q$v_cliente := jsonb_build_object('ruc', v_ruc, 'razon_social', btrim(p_cliente->>'razon_social'), 'direccion', btrim(p_cliente->>'direccion'), 'ubigeo', v_ubigeo,
                                    'tipo_documento', v_tipo_doc);$q$;
  -- (3) en la devolución al proveedor, contar las líneas con menos de los días de aviso
  a4 text := $q$        if not v_apto.apto then raise exception 'Lote %: %', lt.codigo, v_apto.razon using errcode = 'P0001'; end if;
$q$;
  n4 text := a4 || $q$        if v_tipo = 'PROVEEDOR' and lt.vence is not null and (lt.vence - v_hoy) < v_aviso_dias then v_n_aviso := v_n_aviso + 1; end if;
$q$;
  -- (4) con aviso y sin motivo, no se crea
  a5 text := $q$  -- La orden: crear_salida valida tipo, motivo, propietario y lotes otra vez y numera OS-AAAA-NNNNN
$q$;
  n5 text := $q$  if v_n_aviso > 0 and v_aviso_motivo is null then
    raise exception '%', case when v_n_aviso = 1 then 'Una línea tiene' else v_n_aviso || ' líneas tienen' end || format(' menos de %s días para vencer: escribe el motivo para continuar con la devolución', v_aviso_dias) using errcode = 'P0001';
  end if;

$q$ || a5;
  -- (5) guardar el motivo en la orden
  a6 text := $q$        cliente_manual = v_cliente,
$q$;
  n6 text := a6 || $q$        devolucion_aviso_motivo = case when v_n_aviso > 0 then v_aviso_motivo end,
$q$;
  -- (6) auditoría
  a7 text := $q$  perform wms.registrar_audit('orden_manual_creada', 'salidas', v_id::text, null,$q$;
  n7 text := $q$  if v_n_aviso > 0 then
    perform wms.registrar_audit('devolucion_proveedor_poco_plazo', 'salidas', v_id::text, null, jsonb_build_object('lineas', v_n_aviso, 'dias_aviso', v_aviso_dias), v_aviso_motivo);
  end if;
$q$ || a7;
begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'crear_orden_salida_manual' order by p.oid desc limit 1;
  v_def := pg_get_functiondef(v_oid);
  if position('0032: una muestra puede ir a nombre de un trabajador' in v_def) > 0 then return; end if;     -- ya aplicada (re-ejecución)
  if position(a1 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (1)'; end if;
  if position(a2 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (2)'; end if;
  if position(a3 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (3)'; end if;
  if position(a4 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (4)'; end if;
  if position(a5 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (5)'; end if;
  if position(a6 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (6)'; end if;
  if position(a7 in v_def) = 0 then raise exception 'No se encontró el texto esperado en wms.crear_orden_salida_manual (7)'; end if;
  v_def := replace(v_def, a1, n1);
  v_def := replace(v_def, a2, n2);
  v_def := replace(v_def, a3, n3);
  v_def := replace(v_def, a4, n4);
  v_def := replace(v_def, a5, n5);
  v_def := replace(v_def, a6, n6);
  v_def := replace(v_def, a7, n7);
  execute v_def;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.reservar_numero_guia(text, text, uuid), wms.liberar_numero_guia(text, integer, text), wms.marcar_numero_guia_ocupado(text, integer, text),
  wms.confirmar_correlativo_guia(text, integer, text), wms.corregir_correlativo_guia(text, integer, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
