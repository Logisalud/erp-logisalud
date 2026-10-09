-- Reversa SOLO de la migración 0008 (D-38). SE EJECUTA A MANO. Probada en tests/db/presentacion-principio.test.ts.
-- Quita el trigger de catalogo.productos y devuelve `wms.editar_regulatorio` a la versión de 0006 (sin presentación ni principio activo).
-- No toca datos: lo que ya se editó queda en catalogo.productos y en wms.producto_regulatorio_cambios (inmutable).
set lock_timeout = '5s';
set statement_timeout = '60s';

do $$ begin
  if to_regclass('catalogo.productos') is not null
     and exists (select 1 from pg_trigger where tgname = 'proteger_presentacion_principio' and tgrelid = 'catalogo.productos'::regclass) then
    drop trigger proteger_presentacion_principio on catalogo.productos;
  end if;
  if to_regprocedure('wms.trg_proteger_presentacion_principio()') is not null then
    drop function wms.trg_proteger_presentacion_principio();
  end if;
end $$;

create or replace function wms.editar_regulatorio(p_producto uuid, p_datos jsonb, p_motivo text)
returns integer language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.producto_regulatorio;
  k text;
  v_antes text;
  v_despues text;
  v_n integer := 0;
  v_campos text[] := array['registro_sanitario', 'rs_vence', 'forma_presentacion', 'concentracion', 'fabricante', 'condicion_almacenamiento'];
begin
  perform wms._exigir_regulatorio();
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Todo cambio de datos regulatorios necesita su motivo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from catalogo.productos where id = p_producto) then
    raise exception 'El producto no existe en el catálogo' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(coalesce(p_datos, '{}'::jsonb)) loop
    if not (k = any (v_campos)) then
      raise exception 'Ese dato no se edita aquí: %', k using errcode = 'P0001';
    end if;
  end loop;
  insert into wms.producto_regulatorio (producto_id, creado_por, estado_validacion, validado_por, validado_en)
  values (p_producto, auth.uid(), 'VALIDADO', auth.uid(), now())
  on conflict (producto_id) do nothing;
  select * into v from wms.producto_regulatorio where producto_id = p_producto for update;
  foreach k in array v_campos loop
    if not (p_datos ? k) then continue; end if;
    v_despues := nullif(trim(p_datos->>k), '');
    execute format('select %I::text from wms.producto_regulatorio where producto_id = $1', k) into v_antes using p_producto;
    if v_antes is not distinct from v_despues then continue; end if;
    if k = 'rs_vence' then
      execute 'update wms.producto_regulatorio set rs_vence = $1::date where producto_id = $2' using v_despues, p_producto;
    else
      execute format('update wms.producto_regulatorio set %I = $1 where producto_id = $2', k) using v_despues, p_producto;
    end if;
    insert into wms.producto_regulatorio_cambios (producto_id, campo, antes, despues, usuario, motivo)
    values (p_producto, k, v_antes, v_despues, auth.uid(), trim(p_motivo));
    v_n := v_n + 1;
  end loop;
  select * into v from wms.producto_regulatorio where producto_id = p_producto;
  if nullif(trim(v.registro_sanitario), '') is not null and v.rs_vence is null then
    raise exception 'Falta el vencimiento del registro sanitario' using errcode = 'P0001';
  end if;
  update wms.producto_regulatorio set estado_validacion = 'VALIDADO', observacion = null, validado_por = auth.uid(), validado_en = now()
   where producto_id = p_producto;
  if v_n > 0 then
    perform wms.registrar_audit('regulatorio_editado', 'producto_regulatorio', p_producto::text, null, p_datos, p_motivo);
  end if;
  return v_n;
end $$;
