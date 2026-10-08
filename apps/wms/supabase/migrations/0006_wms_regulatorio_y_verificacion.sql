-- WMS Logisalud — migración 0006: datos regulatorios con autoridad de Dirección Técnica (D-37),
-- verificador distinto de quien preparó y de quien ejecutó (D-15), código provisional del Kardex (D-29)
-- y vista de stock con su origen (D-31).
--
-- NO SE APLICA SOLA. Re-ejecutable. Las eliminaciones usan comprobaciones explícitas de existencia
-- (no `drop ... if exists`) para poder aplicarse con la herramienta de migraciones sin sorpresas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Datos regulatorios (D-37)
--    Solo Katia (direccion_tecnica) y Sandra (asistente_dt), con la misma autoridad y SIN validación adicional.
--    Todo cambio pasa por funciones: campo, antes, después, usuario, fecha y motivo obligatorio.
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.producto_regulatorio
  add column if not exists concentracion text,
  add column if not exists condicion_almacenamiento text;

create table if not exists wms.producto_regulatorio_cambios (
  id bigint generated always as identity primary key,
  producto_id uuid not null,
  campo text not null,
  antes text,
  despues text,
  usuario uuid,
  ts timestamptz not null default now(),
  motivo text not null check (nullif(trim(motivo), '') is not null)
);
alter table wms.producto_regulatorio_cambios enable row level security;
create index if not exists producto_reg_cambios_idx on wms.producto_regulatorio_cambios (producto_id, id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'reg_cambios_inmutable' and tgrelid = 'wms.producto_regulatorio_cambios'::regclass) then
    create trigger reg_cambios_inmutable before update or delete on wms.producto_regulatorio_cambios
      for each row execute function wms.trg_inmutable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'reg_cambios_inmutable_tr' and tgrelid = 'wms.producto_regulatorio_cambios'::regclass) then
    create trigger reg_cambios_inmutable_tr before truncate on wms.producto_regulatorio_cambios
      for each statement execute function wms.trg_inmutable();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'producto_regulatorio_cambios' and policyname = 'lectura') then
    create policy lectura on wms.producto_regulatorio_cambios for select to authenticated using (wms.es_usuario());
  end if;
end $$;

-- Ya no hay escritura directa ni flujo de validación: se retiran las policies de alta/edición/validación y el DML.
do $$ declare p text; begin
  foreach p in array array['alta_sandra', 'edita_sandra', 'valida_katia'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'producto_regulatorio' and policyname = p) then
      execute format('drop policy %I on wms.producto_regulatorio', p);
    end if;
  end loop;
end $$;
revoke insert, update on wms.producto_regulatorio from authenticated;
grant select on wms.producto_regulatorio_cambios to authenticated;

do $$ begin
  if to_regprocedure('wms.validar_producto(uuid, text, text)') is not null then drop function wms.validar_producto(uuid, text, text); end if;
  if to_regprocedure('wms.actualizar_regulatorio(uuid, text, date, text, text)') is not null then drop function wms.actualizar_regulatorio(uuid, text, date, text, text); end if;
  if to_regprocedure('wms.crear_producto(text, text, text, text, text, text, text, date, text, text)') is not null then
    drop function wms.crear_producto(text, text, text, text, text, text, text, date, text, text);
  end if;
end $$;

create or replace function wms._exigir_regulatorio() returns void
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode = '42501'; end if;
  if not wms.tiene_rol('asistente_dt', 'direccion_tecnica') then
    raise exception 'Solo Dirección Técnica y su asistente editan los datos regulatorios' using errcode = '42501';
  end if;
end $$;

-- Campos editables: los de este maestro. Presentación y principio activo viven en catalogo.productos (de Compras): no se duplican aquí.
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

create or replace function wms.crear_producto(
  p_codigo text,
  p_descripcion text,
  p_presentacion text default null,
  p_marca text default null,
  p_principio_activo text default null,
  p_unidad_medida text default 'UND',
  p_registro_sanitario text default null,
  p_rs_vence date default null,
  p_fabricante text default null,
  p_forma_presentacion text default null,
  p_concentracion text default null,
  p_condicion_almacenamiento text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_id uuid;
begin
  perform wms._exigir_regulatorio();
  if nullif(trim(p_codigo), '') is null or nullif(trim(p_descripcion), '') is null then
    raise exception 'El producto necesita código y descripción' using errcode = 'P0001';
  end if;
  if exists (select 1 from catalogo.productos where codigo = trim(p_codigo)) then
    raise exception 'Ya existe un producto con el código %', trim(p_codigo) using errcode = '23505';
  end if;
  if nullif(trim(p_registro_sanitario), '') is not null and p_rs_vence is null then
    raise exception 'Falta el vencimiento del registro sanitario' using errcode = 'P0001';
  end if;
  insert into catalogo.productos (codigo, descripcion, presentacion, marca, principio_activo, unidad_medida)
  values (trim(p_codigo), trim(p_descripcion), nullif(trim(p_presentacion), ''), nullif(trim(p_marca), ''),
          nullif(trim(p_principio_activo), ''), coalesce(nullif(trim(p_unidad_medida), ''), 'UND'))
  returning id into v_id;
  insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, fabricante, forma_presentacion, concentracion,
                                        condicion_almacenamiento, creado_por, estado_validacion, validado_por, validado_en)
  values (v_id, nullif(trim(p_registro_sanitario), ''), p_rs_vence, nullif(trim(p_fabricante), ''),
          nullif(trim(p_forma_presentacion), ''), nullif(trim(p_concentracion), ''), nullif(trim(p_condicion_almacenamiento), ''),
          auth.uid(), 'VALIDADO', auth.uid(), now());
  insert into wms.producto_regulatorio_cambios (producto_id, campo, antes, despues, usuario, motivo)
  select v_id, c.campo, null, c.valor, auth.uid(), 'Alta del producto'
    from (values ('registro_sanitario', nullif(trim(p_registro_sanitario), '')), ('rs_vence', p_rs_vence::text),
                 ('fabricante', nullif(trim(p_fabricante), '')), ('forma_presentacion', nullif(trim(p_forma_presentacion), '')),
                 ('concentracion', nullif(trim(p_concentracion), '')), ('condicion_almacenamiento', nullif(trim(p_condicion_almacenamiento), ''))) c(campo, valor)
   where c.valor is not null;
  perform wms.registrar_audit('producto_creado', 'productos', v_id::text, null, jsonb_build_object('codigo', trim(p_codigo)), 'Alta del producto');
  return v_id;
end $$;

grant execute on function
  wms.editar_regulatorio(uuid, jsonb, text),
  wms.crear_producto(text, text, text, text, text, text, text, date, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. D-15: el verificador no es quien preparó ni quien ejecutó
-- ─────────────────────────────────────────────────────────────────────────────

alter table wms.movimientos add column if not exists preparador_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_verificador_distinto_preparador' and conrelid = 'wms.movimientos'::regclass) then
    alter table wms.movimientos add constraint movimientos_verificador_distinto_preparador
      check (verificador_id is null or preparador_id is null or verificador_id <> preparador_id);
  end if;
end $$;

create or replace function wms.validar_movimiento(p_mov uuid)
returns void language plpgsql set search_path = wms, pg_temp as $$
declare
  v wms.movimientos;
  r record;
begin
  select * into v from wms.movimientos where id = p_mov;
  if not found then return; end if;

  if v.tipo = 'INGRESO' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'Un ingreso solo suma unidades' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and origen = 'DEVOLUCION' and estado <> 'DEVOLUCIONES') then
      raise exception 'Una devolución nace en el estado Devoluciones, nunca en Cuarentena' using errcode = 'P0001';
    end if;
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and origen <> 'DEVOLUCION' and estado <> 'CUARENTENA') then
      raise exception 'Todo ingreso de compra o de cliente nace en Cuarentena' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'CARGA_INICIAL' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'La carga inicial solo suma unidades' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'MOVIMIENTO' then
    for r in
      select producto_id, lote_id, propietario_id, procedencia_id, estado, sum(delta) as neto
        from wms.partidas where movimiento_id = p_mov
       group by 1, 2, 3, 4, 5 having sum(delta) <> 0
    loop
      raise exception 'Un movimiento interno no puede cambiar el estado ni la cantidad (estado %, neto %)', r.estado, r.neto
        using errcode = 'P0001';
    end loop;
  elsif v.tipo = 'CAMBIO_ESTADO' then
    for r in
      select posicion_id, producto_id, lote_id, propietario_id, procedencia_id, sum(delta) as neto
        from wms.partidas where movimiento_id = p_mov
       group by 1, 2, 3, 4, 5 having sum(delta) <> 0
    loop
      raise exception 'Un cambio de estado no puede cambiar la cantidad' using errcode = 'P0001';
    end loop;
    for r in
      select o.estado as desde, d.estado as hasta, o.producto_id, o.lote_id
        from wms.partidas o join wms.partidas d
          on d.movimiento_id = o.movimiento_id and d.posicion_id = o.posicion_id
         and d.producto_id = o.producto_id and d.lote_id = o.lote_id
         and d.propietario_id = o.propietario_id and d.procedencia_id = o.procedencia_id
       where o.movimiento_id = p_mov and o.delta < 0 and d.delta > 0
    loop
      if not exists (select 1 from wms.transiciones_estado t where t.desde = r.desde and t.hasta = r.hasta) then
        raise exception 'Transición no permitida: % → %', r.desde, r.hasta using errcode = 'P0001';
      end if;
      if r.hasta = 'APROBADO' then
        -- D-37: sin validación adicional; para aprobar, Dirección Técnica o su asistente dejaron cargado el registro y su vencimiento.
        if not exists (select 1 from wms.producto_regulatorio pr
                        where pr.producto_id = r.producto_id and nullif(trim(pr.registro_sanitario), '') is not null
                          and pr.rs_vence is not null) then
          raise exception 'El producto no tiene su registro sanitario y su vencimiento cargados: no se puede aprobar' using errcode = 'P0001';
        end if;
        if exists (select 1 from wms.producto_regulatorio pr
                    where pr.producto_id = r.producto_id and pr.rs_vence is not null and pr.rs_vence < current_date) then
          raise exception 'El registro sanitario está vencido: el lote no se puede aprobar hasta que Dirección Técnica lo resuelva'
            using errcode = 'P0001';
        end if;
      end if;
    end loop;
    if v.sustento_id is null then
      raise exception 'Un cambio de estado necesita su sustento (acta firmada)' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'AJUSTE' then
    if v.sustento_id is null then
      raise exception 'Un ajuste necesita su sustento (evidencia y aprobación)' using errcode = 'P0001';
    end if;
  end if;

  if v.verificador_id is not null and v.verificador_id = v.ejecutor_id then
    raise exception 'El verificador no puede ser quien ejecutó el movimiento' using errcode = 'P0001';
  end if;
  if v.verificador_id is not null and v.verificador_id = v.preparador_id then
    raise exception 'El verificador no puede ser quien preparó el movimiento' using errcode = 'P0001';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. D-29: código provisional del formato de Kardex (configurable; el PDF lo muestra como provisional)
-- ─────────────────────────────────────────────────────────────────────────────

insert into wms.parametros (clave, valor, nota) values
  ('kardex_codigo_formato', 'LS-FR-KDX (provisional)', 'D-29: no hay código controlado; el PDF del Kardex lo muestra como provisional')
on conflict (clave) do update set valor = excluded.valor, nota = excluded.nota where wms.parametros.valor = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El origen del ingreso es un dato separado del estado (D-31): el stock se puede filtrar por origen
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view wms.v_stock_por_origen with (security_invoker = true) as
select v.*, (select p.origen from wms.partidas p where p.procedencia_id = v.procedencia_id and p.delta > 0 order by p.id limit 1) as origen
  from wms.v_stock v;
grant select on wms.v_stock_por_origen to authenticated;
