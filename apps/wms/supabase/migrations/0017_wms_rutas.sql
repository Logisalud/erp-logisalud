-- 0017 · WMS · Salidas · S4: rutas (planificación, vehículo, conductor, auxiliar, pedidos, orden de paradas y versiones)
--
-- Una ruta agrupa pedidos de la bandeja (S3) en un orden de paradas, con su vehículo, conductor y auxiliar. Al entrar un pedido en una ruta se crea su
-- salida de distribución y se asigna el stock por FEFO (S2); si falta stock el pedido queda bloqueado y se alerta al Jefe de Transporte.
--   · Estados de la ruta (Master): BORRADOR → PLANIFICADA → LISTA_PARA_CARGA → LIBERADA → EN_RUTA → PENDIENTE_CIERRE → CERRADA, y CANCELADA. Esta migración
--     cubre BORRADOR, PLANIFICADA y CANCELADA; los demás los mueven las migraciones de despacho (0019–0020).
--   · `ruta_versiones` es append-only: cada cambio del plan (vehículo, personal, pedidos, orden) es una versión nueva con su motivo; el plan vigente vive en
--     `rutas` y `ruta_paradas` (una parada que sale del plan queda inactiva, no se borra).
--   · Reglas en la base: el vehículo debe estar activo y ser «calificado» si el cliente lo exige; un pedido no puede estar en dos rutas vivas; un pedido
--     cuya versión cambió en Pedidos no entra hasta revisarlo; el corte de planificación (parámetro, 16:00 hora de Lima) deja fuera a lo importado después
--     de la víspera, salvo excepción con motivo registrada por quien planifica.
--   · Al confirmar la ruta nace el registro base del formato LS-FR.43.03 (S4b lo imprime). Las definiciones que faltan de Dirección Técnica son parámetros
--     en «PENDIENTE»: no bloquean nada.
-- Re-ejecutable. Se aplica a mano, después de la 0016 (necesita la 0012 y la 0014). Termina con el `revoke execute … from public` (regla de la 0011).

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Permisos y parámetros
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'wms.permisos_rol'::regclass and conname = 'permisos_rol_accion_check') then
    alter table wms.permisos_rol drop constraint permisos_rol_accion_check;
  end if;
  alter table wms.permisos_rol add constraint permisos_rol_accion_check check (accion in (
    'ver', 'ejecutar', 'verificar', 'aprobar', 'ajustar', 'configurar', 'exportar', 'auditar',
    'dar_conformidad', 'cambiar_lote_asignado', 'imprimir_paquete_documental',
    'gestionar_documentos_regulatorios', 'autorizar_salida_sin_venta', 'preparar_salidas', 'confirmar_salida',
    'planificar_ruta', 'registrar_documentacion', 'embalar', 'cargar_ruta', 'liberar_unidad'));
end $$;

-- Planificar rutas es del Jefe de Transporte (Roberto; Charlie también lo tiene por su doble rol). El Jefe de Almacén «solo» no planifica.
insert into wms.permisos_rol (rol, accion) values ('jefe_transporte', 'planificar_ruta') on conflict (rol, accion) do nothing;

insert into wms.parametros (clave, valor, nota) values
  ('hora_corte_planificacion', '16:00', 'S4: hora de Lima del corte. Un pedido importado después del corte de la víspera no entra a la ruta de esa fecha sin una excepción con motivo.'),
  ('ls_fr_43_03_codigo', 'LS-FR.43.03', 'S4b: código del formato Planificación de ruta (cambia solo si Calidad emite una versión nueva).'),
  ('ls_fr_43_03_version', '01', 'S4b: versión vigente del formato.'),
  ('ls_fr_43_03_vigente_desde', '2026-09-01', 'S4b: inicio de vigencia del formato.'),
  ('ls_fr_43_03_vigente_hasta', '2028-09-01', 'S4b: fin de vigencia del formato.'),
  ('ls_fr_43_03_filas_por_pagina', '10', 'S4b: filas por página del PDF.'),
  ('ls_fr_43_03_usuario_significado', 'PENDIENTE', 'Pendiente de Dirección Técnica (Katia): qué significa la columna USUARIO del formato. Mientras tanto no se imprime.'),
  ('cajas_equivale_a_bultos', 'PENDIENTE', 'Pendiente de Dirección Técnica: si «N.° cajas» del formato es igual a los bultos. Mientras tanto se imprimen los bultos, rotulados «bultos».'),
  ('ls_fr_43_03_temperatura_metodo', 'PENDIENTE', 'Pendiente de Dirección Técnica: método y momento de la temperatura por fila. Mientras tanto la columna queda en blanco para anotarla a mano.'),
  ('ls_fr_43_03_copia_fisica', 'PENDIENTE', 'Pendiente de Dirección Técnica: si viaja una copia física prellenada. Mientras tanto solo se genera el documento final.')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Personal de transporte y rutas
-- ─────────────────────────────────────────────────────────────────────────────

-- Conductores y auxiliares de las rutas. No son necesariamente usuarios del WMS (el conductor firma en papel).
create table if not exists wms.personal_transporte (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  funcion text not null check (funcion in ('CONDUCTOR', 'AUXILIAR')),
  dni text,
  activo boolean not null default true,
  usuario_id uuid,                                   -- si además usa el WMS (S9: «Mis rutas»)
  creado_en timestamptz not null default now()
);
alter table wms.personal_transporte enable row level security;
create unique index if not exists personal_transporte_nombre_uk on wms.personal_transporte (lower(btrim(nombre)), funcion);

create table if not exists wms.rutas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                       -- RUT-AAAA-NNNNN
  fecha date not null,
  estado text not null default 'BORRADOR' check (estado in
    ('BORRADOR', 'PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA', 'CANCELADA')),
  version integer not null default 1 check (version >= 1),
  vehiculo_id uuid references wms.vehiculos(id),
  conductor_id uuid references wms.personal_transporte(id),
  auxiliar_id uuid references wms.personal_transporte(id),
  motivo_cancelacion text,
  creada_por uuid not null,
  creada_en timestamptz not null default now(),
  confirmada_por uuid,
  confirmada_en timestamptz
);
alter table wms.rutas enable row level security;
create index if not exists rutas_fecha_idx on wms.rutas (fecha desc);

create table if not exists wms.ruta_paradas (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  secuencia integer not null check (secuencia >= 1),
  pedido_id text not null,                           -- el id del pedido en Pedidos
  pedido_despacho_id uuid not null references wms.pedidos_despacho(id),
  salida_id uuid references wms.salidas(id),
  excepcion_corte boolean not null default false,
  motivo_excepcion text,
  activa boolean not null default true,              -- false = salió del plan en una versión posterior (queda como historia)
  creada_en timestamptz not null default now(),
  check (not excepcion_corte or nullif(btrim(coalesce(motivo_excepcion, '')), '') is not null)
);
alter table wms.ruta_paradas enable row level security;
create unique index if not exists ruta_paradas_secuencia_uk on wms.ruta_paradas (ruta_id, secuencia) where activa;
create unique index if not exists ruta_paradas_pedido_uk on wms.ruta_paradas (pedido_id) where activa;      -- un pedido, una sola ruta viva
create index if not exists ruta_paradas_ruta_idx on wms.ruta_paradas (ruta_id);

create table if not exists wms.ruta_versiones (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null references wms.rutas(id),
  version integer not null,
  fecha date not null,
  vehiculo_id uuid,
  conductor_id uuid,
  auxiliar_id uuid,
  paradas jsonb not null,                            -- [{secuencia, pedido_id, numero, cliente, excepcion_corte, motivo_excepcion}]
  motivo text,
  por uuid not null,
  en timestamptz not null default now(),
  unique (ruta_id, version)
);
alter table wms.ruta_versiones enable row level security;

-- El registro base del formato LS-FR.43.03: nace al confirmar la ruta; las filas se derivan de las paradas (S4b), no se copian.
create table if not exists wms.registros_ls_fr_43_03 (
  id uuid primary key default gen_random_uuid(),
  ruta_id uuid not null unique references wms.rutas(id),
  estado text not null default 'BASE' check (estado in ('BASE', 'ENRIQUECIDO', 'EN_EJECUCION', 'COMPLETO', 'GENERADO', 'ARCHIVADO')),
  codigo text not null,
  version_formato text not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now()
);
alter table wms.registros_ls_fr_43_03 enable row level security;

do $$ declare t text; begin
  foreach t in array array['personal_transporte', 'rutas', 'ruta_paradas', 'ruta_versiones', 'registros_ls_fr_43_03'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then
      execute format('drop policy lectura on wms.%I', t);
    end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
    execute format('grant select on wms.%I to authenticated', t);
  end loop;
  foreach t in array array['ruta_versiones'] loop
    if exists (select 1 from pg_trigger where tgname = 'ruta_versiones_inmutable' and tgrelid = 'wms.ruta_versiones'::regclass and not tgisinternal) then
      drop trigger ruta_versiones_inmutable on wms.ruta_versiones;
    end if;
    create trigger ruta_versiones_inmutable before update or delete on wms.ruta_versiones for each row execute function wms.trg_inmutable();
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Funciones
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function wms.guardar_personal_transporte(p_id uuid, p_nombre text, p_funcion text, p_activo boolean default true)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := p_id; v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para administrar el personal de transporte');
  if v_nombre is null then raise exception 'Escribe el nombre' using errcode = 'P0001'; end if;
  if p_funcion not in ('CONDUCTOR', 'AUXILIAR') then raise exception 'La función es conductor o auxiliar' using errcode = 'P0001'; end if;
  if v_id is null then
    if exists (select 1 from wms.personal_transporte where lower(btrim(nombre)) = lower(v_nombre) and funcion = p_funcion) then
      raise exception 'Ya existe %', v_nombre using errcode = 'P0001';
    end if;
    insert into wms.personal_transporte (nombre, funcion, activo) values (v_nombre, p_funcion, coalesce(p_activo, true)) returning id into v_id;
  else
    update wms.personal_transporte set nombre = v_nombre, funcion = p_funcion, activo = coalesce(p_activo, true) where id = v_id;
    if not found then raise exception 'No encontramos a esa persona' using errcode = 'P0001'; end if;
  end if;
  perform wms.registrar_audit('personal_transporte_guardado', 'personal_transporte', v_id::text, null, null, v_nombre);
  return v_id;
end $$;

create or replace function wms.crear_ruta(p_fecha date, p_vehiculo uuid default null, p_conductor uuid default null, p_auxiliar uuid default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_anio text := to_char(coalesce(p_fecha, wms._hoy_lima()), 'YYYY');
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  if p_fecha is null then raise exception 'Indica la fecha de la ruta' using errcode = 'P0001'; end if;
  if p_fecha < wms._hoy_lima() then raise exception 'La fecha de la ruta no puede ser anterior a hoy' using errcode = 'P0001'; end if;
  insert into wms.rutas (id, numero, fecha, vehiculo_id, conductor_id, auxiliar_id, creada_por)
  values (v_id, 'RUT-' || v_anio || '-' || lpad(wms.siguiente_correlativo('RUT-' || v_anio)::text, 5, '0'), p_fecha, p_vehiculo, p_conductor, p_auxiliar, auth.uid());
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (v_id, 1, p_fecha, p_vehiculo, p_conductor, p_auxiliar, '[]'::jsonb, 'Ruta creada', auth.uid());
  perform wms.registrar_audit('ruta_creada', 'rutas', v_id::text, null, null, null);
  return v_id;
end $$;

-- ¿Pasó el corte? El pedido se importó después de las `hora_corte_planificacion` de la víspera de la fecha de la ruta (hora de Lima).
create or replace function wms._fuera_de_corte(p_importado timestamptz, p_fecha_ruta date) returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select (p_importado at time zone 'America/Lima') >
         ((p_fecha_ruta - 1)::timestamp + coalesce((select valor from wms.parametros where clave = 'hora_corte_planificacion'), '16:00')::time)
$$;

-- Guarda el plan completo de la ruta (vehículo, personal, pedidos en orden) como una versión nueva. Mientras la ruta es BORRADOR o PLANIFICADA se puede
-- cambiar; con la ruta ya planificada el motivo es obligatorio. `p_paradas` = [{pedido_id, excepcion_corte?, motivo_excepcion?}] en el orden de visita.
create or replace function wms.planificar_ruta(
  p_ruta uuid, p_fecha date, p_vehiculo uuid, p_conductor uuid, p_auxiliar uuid, p_paradas jsonb, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
#variable_conflict use_column
declare
  r wms.rutas; v wms.vehiculos; x jsonb; pd wms.pedidos_despacho; v_seq integer := 0; v_dueno uuid; v_salida uuid; v_lineas jsonb; v_exc boolean; v_mot text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_nueva integer; v_snapshot jsonb := '[]'::jsonb; v_bloqueados jsonb := '[]'::jsonb;
  v_pedidos text[] := array[]::text[]; v_prod uuid; l jsonb; v_pid text; v_viva wms.ruta_paradas; v_sin_producto text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya no se puede cambiar (está %)', lower(replace(r.estado, '_', ' ')) using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha < wms._hoy_lima() then raise exception 'La fecha de la ruta no puede ser anterior a hoy' using errcode = 'P0001'; end if;
  if r.estado = 'PLANIFICADA' and v_motivo is null then raise exception 'La ruta ya estaba planificada: indica por qué cambia' using errcode = 'P0001'; end if;
  if p_paradas is null or jsonb_typeof(p_paradas) <> 'array' then raise exception 'Las paradas deben ser una lista' using errcode = 'P0001'; end if;

  if p_vehiculo is not null then
    select * into v from wms.vehiculos where id = p_vehiculo;
    if not found then raise exception 'No encontramos ese vehículo' using errcode = 'P0001'; end if;
    if not v.activo then raise exception 'El vehículo % está inactivo', v.placa using errcode = 'P0001'; end if;
  end if;
  if p_conductor is not null and not exists (select 1 from wms.personal_transporte where id = p_conductor and funcion = 'CONDUCTOR' and activo) then
    raise exception 'El conductor elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and not exists (select 1 from wms.personal_transporte where id = p_auxiliar and funcion = 'AUXILIAR' and activo) then
    raise exception 'El auxiliar elegido no está disponible' using errcode = 'P0001';
  end if;
  if p_conductor is not null and p_conductor is not distinct from p_auxiliar then raise exception 'El conductor y el auxiliar deben ser personas distintas' using errcode = 'P0001'; end if;
  -- Un vehículo o una persona no puede estar en dos rutas vivas del mismo día
  if p_vehiculo is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and o.vehiculo_id = p_vehiculo and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El vehículo ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_conductor is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_conductor or o.auxiliar_id = p_conductor) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El conductor ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;
  if p_auxiliar is not null and exists (select 1 from wms.rutas o where o.id <> p_ruta and o.fecha = p_fecha and (o.conductor_id = p_auxiliar or o.auxiliar_id = p_auxiliar) and o.estado not in ('CERRADA', 'CANCELADA')) then
    raise exception 'El auxiliar ya está en otra ruta de ese día' using errcode = 'P0001';
  end if;

  select id into v_dueno from wms.propietarios where es_dueno_almacen and activo order by codigo limit 1;

  -- Pedidos que salen del plan: se libera su salida (si aún no se empezó a pickear) y la parada queda inactiva
  for v_viva in select * from wms.ruta_paradas where ruta_id = p_ruta and activa and pedido_id not in
      (select e->>'pedido_id' from jsonb_array_elements(p_paradas) e) loop
    if v_viva.salida_id is not null then
      if exists (select 1 from wms.ordenes_picking where salida_id = v_viva.salida_id and estado <> 'CANCELADA') then
        raise exception 'El pedido % ya tiene picking generado: no se puede sacar de la ruta', (select numero from wms.pedidos_despacho where id = v_viva.pedido_despacho_id) using errcode = 'P0001';
      end if;
      perform wms.cancelar_salida(v_viva.salida_id, coalesce(v_motivo, 'El pedido salió de la ruta'));
    end if;
    update wms.pedidos_despacho set salida_id = null where id = v_viva.pedido_despacho_id;
    update wms.ruta_paradas set activa = false where id = v_viva.id;
  end loop;
  -- Las demás se vuelven a numerar: primero inactivas, después se insertan en el orden nuevo
  update wms.ruta_paradas set activa = false where ruta_id = p_ruta and activa;

  for x in select * from jsonb_array_elements(p_paradas) loop
    v_pid := x->>'pedido_id';
    if v_pid is null or v_pid = any (v_pedidos) then raise exception 'Hay un pedido repetido o sin identificador en la ruta' using errcode = 'P0001'; end if;
    v_pedidos := v_pedidos || v_pid;
    select * into pd from wms.pedidos_despacho where pedido_id = v_pid and vigente for update;
    if not found then raise exception 'No encontramos uno de los pedidos en la bandeja' using errcode = 'P0001'; end if;
    if pd.cambio_pendiente then raise exception 'El pedido % cambió en Pedidos: revisa el cambio antes de planificarlo', pd.numero using errcode = 'P0001'; end if;
    select * into v_viva from wms.ruta_paradas where pedido_id = v_pid and activa;
    if found then raise exception 'El pedido % ya está en otra ruta', pd.numero using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(pd.snapshot->'cliente'->>'vehiculoCalificado', '')), '') is not null and (p_vehiculo is null or not v.calificado) then
      raise exception 'El cliente de % exige un vehículo calificado', pd.numero using errcode = 'P0001';
    end if;
    v_exc := coalesce((x->>'excepcion_corte')::boolean, false);
    v_mot := nullif(btrim(coalesce(x->>'motivo_excepcion', '')), '');
    if wms._fuera_de_corte(pd.importado_en, p_fecha) and not v_exc then
      raise exception 'El pedido % llegó después del corte de las % de la víspera: para incluirlo marca la excepción y escribe el motivo',
        pd.numero, coalesce((select valor from wms.parametros where clave = 'hora_corte_planificacion'), '16:00') using errcode = 'P0001';
    end if;
    if v_exc and v_mot is null then raise exception 'La excepción del pedido % necesita un motivo', pd.numero using errcode = 'P0001'; end if;

    -- La salida de distribución del pedido (una sola vez) y su asignación FEFO
    v_salida := pd.salida_id;
    if v_salida is null then
      v_lineas := '[]'::jsonb;
      for l in select * from jsonb_array_elements(pd.snapshot->'lineas') loop
        select id into v_prod from catalogo.productos where upper(codigo) = upper(l->>'productoCodigo') limit 1;
        if v_prod is null then v_sin_producto := coalesce(v_sin_producto, l->>'productoCodigo'); else
          v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', (l->>'cantidad')::integer));
        end if;
      end loop;
      if v_sin_producto is not null then raise exception 'El pedido % trae un producto que el WMS no conoce (%): Dirección Técnica debe darlo de alta', pd.numero, v_sin_producto using errcode = 'P0001'; end if;
      v_salida := wms.crear_salida('DISTRIBUCION', 'VENTA', v_dueno, v_lineas, 'pedido', pd.pedido_id, null);
      perform wms.asignar_salida(v_salida);
      update wms.pedidos_despacho set salida_id = v_salida where id = pd.id;
    end if;
    v_seq := v_seq + 1;
    insert into wms.ruta_paradas (ruta_id, secuencia, pedido_id, pedido_despacho_id, salida_id, excepcion_corte, motivo_excepcion)
    values (p_ruta, v_seq, pd.pedido_id, pd.id, v_salida, v_exc, v_mot);
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object('secuencia', v_seq, 'pedido_id', pd.pedido_id, 'numero', pd.numero, 'cliente', pd.cliente_nombre,
      'excepcion_corte', v_exc, 'motivo_excepcion', v_mot));
    if exists (select 1 from wms.salida_lineas where salida_id = v_salida and estado = 'SIN_STOCK') then
      v_bloqueados := v_bloqueados || jsonb_build_array(pd.numero);
    end if;
  end loop;

  v_nueva := r.version + 1;
  update wms.rutas set fecha = p_fecha, vehiculo_id = p_vehiculo, conductor_id = p_conductor, auxiliar_id = p_auxiliar, version = v_nueva where id = p_ruta;
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (p_ruta, v_nueva, p_fecha, p_vehiculo, p_conductor, p_auxiliar, v_snapshot, coalesce(v_motivo, 'Plan guardado'), auth.uid());
  perform wms.registrar_audit('ruta_planificada', 'rutas', p_ruta::text, null, v_snapshot, v_motivo);
  return jsonb_build_object('version', v_nueva, 'paradas', v_seq, 'bloqueados_por_stock', v_bloqueados);
end $$;

-- Confirma la ruta: BORRADOR → PLANIFICADA. Necesita vehículo, conductor y al menos una parada, y todos los pedidos con su stock asignado.
create or replace function wms.confirmar_ruta(p_ruta uuid) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; v_sin text;
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado <> 'BORRADOR' then raise exception 'La ruta ya está confirmada o cerrada' using errcode = 'P0001'; end if;
  if r.vehiculo_id is null then raise exception 'Elige el vehículo' using errcode = 'P0001'; end if;
  if r.conductor_id is null then raise exception 'Elige el conductor' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa) then raise exception 'La ruta no tiene pedidos' using errcode = 'P0001'; end if;
  select string_agg(distinct pd.numero, ', ') into v_sin
    from wms.ruta_paradas pa join wms.pedidos_despacho pd on pd.id = pa.pedido_despacho_id
   where pa.ruta_id = p_ruta and pa.activa and exists (select 1 from wms.salida_lineas sl where sl.salida_id = pa.salida_id and sl.estado = 'SIN_STOCK');
  if v_sin is not null then raise exception 'Estos pedidos no tienen stock suficiente: %. Quítalos de la ruta o espera el ingreso de stock', v_sin using errcode = 'P0001'; end if;
  update wms.rutas set estado = 'PLANIFICADA', confirmada_por = auth.uid(), confirmada_en = now() where id = p_ruta;
  insert into wms.registros_ls_fr_43_03 (ruta_id, codigo, version_formato, creado_por)
  values (p_ruta, coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_codigo'), 'LS-FR.43.03'),
          coalesce((select valor from wms.parametros where clave = 'ls_fr_43_03_version'), '01'), auth.uid())
  on conflict (ruta_id) do nothing;
  perform wms.registrar_audit('ruta_confirmada', 'rutas', p_ruta::text, null, null, null);
end $$;

create or replace function wms.cancelar_ruta(p_ruta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare r wms.rutas; pa wms.ruta_paradas; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('planificar_ruta', 'No tienes permiso para planificar rutas');
  if v_motivo is null then raise exception 'La cancelación necesita un motivo' using errcode = 'P0001'; end if;
  select * into r from wms.rutas where id = p_ruta for update;
  if not found then raise exception 'No encontramos esa ruta' using errcode = 'P0001'; end if;
  if r.estado not in ('BORRADOR', 'PLANIFICADA') then raise exception 'La ruta ya está en ejecución: no se cancela desde aquí' using errcode = 'P0001'; end if;
  for pa in select * from wms.ruta_paradas where ruta_id = p_ruta and activa loop
    if pa.salida_id is not null then
      if exists (select 1 from wms.ordenes_picking where salida_id = pa.salida_id and estado <> 'CANCELADA') then
        raise exception 'El pedido % ya tiene picking generado: no se puede cancelar la ruta', (select numero from wms.pedidos_despacho where id = pa.pedido_despacho_id) using errcode = 'P0001';
      end if;
      perform wms.cancelar_salida(pa.salida_id, v_motivo);
    end if;
    update wms.pedidos_despacho set salida_id = null where id = pa.pedido_despacho_id;
    update wms.ruta_paradas set activa = false where id = pa.id;
  end loop;
  update wms.rutas set estado = 'CANCELADA', motivo_cancelacion = v_motivo, version = version + 1 where id = p_ruta;
  insert into wms.ruta_versiones (ruta_id, version, fecha, vehiculo_id, conductor_id, auxiliar_id, paradas, motivo, por)
  values (p_ruta, r.version + 1, r.fecha, r.vehiculo_id, r.conductor_id, r.auxiliar_id, '[]'::jsonb, 'Ruta cancelada: ' || v_motivo, auth.uid());
  perform wms.registrar_audit('ruta_cancelada', 'rutas', p_ruta::text, null, null, v_motivo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants (default-deny)
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function
  wms.guardar_personal_transporte(uuid, text, text, boolean), wms.crear_ruta(date, uuid, uuid, uuid),
  wms.planificar_ruta(uuid, date, uuid, uuid, uuid, jsonb, text), wms.confirmar_ruta(uuid), wms.cancelar_ruta(uuid, text)
  to authenticated;
revoke execute on all functions in schema wms from public;
