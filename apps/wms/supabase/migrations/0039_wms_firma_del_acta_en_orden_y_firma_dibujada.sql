-- 0039 · WMS · Piloto C: el acta de recepción se firma EN ORDEN y la firma dibujada del transportista queda como referencia + huella
--
-- Cada persona firma desde su propio celular o PC con su propio usuario (no hay PIN ni celular compartido). Dos piezas, aditivas y re-ejecutables.
-- Se aplica a mano (nunca al mergear). Requiere 0004 y 0035. Termina con el `revoke execute … from public`.
--
--   1. Orden de firmas del Acta de Recepción: transportista → responsable de conteo → Jefe de Almacén → Dirección Técnica.
--      `wms.firmar_acta_recepcion` rechaza una firma fuera de orden y dice a quién le toca. El acta firmada sigue inmutable.
--   2. La firma dibujada del transportista ya no viaja dentro de la fila: se guarda en el Storage (bucket privado `wms-documentos`) y la fila
--      guarda su REFERENCIA (`firmas/<16 hex>-<sha256 en hex>.png`, direccionada por contenido) y su HUELLA (`imagen_hash`, sacada de la propia
--      referencia). `registrado_por` sigue siendo quien capturó la firma (el usuario que atendía al transportista); `nombre`, `dni`, `placa`,
--      `imagen_ref` e `imagen_hash`, quién firmó. Las filas viejas (con la imagen dentro, `imagen_firma`) siguen siendo válidas.

alter table wms.acta_firmas
  add column if not exists imagen_ref text,
  add column if not exists imagen_hash text;

-- La regla vieja pedía `imagen_firma`; la nueva acepta la imagen dentro de la fila (filas viejas) o la referencia con su huella.
-- Se busca por contenido (y no por nombre) porque la restricción vieja nació sin nombre propio. Nada de lo existente deja de cumplirla.
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = to_regclass('wms.acta_firmas') and contype = 'c' and pg_get_constraintdef(oid) like '%imagen_firma IS NOT NULL%' loop
    execute format('alter table wms.acta_firmas drop constraint %I', c.conname);
  end loop;
end $$;
alter table wms.acta_firmas add constraint acta_firmas_transportista_completo
  check (rol_firma <> 'TRANSPORTISTA' or (dni is not null and nullif(trim(placa), '') is not null
         and (imagen_firma is not null or (imagen_ref is not null and imagen_hash ~ '^[0-9a-f]{64}$'))));
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'acta_firmas_ref_formato' and conrelid = to_regclass('wms.acta_firmas')) then
    alter table wms.acta_firmas drop constraint acta_firmas_ref_formato;
  end if;
end $$;
alter table wms.acta_firmas add constraint acta_firmas_ref_formato
  check (imagen_ref is null or (imagen_ref ~ '^firmas/[0-9a-f]{16}-[0-9a-f]{64}\.png$' and imagen_hash = substring(imagen_ref from '([0-9a-f]{64})\.png$')));

-- Misma función de la 0004 más: el orden de las firmas, la imagen como referencia con huella y quién capturó en la auditoría.
create or replace function wms.firmar_acta_recepcion(
  p_acta uuid, p_rol_firma text, p_nombre text,
  p_dni text default null, p_placa text default null, p_imagen text default null)
returns jsonb language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  a wms.actas_recepcion;
  v_faltan text[];
  v_hechas text[];
  v_toca text;
  v_hash text;
  v_orden constant text[] := array['TRANSPORTISTA', 'RESPONSABLE_CONTEO', 'JEFE_ALMACEN', 'DIRECCION_TECNICA'];
  v_etiqueta constant jsonb := jsonb_build_object('TRANSPORTISTA', 'el transportista', 'RESPONSABLE_CONTEO', 'el responsable de conteo',
                                                   'JEFE_ALMACEN', 'el Jefe de Almacén', 'DIRECCION_TECNICA', 'Dirección Técnica');
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  select * into a from wms.actas_recepcion where id = p_acta for update;
  if not found then raise exception 'Acta inexistente' using errcode = 'P0001'; end if;
  if a.estado <> 'BORRADOR' then
    raise exception 'El acta % ya no admite firmas (%)', a.numero, lower(a.estado) using errcode = 'P0001';
  end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Falta el nombre de quien firma' using errcode = 'P0001'; end if;

  -- Primero quién eres (permiso), después el turno.
  if p_rol_firma = 'JEFE_ALMACEN' then
    if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe') then
      raise exception 'Solo el Jefe de Almacén (o su reemplazo) firma como Jefe de Almacén' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'DIRECCION_TECNICA' then
    if not wms.tiene_rol('direccion_tecnica') then
      raise exception 'Solo Dirección Técnica firma como Dirección Técnica' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'RESPONSABLE_CONTEO' then
    if not wms.tiene_permiso('ejecutar') then
      raise exception 'Solo el personal de almacén firma como responsable de conteo' using errcode = '42501';
    end if;
  elsif p_rol_firma = 'TRANSPORTISTA' then
    if not wms.tiene_permiso('ejecutar') then
      raise exception 'Solo el personal de almacén registra la firma del transportista' using errcode = '42501';
    end if;
  else
    raise exception 'Rol de firma inválido: %', p_rol_firma using errcode = 'P0001';
  end if;

  select coalesce(array_agg(f.rol_firma), '{}') into v_hechas from wms.acta_firmas f where f.acta_tipo = 'RECEPCION' and f.acta_id = p_acta;
  if p_rol_firma = any (v_hechas) then raise exception 'Ese rol ya firmó esta acta' using errcode = 'P0001'; end if;
  select r into v_toca from unnest(v_orden) with ordinality t(r, n) where r <> all (v_hechas) order by n limit 1;
  if v_toca is distinct from p_rol_firma then
    raise exception 'Todavía no le toca a %. Le toca a %.',
      case p_rol_firma when 'TRANSPORTISTA' then 'Transportista' when 'RESPONSABLE_CONTEO' then 'Responsable de conteo'
                       when 'JEFE_ALMACEN' then 'Jefe de Almacén' else 'Dirección Técnica' end,
      case v_toca when 'TRANSPORTISTA' then 'Transportista' when 'RESPONSABLE_CONTEO' then 'Responsable de conteo'
                  when 'JEFE_ALMACEN' then 'Jefe de Almacén' else 'Dirección Técnica' end
      using errcode = 'P0001';
  end if;

  if p_rol_firma = 'TRANSPORTISTA' then
    if p_dni is null or p_dni !~ '^[0-9]{8}$' then
      raise exception 'El DNI del transportista debe tener 8 dígitos' using errcode = 'P0001';
    end if;
    if nullif(trim(p_placa), '') is null then raise exception 'Falta la placa del vehículo' using errcode = 'P0001'; end if;
    v_hash := substring(p_imagen from '^firmas/[0-9a-f]{16}-([0-9a-f]{64})\.png$');
    if v_hash is null then
      raise exception 'Falta la firma del transportista en pantalla' using errcode = 'P0001';
    end if;
  end if;

  insert into wms.acta_firmas (acta_tipo, acta_id, rol_firma, user_id, nombre, dni, placa, imagen_ref, imagen_hash, registrado_por, hash_contenido)
  values ('RECEPCION', p_acta, p_rol_firma,
          case when p_rol_firma = 'TRANSPORTISTA' then null else v_user end,
          trim(p_nombre), p_dni, nullif(trim(p_placa), ''),
          case when p_rol_firma = 'TRANSPORTISTA' then p_imagen end, v_hash, v_user, a.hash_contenido);

  select array_agg(r) into v_faltan from unnest(v_orden) r
   where not exists (select 1 from wms.acta_firmas f where f.acta_tipo = 'RECEPCION' and f.acta_id = p_acta and f.rol_firma = r);
  if v_faltan is null then
    update wms.actas_recepcion set estado = 'FIRMADA', firmada_en = now() where id = p_acta;
  end if;
  perform wms.registrar_audit('acta_recepcion_firmada', 'actas_recepcion', p_acta::text, null,
    jsonb_build_object('rol', p_rol_firma, 'hash', a.hash_contenido, 'completa', v_faltan is null, 'captura', v_user,
                       'huella_firma', v_hash));
  return jsonb_build_object('completa', v_faltan is null, 'faltan', coalesce(to_jsonb(v_faltan), '[]'::jsonb));
exception when unique_violation then
  raise exception 'Ese rol ya firmó esta acta' using errcode = 'P0001';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos de ejecución (default-deny): la firma ya era API; no se agrega ninguna función nueva.
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function wms.firmar_acta_recepcion(uuid, text, text, text, text, text) to authenticated;
revoke execute on all functions in schema wms from public;
