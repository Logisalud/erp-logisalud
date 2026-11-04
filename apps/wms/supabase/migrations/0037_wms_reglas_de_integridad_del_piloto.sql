-- 0037 · WMS · Piloto (errores de la demo): dos reglas de integridad que la base no aplicaba
--   1. (E-2) El motivo «Salida de Cuarentena» solo saca de Cuarentena hacia Aprobados del mismo propietario (`wms.ejecutar_movimiento`).
--   2. (E-5) En la revisión diaria, «quién lo resuelve» es siempre un auxiliar (`wms.registrar_pendiente`).
--   (E-1, el destino de un movimiento es del mismo propietario del lote, ya lo rechazaba `wms.posicion_acepta` dentro de `ejecutar_movimiento`; esta migración no lo cambia y el test lo fija.)
--
-- ── 1. Salida de Cuarentena ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Qué fallaba: el motivo era solo un texto. Con «Salida de Cuarentena» la base aceptaba mover desde CUALQUIER ubicación (por ejemplo, de un rack Aprobados a otro rack) y la pantalla
-- tampoco limitaba el origen. Después de aprobarse un lote, su stock sigue en la ubicación de Cuarentena hasta que se acomoda en su rack: ese acomodo es la «salida de Cuarentena».
--   · Origen: solo ubicaciones de Cuarentena.
--   · Destino: solo ubicaciones de Aprobados. Aprobados es exclusiva, así que `posicion_acepta` (que ya existía) exige que sea del MISMO propietario del lote; esta migración no cambia eso.
-- Se reemplaza `wms.ejecutar_movimiento` (versión de la 0012) agregando esas dos reglas; el resto es idéntico. Las demás reglas de destino (zona/estado, propietario, conteo) no cambian.
-- Re-ejecutable (create or replace). Se aplica a mano (nunca al mergear). Termina con el `revoke execute … from public`.

create or replace function wms.ejecutar_movimiento(p_lineas jsonb, p_motivo text, p_token text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_anio text := to_char(now(), 'YYYY');
  x jsonb;
  v_lote wms.lotes;
  v_origen text;
  v_area text;
  v_disp bigint;
  v_reservado bigint;
  v_desde uuid;
  v_hasta uuid;
  v_cant integer;
  v_estado text;
  v_proc uuid;
  v_area_origen text;
  v_salida_cuarentena boolean;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_permiso('ejecutar') then
    raise exception 'No tienes permiso para registrar movimientos' using errcode = '42501';
  end if;
  -- Reintento del mismo borrador (por ejemplo, tras cortarse la conexión): devuelve el movimiento ya creado, nunca uno nuevo.
  if nullif(trim(p_token), '') is not null then
    select id into v_id from wms.ordenes_movimiento where token = trim(p_token) and ejecutor_id = auth.uid();
    if found then return v_id; end if;
    v_id := gen_random_uuid();
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Cuéntanos por qué se mueve: el motivo es obligatorio' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El movimiento no tiene líneas' using errcode = 'P0001';
  end if;

  -- «Salida de Cuarentena» (sin importar mayúsculas, tildes ni espacios de más): el origen es de Cuarentena y el destino, de Aprobados.
  v_salida_cuarentena := lower(translate(regexp_replace(btrim(p_motivo), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) = 'salida de cuarentena';

  insert into wms.ordenes_movimiento (id, numero, motivo, ejecutor_id, token)
  values (v_id, 'MI-' || v_anio || '-' || lpad(wms.siguiente_correlativo('MI-' || v_anio)::text, 5, '0'), trim(p_motivo), auth.uid(), nullif(trim(p_token), ''));

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_desde := (x->>'desde_posicion_id')::uuid;
    v_hasta := (x->>'hasta_posicion_id')::uuid;
    v_cant := (x->>'cantidad')::integer;
    v_estado := x->>'estado';
    v_proc := (x->>'procedencia_id')::uuid;
    if v_desde = v_hasta then raise exception 'El origen y el destino son el mismo lugar' using errcode = 'P0001'; end if;
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad debe ser mayor que cero' using errcode = 'P0001'; end if;
    select * into v_lote from wms.lotes where id = (x->>'lote_id')::uuid;
    if not found then raise exception 'No encontramos ese lote' using errcode = 'P0001'; end if;
    select origen into v_origen from wms.partidas where procedencia_id = v_proc and lote_id = v_lote.id order by id limit 1;
    if v_origen is null then raise exception 'Esas unidades no tienen procedencia conocida' using errcode = 'P0001'; end if;

    select coalesce(sum(cantidad), 0) into v_disp from wms.saldos
     where posicion_id = v_desde and lote_id = v_lote.id and estado = v_estado and procedencia_id = v_proc;
    -- Una sola fuente de «comprometido»: movimientos internos abiertos (incluye las líneas ya cargadas de ESTA orden) y reservas de salidas.
    perform wms._candado_stock(v_lote.producto_id, v_lote.propietario_id);
    v_reservado := wms._comprometido(v_desde, v_lote.id, v_estado, v_proc);
    if v_cant > v_disp - v_reservado then
      raise exception 'No hay suficientes unidades en ese lugar (hay %, otros movimientos ya reservan %)', v_disp, v_reservado using errcode = 'P0002';
    end if;

    select tipo_area into v_area from wms.posiciones where id = v_hasta;
    if v_salida_cuarentena then
      select tipo_area into v_area_origen from wms.posiciones where id = v_desde;
      if v_area_origen is distinct from 'CUARENTENA' then
        raise exception 'Con el motivo «Salida de Cuarentena» solo se mueve lo que está en una ubicación de Cuarentena' using errcode = 'P0001';
      end if;
      if v_area is distinct from 'APROBADOS' then
        raise exception 'Con el motivo «Salida de Cuarentena» el destino es una ubicación de Aprobados' using errcode = 'P0001';
      end if;
    end if;
    if not exists (select 1 from wms.area_estado_admitido where tipo_area = v_area and estado = v_estado
                    and (origen_requerido is null or origen_requerido = v_origen)) then
      raise exception 'La zona de destino (%) no admite unidades en estado %', v_area, v_estado using errcode = 'P0001';
    end if;
    if not wms.posicion_acepta(v_hasta, v_lote.propietario_id, current_date) then
      raise exception 'La posición de destino no acepta stock de ese propietario (sin asignación vigente)' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.conteo_lineas cl join wms.conteos c on c.id = cl.conteo_id
                where cl.posicion_id in (v_desde, v_hasta) and c.estado <> 'CERRADO') then
      raise exception 'Una de las ubicaciones está en conteo: no se mueve hasta cerrarlo' using errcode = 'P0001';
    end if;

    insert into wms.ordenes_movimiento_lineas (orden_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id,
                                               desde_posicion_id, hasta_posicion_id, cantidad)
    values (v_id, v_lote.producto_id, v_lote.id, v_lote.propietario_id, v_estado, v_origen, v_proc, v_desde, v_hasta, v_cant);
  end loop;
  perform wms.registrar_audit('movimiento_ejecutado', 'ordenes_movimiento', v_id::text, null, p_lineas, p_motivo);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revisión diaria: el responsable de un pendiente es un auxiliar
-- ─────────────────────────────────────────────────────────────────────────────
-- Misma función de la 0009 más una regla: quien resuelve el pendiente tiene hoy el rol de auxiliar (hasta aquí bastaba cualquier persona con un rol).
-- Los pendientes ya registrados no cambian. Quien resuelve o verifica sigue como en la 0009 (su responsable o el Jefe).
create or replace function wms.registrar_pendiente(
  p_revision uuid, p_foco text, p_descripcion text, p_responsable uuid,
  p_critico boolean default false, p_afecta_producto boolean default false, p_ubicacion text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_rev wms.revisiones_diarias;
begin
  perform wms._exigir_jefe();
  v_rev := wms._revision_abierta(p_revision);
  if p_foco is null or p_foco not in ('ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL') then
    raise exception 'Ese foco no existe' using errcode = 'P0001';
  end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'Cuenta qué pasó' using errcode = 'P0001'; end if;
  if p_responsable is null then raise exception 'Todo pendiente necesita un responsable' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.usuario_roles r where r.user_id = p_responsable and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)) then
    raise exception 'El responsable debe ser una persona del equipo del WMS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from wms.usuario_roles r where r.user_id = p_responsable and r.rol = 'auxiliar' and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)) then
    raise exception 'Solo un auxiliar puede ser responsable de un pendiente de la revisión diaria' using errcode = 'P0001';
  end if;
  insert into wms.revision_pendientes (id, revision_id, foco, descripcion, responsable_id, critico, afecta_producto, ubicacion, creado_por)
  values (v_id, p_revision, p_foco, trim(p_descripcion), p_responsable, coalesce(p_critico, false), coalesce(p_afecta_producto, false), nullif(trim(p_ubicacion), ''), auth.uid());
  insert into wms.revision_focos (revision_id, foco, resultado, revisado_por) values (p_revision, p_foco, 'CON_PENDIENTES', auth.uid())
  on conflict (revision_id, foco) do update set resultado = 'CON_PENDIENTES', revisado_por = excluded.revisado_por, revisado_en = now();
  if coalesce(p_afecta_producto, false) then
    perform wms._alertar('PENDIENTE_AFECTA_PRODUCTO', 'direccion_tecnica', null, null, 'rd-pend:' || v_id::text,
                         'Revisión diaria ' || v_rev.numero || ': ' || trim(p_descripcion) || ' (puede afectar producto)');
  end if;
  perform wms.registrar_audit('pendiente_registrado', 'revision_pendientes', v_id::text, null,
                              jsonb_build_object('foco', p_foco, 'responsable', p_responsable, 'critico', coalesce(p_critico, false)), p_descripcion);
  return v_id;
end $$;

grant execute on function wms.ejecutar_movimiento(jsonb, text, text), wms.registrar_pendiente(uuid, text, text, uuid, boolean, boolean, text) to authenticated;
revoke execute on all functions in schema wms from public;
