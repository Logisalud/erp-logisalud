-- 0036 · WMS · Piloto «como real»: la guía se emite en el panel de Nubefact (o en Odoo) y el WMS solo la REGISTRA
--
-- Decisión de Sebas (2026-10-24): en noviembre el piloto corre con Odoo como sistema oficial; las salidas del piloto son de una ruta o un día fijo por semana, con número de pedido.
-- Durante el piloto la guía NO la emite el WMS: se emite en el panel de Nubefact (o en Odoo) y aquí se anota. Lo que sigue (embalaje, carga, salida confirmada, aviso a Pedidos) es idéntico.
--   1. Parámetro `guia_modo`: `WMS` (el WMS emite con Nubefact, lo de siempre) o `PANEL` (se emite afuera y el WMS la registra). La migración lo siembra en `PANEL` para el piloto; si el
--      parámetro no existe, la aplicación se comporta como siempre (`WMS`). Su valor se valida (solo esos dos).
--   2. La guía tiene un origen propio: `PANEL`. El check de `guias_remision.origen` se amplía (MANUAL, NUBEFACT, CLIENTE y PANEL). Se agrega `fecha_emision` (la fecha que muestra el panel).
--   3. `wms.registrar_guia_panel(...)`: registra serie-número (T001-00001234, TTT1-00000012…), fecha de emisión, estado (aceptada o sin respuesta), enlace opcional y nota. Mismas reglas que
--      `registrar_gre` (permiso `registrar_documentacion`, todo el pedido con conformidad, una guía viva por salida, sin repetir número) y una más: el número no se repite NI SIQUIERA con una guía
--      anulada (un número emitido en el panel no se reutiliza). Deja el aviso `GUIA_EMITIDA` para Pedidos y la auditoría `guia_panel_registrada`. NO duplica `registrar_gre`: esa sigue siendo la
--      contingencia a mano y la GRE del cliente de almacenamiento.
--   4. La guía de origen `PANEL` no se actualiza con `actualizar_estado_guia` (eso es de Nubefact): si cambia algo, se anula con motivo y se registra la correcta. La baja ante SUNAT se hace en el panel.
-- Requiere 0034 (usa `_guia_de_reemplazo_posible`). Re-ejecutable. Se aplica a mano (nunca al mergear). Termina con el `revoke execute … from public`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Parámetro y su validación
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('guia_modo', 'PANEL', 'Quién emite la guía de remisión: WMS = el WMS la emite con Nubefact; PANEL = se emite en el panel de Nubefact (o en Odoo) y el WMS solo la registra (piloto de noviembre). Lo cambia el Administrador.')
on conflict (clave) do nothing;

-- Misma función de la 0034 más una regla: `guia_modo` solo admite WMS o PANEL.
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
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Origen PANEL y fecha de emisión
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.guias_remision add column if not exists fecha_emision date;

-- El check de origen se amplía; las filas que ya existen siguen cumpliéndolo (solo se agrega un valor permitido).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'guias_remision_origen_chk' and conrelid = 'wms.guias_remision'::regclass
             and pg_get_constraintdef(oid) not like '%PANEL%') then
    alter table wms.guias_remision drop constraint guias_remision_origen_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guias_remision_origen_chk' and conrelid = 'wms.guias_remision'::regclass) then
    alter table wms.guias_remision add constraint guias_remision_origen_chk check (origen in ('MANUAL', 'NUBEFACT', 'CLIENTE', 'PANEL'));
  end if;
end $$;

-- La fecha de emisión tampoco se edita (misma función de la 0024 con la columna nueva).
create or replace function wms._guia_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Una guía registrada no se borra: se anula con motivo' using errcode = 'P0001'; end if;
  if (new.salida_id, new.numero, new.lineas, new.placa, new.fecha_traslado, new.nota, new.registrada_por, new.registrada_en,
      new.origen, new.entorno, new.fecha_inicio_traslado, new.peso_kg, new.bultos, new.payload, new.archivo_ref, new.fecha_emision)
     is distinct from (old.salida_id, old.numero, old.lineas, old.placa, old.fecha_traslado, old.nota, old.registrada_por, old.registrada_en,
      old.origen, old.entorno, old.fecha_inicio_traslado, old.peso_kg, old.bultos, old.payload, old.archivo_ref, old.fecha_emision)
     or (old.estado = 'ANULADA' and (new.estado, new.anulada_por, new.anulada_en, new.motivo_anulacion, new.caso_anulacion) is distinct from (old.estado, old.anulada_por, old.anulada_en, old.motivo_anulacion, old.caso_anulacion))
     or ((new.enlace, new.enlace_xml, new.enlace_cdr, new.hash_nubefact, new.respuesta, new.estado_sunat) is distinct from (old.enlace, old.enlace_xml, old.enlace_cdr, old.hash_nubefact, old.respuesta, old.estado_sunat)
         and old.estado_sunat is distinct from 'PENDIENTE') then
    raise exception 'Una guía registrada no se edita: se anula con motivo y se registra otra' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Registrar una guía emitida en el panel
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.registrar_guia_panel(
  p_salida uuid, p_numero text, p_fecha_emision date, p_estado text default 'ACEPTADA',
  p_enlace text default null, p_archivo_ref text default null, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; v_num text := upper(btrim(coalesce(p_numero, ''))); v_id uuid := gen_random_uuid(); v_placa text; v_fecha date;
  v_estado text := upper(btrim(coalesce(p_estado, ''))); v_enlace text := nullif(btrim(coalesce(p_enlace, '')), '');
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para registrar la guía de remisión');
  if upper(coalesce((select valor from wms.parametros where clave = 'guia_modo'), 'WMS')) <> 'PANEL' then
    raise exception 'Ahora el WMS emite las guías con Nubefact: no se registran las que salen del panel' using errcode = 'P0001';
  end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' and not wms._guia_de_reemplazo_posible(p_salida) then raise exception 'La salida ya no está abierta' using errcode = 'P0001'; end if;
  if v_num !~ '^[A-Z][A-Z0-9]{3}-[0-9]{1,8}$' then raise exception 'El número de la guía se escribe como T001-00001234 (serie, guion y número)' using errcode = 'P0001'; end if;
  if p_fecha_emision is null then raise exception 'Escribe la fecha en que se emitió la guía' using errcode = 'P0001'; end if;
  if p_fecha_emision > v_hoy then raise exception 'La guía no puede tener fecha de mañana' using errcode = 'P0001'; end if;
  if v_estado not in ('ACEPTADA', 'PENDIENTE') then raise exception 'Elige cómo está la guía en el panel: aceptada o sin respuesta todavía' using errcode = 'P0001'; end if;
  if v_enlace is not null and v_enlace !~* '^https?://\S+$' then raise exception 'El enlace empieza con https:// (cópialo tal cual del panel)' using errcode = 'P0001'; end if;
  if not wms._salida_conforme(p_salida) then raise exception 'La guía se registra cuando todo el pedido tiene la conformidad: sus lotes salen de lo confirmado' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision where salida_id = p_salida and estado = 'VIGENTE') then
    raise exception 'Este pedido ya tiene una guía registrada. Para cambiarla, anúlala con el motivo y registra la nueva' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.guias_remision where numero = v_num) then
    raise exception 'La guía % ya está registrada (vigente o anulada): un número emitido en el panel no se repite', v_num using errcode = 'P0001';
  end if;
  select ve.placa, r.fecha into v_placa, v_fecha
    from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id left join wms.vehiculos ve on ve.id = r.vehiculo_id
   where pa.salida_id = p_salida and pa.activa order by r.fecha desc limit 1;
  insert into wms.guias_remision (id, salida_id, numero, lineas, placa, fecha_traslado, nota, registrada_por, origen, estado_sunat, enlace, archivo_ref, bultos, fecha_emision)
  values (v_id, p_salida, v_num, wms._lineas_de_guia(p_salida), v_placa, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), 'PANEL', v_estado, v_enlace,
          nullif(btrim(coalesce(p_archivo_ref, '')), ''), s.bultos_conformidad, p_fecha_emision);
  perform wms._encolar_evento_guia(v_id, 'GUIA_EMITIDA');
  perform wms.registrar_audit('guia_panel_registrada', 'guias_remision', v_id::text, null,
    jsonb_build_object('numero', v_num, 'salida', s.numero, 'origen', 'PANEL', 'fecha_emision', p_fecha_emision, 'estado', v_estado, 'con_enlace', v_enlace is not null), null);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos de ejecución (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.registrar_guia_panel(uuid, text, date, text, text, text, text) to authenticated;
revoke execute on all functions in schema wms from public;
