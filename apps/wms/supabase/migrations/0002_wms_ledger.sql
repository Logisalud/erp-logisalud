-- WMS Logisalud — migración 0002: lotes, ledger append-only, saldos derivados,
-- concurrencia, reversas y kardex.
--
-- Principios:
--  · El ledger (`partidas`) solo se agrega. Nada se edita ni se borra: una
--    corrección es un movimiento nuevo vinculado (`reversa_de`).
--  · Los saldos son DERIVADOS: los mantiene un trigger del ledger y se pueden
--    reconciliar (`wms.verificar_saldos()`).
--  · Nadie escribe el ledger con DML directo: solo con wms.postear_movimiento /
--    wms.revertir_movimiento (security definer), que toman candados por celda y
--    validan zona, propietario y estado. Un trigger diferido repite las
--    validaciones al confirmar (defensa en profundidad).
--  · El estado sanitario vive en cada celda de stock, no en el lote:
--    (posición, producto, lote, propietario, estado, procedencia).
--
-- Re-ejecutable. Se aplica a mano.

create table if not exists wms.tipos_movimiento (
  codigo text primary key,
  nombre text not null,
  habilitado boolean not null default true
);
alter table wms.tipos_movimiento enable row level security;
insert into wms.tipos_movimiento (codigo, nombre, habilitado) values
  ('INGRESO', 'Ingreso', true),
  ('MOVIMIENTO', 'Movimiento interno', true),
  ('CAMBIO_ESTADO', 'Cambio de estado sanitario', true),
  ('AJUSTE', 'Ajuste autorizado', true),
  ('CARGA_INICIAL', 'Carga inicial', true),
  ('REVERSA', 'Reversa', true)
on conflict (codigo) do nothing;

create table if not exists wms.lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null,
  codigo text not null,
  vence date,
  vence_texto_original text,
  propietario_id uuid not null references wms.propietarios(id),
  creado_en timestamptz not null default now(),
  unique (producto_id, codigo, propietario_id)
);
alter table wms.lotes enable row level security;
do $$ begin
  if to_regclass('catalogo.productos') is not null then
    begin
      alter table wms.lotes add constraint lotes_producto_fk
        foreign key (producto_id) references catalogo.productos(id);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- Una segunda entrega del mismo lote reutiliza el lote, pero con el MISMO
-- vencimiento: otra fecha para el mismo producto/código/propietario se rechaza.
create or replace function wms.asegurar_lote(
  p_producto uuid, p_codigo text, p_vence date, p_propietario uuid, p_vence_texto text default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare v wms.lotes;
begin
  if not wms.tiene_permiso('ejecutar') and not wms.tiene_permiso('configurar') then
    raise exception 'No tienes permiso para registrar lotes' using errcode = '42501';
  end if;
  select * into v from wms.lotes
   where producto_id = p_producto and codigo = p_codigo and propietario_id = p_propietario;
  if found then
    if v.vence is distinct from p_vence then
      raise exception 'El lote % ya existe con otro vencimiento (%). Un mismo lote no puede tener dos fechas.',
        p_codigo, coalesce(v.vence::text, 'sin fecha') using errcode = 'P0001';
    end if;
    return v.id;
  end if;
  insert into wms.lotes (producto_id, codigo, vence, vence_texto_original, propietario_id)
  values (p_producto, p_codigo, p_vence, p_vence_texto, p_propietario)
  returning id into v.id;
  perform wms.registrar_audit('lote_creado', 'lotes', v.id::text, null,
    jsonb_build_object('producto_id', p_producto, 'codigo', p_codigo, 'vence', p_vence));
  return v.id;
end $$;

create table if not exists wms.movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references wms.tipos_movimiento(codigo),
  flujo text not null default 'CONFIRMADO'
    check (flujo in ('PREPARADO', 'EN_VERIFICACION', 'CONFIRMADO', 'ABIERTO_CON_DIFERENCIA')),
  motivo text,
  referencia_tipo text,
  referencia_id text,
  sustento_tipo text,
  sustento_id text,
  ejecutor_id uuid,
  verificador_id uuid,
  reversa_de uuid references wms.movimientos(id),
  creado_en timestamptz not null default now(),
  -- El verificador nunca es quien ejecutó (regla de movimientos internos).
  check (verificador_id is null or verificador_id <> ejecutor_id),
  -- Toda reversa lleva motivo.
  check (reversa_de is null or nullif(trim(motivo), '') is not null)
);
alter table wms.movimientos enable row level security;
create unique index if not exists movimientos_una_reversa on wms.movimientos (reversa_de) where reversa_de is not null;

create table if not exists wms.partidas (
  id bigint generated always as identity primary key,
  movimiento_id uuid not null references wms.movimientos(id),
  ts timestamptz not null default now(),
  posicion_id uuid not null references wms.posiciones(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  propietario_id uuid not null references wms.propietarios(id),
  estado text not null references wms.estados_sanitarios(codigo),
  origen text not null references wms.origenes(codigo),
  procedencia_id uuid not null,   -- la entrega (ingreso_lote, carga, ajuste) que originó estas unidades
  delta integer not null check (delta <> 0)
);
alter table wms.partidas enable row level security;
create index if not exists partidas_celda_idx on wms.partidas (posicion_id, producto_id, lote_id);
create index if not exists partidas_lote_idx on wms.partidas (lote_id, ts);
create index if not exists partidas_mov_idx on wms.partidas (movimiento_id);

-- Inmutabilidad del ledger y de los movimientos.
do $$ begin if exists (select 1 from pg_trigger where tgname = 'partidas_inmutable' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then drop trigger partidas_inmutable on wms.partidas; end if; end $$;
create trigger partidas_inmutable before update or delete on wms.partidas
  for each row execute function wms.trg_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'partidas_inmutable_truncate' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then drop trigger partidas_inmutable_truncate on wms.partidas; end if; end $$;
create trigger partidas_inmutable_truncate before truncate on wms.partidas
  for each statement execute function wms.trg_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'movimientos_inmutable' and tgrelid = to_regclass('wms.movimientos') and not tgisinternal) then drop trigger movimientos_inmutable on wms.movimientos; end if; end $$;
create trigger movimientos_inmutable before update or delete on wms.movimientos
  for each row execute function wms.trg_inmutable();
do $$ begin if exists (select 1 from pg_trigger where tgname = 'movimientos_inmutable_truncate' and tgrelid = to_regclass('wms.movimientos') and not tgisinternal) then drop trigger movimientos_inmutable_truncate on wms.movimientos; end if; end $$;
create trigger movimientos_inmutable_truncate before truncate on wms.movimientos
  for each statement execute function wms.trg_inmutable();

-- Saldos: DERIVADOS del ledger (los mantiene el trigger; nadie los edita).
create table if not exists wms.saldos (
  posicion_id uuid not null references wms.posiciones(id),
  producto_id uuid not null,
  lote_id uuid not null references wms.lotes(id),
  propietario_id uuid not null references wms.propietarios(id),
  estado text not null references wms.estados_sanitarios(codigo),
  procedencia_id uuid not null,
  cantidad integer not null check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (posicion_id, producto_id, lote_id, propietario_id, estado, procedencia_id)
);
alter table wms.saldos enable row level security;
create index if not exists saldos_lote_idx on wms.saldos (lote_id);
create index if not exists saldos_producto_idx on wms.saldos (producto_id);

-- Validaciones por partida (zona, propietario, coherencia). Corre ANTES de insertar.
create or replace function wms.trg_validar_partida()
returns trigger language plpgsql set search_path = wms, pg_temp as $$
declare
  v_tipo text;
  v_lote wms.lotes;
  v_area text;
  v_ok boolean;
begin
  select tipo into v_tipo from wms.movimientos where id = new.movimiento_id;
  select * into v_lote from wms.lotes where id = new.lote_id;
  if v_lote.producto_id <> new.producto_id or v_lote.propietario_id <> new.propietario_id then
    raise exception 'El lote no corresponde al producto o al propietario de la partida' using errcode = 'P0001';
  end if;

  -- Reglas de DESTINO (unidades que entran) — salvo el cambio de estado, que es
  -- en el mismo lugar (las unidades quedan esperando su traslado).
  if new.delta > 0 and v_tipo <> 'CAMBIO_ESTADO' then
    select tipo_area into v_area from wms.posiciones where id = new.posicion_id;
    select exists (select 1 from wms.area_estado_admitido
                    where tipo_area = v_area and estado = new.estado
                      and (origen_requerido is null or origen_requerido = new.origen))
      into v_ok;
    if not v_ok then
      raise exception 'La zona % no admite unidades en estado % (origen %)', v_area, new.estado, new.origen
        using errcode = 'P0001';
    end if;
    -- Propietario: solo posiciones de su asignación vigente (o área compartida).
    -- La reversa restituye lo que estaba: no se re-evalúa la vigencia.
    if v_tipo <> 'REVERSA' and not wms.posicion_acepta(new.posicion_id, new.propietario_id, current_date) then
      raise exception 'La posición no acepta stock de ese propietario (sin asignación vigente)'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'validar_partida' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then drop trigger validar_partida on wms.partidas; end if; end $$;
create trigger validar_partida before insert on wms.partidas
  for each row execute function wms.trg_validar_partida();

-- Mantiene los saldos. El CHECK (cantidad >= 0) hace que una salida sin stock falle.
-- (Se actualiza primero y se inserta solo si no existía: en un INSERT ... ON
-- CONFLICT, Postgres valida el CHECK sobre la fila propuesta antes de detectar
-- el conflicto, y una salida —delta negativo— fallaría aunque haya stock.)
create or replace function wms.trg_aplicar_saldo()
returns trigger language plpgsql security definer set search_path = wms, pg_temp as $$
begin
  update wms.saldos s
     set cantidad = s.cantidad + new.delta, actualizado_en = now()
   where s.posicion_id = new.posicion_id and s.producto_id = new.producto_id and s.lote_id = new.lote_id
     and s.propietario_id = new.propietario_id and s.estado = new.estado and s.procedencia_id = new.procedencia_id;
  if not found then
    if new.delta < 0 then
      raise exception 'Saldo insuficiente' using errcode = '23514', constraint = 'saldos_cantidad_check';
    end if;
    insert into wms.saldos (posicion_id, producto_id, lote_id, propietario_id, estado, procedencia_id, cantidad)
    values (new.posicion_id, new.producto_id, new.lote_id, new.propietario_id, new.estado, new.procedencia_id, new.delta);
  end if;
  return new;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'aplicar_saldo' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then drop trigger aplicar_saldo on wms.partidas; end if; end $$;
create trigger aplicar_saldo after insert on wms.partidas
  for each row execute function wms.trg_aplicar_saldo();

-- Invariantes de un movimiento completo (se llama al final de la función y,
-- diferido, al confirmar la transacción).
create or replace function wms.validar_movimiento(p_mov uuid)
returns void language plpgsql set search_path = wms, pg_temp as $$
declare
  v wms.movimientos;
  r record;
begin
  select * into v from wms.movimientos where id = p_mov;
  if not found then return; end if;

  if v.tipo = 'INGRESO' then
    -- Todo ingreso nace en Cuarentena y solo suma unidades.
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and (delta < 0 or estado <> 'CUARENTENA')) then
      raise exception 'Todo ingreso nace en Cuarentena y solo suma unidades' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'CARGA_INICIAL' then
    if exists (select 1 from wms.partidas where movimiento_id = p_mov and delta < 0) then
      raise exception 'La carga inicial solo suma unidades' using errcode = 'P0001';
    end if;
  elsif v.tipo = 'MOVIMIENTO' then
    -- Mover no cambia el estado ni crea ni destruye unidades: por cada
    -- (producto, lote, propietario, procedencia, estado) las entradas = salidas.
    for r in
      select producto_id, lote_id, propietario_id, procedencia_id, estado, sum(delta) as neto
        from wms.partidas where movimiento_id = p_mov
       group by 1, 2, 3, 4, 5 having sum(delta) <> 0
    loop
      raise exception 'Un movimiento interno no puede cambiar el estado ni la cantidad (estado %, neto %)', r.estado, r.neto
        using errcode = 'P0001';
    end loop;
  elsif v.tipo = 'CAMBIO_ESTADO' then
    -- Mismas unidades, mismo lugar y misma procedencia: sale de un estado y entra a otro.
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
        if not exists (select 1 from wms.producto_regulatorio pr
                        where pr.producto_id = r.producto_id and pr.estado_validacion = 'VALIDADO') then
          raise exception 'El producto no tiene su registro sanitario validado: no se puede aprobar' using errcode = 'P0001';
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
end $$;

create or replace function wms.trg_validar_movimiento_diferido()
returns trigger language plpgsql set search_path = wms, pg_temp as $$
begin
  perform wms.validar_movimiento(new.movimiento_id);
  return null;
end $$;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'validar_movimiento_diferido' and tgrelid = to_regclass('wms.partidas') and not tgisinternal) then drop trigger validar_movimiento_diferido on wms.partidas; end if; end $$;
create constraint trigger validar_movimiento_diferido
  after insert on wms.partidas deferrable initially deferred
  for each row execute function wms.trg_validar_movimiento_diferido();

-- Núcleo de escritura del ledger. p_partidas = jsonb array de
-- {posicion_id, producto_id, lote_id, propietario_id, estado, origen, procedencia_id, delta}.
create or replace function wms.postear_movimiento(
  p_tipo text,
  p_motivo text,
  p_partidas jsonb,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_sustento_tipo text default null,
  p_sustento_id text default null,
  p_reversa_de uuid default null)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_constraint text;
  r record;
begin
  if v_actor is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;
  if p_partidas is null or jsonb_array_length(p_partidas) = 0 then
    raise exception 'El movimiento no tiene partidas' using errcode = 'P0001';
  end if;

  -- Permisos por tipo (además, las policies bloquean todo DML directo).
  if p_tipo = 'CAMBIO_ESTADO' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica registra cambios de estado sanitario' using errcode = '42501';
  elsif p_tipo = 'AJUSTE' and not wms.tiene_rol('direccion_tecnica') then
    raise exception 'Solo Dirección Técnica aprueba ajustes' using errcode = '42501';
  elsif p_tipo = 'CARGA_INICIAL' and not wms.tiene_permiso('configurar') then
    raise exception 'No tienes permiso para la carga inicial' using errcode = '42501';
  elsif p_tipo in ('INGRESO', 'MOVIMIENTO', 'REVERSA') and not wms.tiene_permiso('ejecutar') then
    raise exception 'No tienes permiso para registrar movimientos' using errcode = '42501';
  end if;
  if not exists (select 1 from wms.tipos_movimiento where codigo = p_tipo and habilitado) then
    raise exception 'Tipo de movimiento no habilitado: %', p_tipo using errcode = 'P0001';
  end if;

  -- Candados por celda, en orden determinista (sin interbloqueos): dos personas
  -- que tocan las mismas unidades se serializan y la segunda ve el saldo real.
  for r in
    select distinct (x->>'posicion_id') as pos, (x->>'lote_id') as lote, (x->>'estado') as est,
           (x->>'procedencia_id') as proc
      from jsonb_array_elements(p_partidas) x
     order by 1, 2, 3, 4
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.pos || '|' || r.lote || '|' || r.est || '|' || r.proc, 0));
  end loop;

  insert into wms.movimientos (id, tipo, motivo, referencia_tipo, referencia_id, sustento_tipo, sustento_id,
                               ejecutor_id, reversa_de)
  values (v_id, p_tipo, p_motivo, p_referencia_tipo, p_referencia_id, p_sustento_tipo, p_sustento_id,
          v_actor, p_reversa_de);

  insert into wms.partidas (movimiento_id, posicion_id, producto_id, lote_id, propietario_id, estado,
                            origen, procedencia_id, delta)
  select v_id, (x->>'posicion_id')::uuid, (x->>'producto_id')::uuid, (x->>'lote_id')::uuid,
         (x->>'propietario_id')::uuid, x->>'estado', x->>'origen', (x->>'procedencia_id')::uuid,
         (x->>'delta')::int
    from jsonb_array_elements(p_partidas) x;

  perform wms.validar_movimiento(v_id);
  perform wms.registrar_audit('movimiento_' || lower(p_tipo), 'movimientos', v_id::text, null,
                              jsonb_build_object('partidas', p_partidas), p_motivo);
  return v_id;
exception when check_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'saldos_cantidad_check' then
    -- La interfaz arma el mensaje humano a partir de este código.
    raise exception 'Saldo insuficiente: alguien más ya movió esas unidades o no hay stock suficiente'
      using errcode = 'P0002';
  end if;
  raise;
end $$;

-- Reversa: movimiento inverso vinculado al original; el original queda intacto.
create or replace function wms.revertir_movimiento(p_movimiento uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  v wms.movimientos;
  v_partidas jsonb;
begin
  if not wms.tiene_rol('jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica') then
    raise exception 'Solo el Jefe de Almacén (o su reemplazo) o Dirección Técnica revierten movimientos'
      using errcode = '42501';
  end if;
  select * into v from wms.movimientos where id = p_movimiento;
  if not found then raise exception 'Movimiento inexistente' using errcode = 'P0001'; end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'La reversa necesita un motivo' using errcode = 'P0001';
  end if;
  if v.tipo = 'CAMBIO_ESTADO' then
    raise exception 'Un cambio de estado no se revierte (Aprobado nunca vuelve a Cuarentena): se corrige con un nuevo cambio hacia Bajas/Rechazados'
      using errcode = 'P0001';
  end if;
  if v.reversa_de is not null then
    raise exception 'No se revierte una reversa' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object(
           'posicion_id', posicion_id, 'producto_id', producto_id, 'lote_id', lote_id,
           'propietario_id', propietario_id, 'estado', estado, 'origen', origen,
           'procedencia_id', procedencia_id, 'delta', -delta))
    into v_partidas from wms.partidas where movimiento_id = p_movimiento;
  return wms.postear_movimiento('REVERSA', p_motivo, v_partidas, 'movimiento', p_movimiento::text,
                                null, null, p_movimiento);
end $$;

-- Reconciliación: los saldos deben ser exactamente la suma del ledger.
create or replace function wms.verificar_saldos()
returns table (posicion_id uuid, producto_id uuid, lote_id uuid, propietario_id uuid, estado text,
               procedencia_id uuid, en_ledger bigint, en_saldos integer)
language sql stable set search_path = wms, pg_temp as $$
  select coalesce(l.posicion_id, s.posicion_id), coalesce(l.producto_id, s.producto_id),
         coalesce(l.lote_id, s.lote_id), coalesce(l.propietario_id, s.propietario_id),
         coalesce(l.estado, s.estado), coalesce(l.procedencia_id, s.procedencia_id),
         coalesce(l.suma, 0), coalesce(s.cantidad, 0)
    from (select p.posicion_id, p.producto_id, p.lote_id, p.propietario_id, p.estado, p.procedencia_id,
                 sum(p.delta) as suma
            from wms.partidas p group by 1, 2, 3, 4, 5, 6) l
    full join wms.saldos s using (posicion_id, producto_id, lote_id, propietario_id, estado, procedencia_id)
   where coalesce(l.suma, 0) <> coalesce(s.cantidad, 0)
$$;

-- Kardex: saldo acumulado reconstruido desde los movimientos de cada lote.
create or replace view wms.v_kardex with (security_invoker = true) as
  select p.lote_id, p.producto_id, p.propietario_id, p.id as partida_id, p.ts, m.tipo, m.motivo,
         p.posicion_id, p.estado, p.origen, p.procedencia_id, p.delta,
         sum(p.delta) over (partition by p.lote_id order by p.id) as saldo_acumulado_lote
    from wms.partidas p join wms.movimientos m on m.id = p.movimiento_id;

-- Stock por posición con la posición y el lote ya unidos (la búsqueda y el mapa lo leen).
create or replace view wms.v_stock with (security_invoker = true) as
  select s.posicion_id, ps.codigo as posicion, ps.tipo_area, s.producto_id, s.lote_id, l.codigo as lote,
         l.vence, s.propietario_id, o.codigo as propietario, s.estado, s.procedencia_id, s.cantidad
    from wms.saldos s
    join wms.posiciones ps on ps.id = s.posicion_id
    join wms.lotes l on l.id = s.lote_id
    join wms.propietarios o on o.id = s.propietario_id
   where s.cantidad > 0;

-- RLS: lectura para quien tenga rol WMS; DML directo a ledger/saldos: nadie.
do $$ declare t text; begin
  foreach t in array array['tipos_movimiento', 'lotes', 'movimientos', 'partidas', 'saldos'] loop
    if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = t and policyname = 'lectura') then execute format('drop policy lectura on wms.%I', t); end if;
    execute format('create policy lectura on wms.%I for select to authenticated using (wms.es_usuario())', t);
  end loop;
end $$;
do $$ begin if exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'tipos_movimiento' and policyname = 'escritura') then drop policy escritura on wms.tipos_movimiento; end if; end $$;
create policy escritura on wms.tipos_movimiento for all to authenticated
  using (wms.tiene_rol('admin_wms')) with check (wms.tiene_rol('admin_wms'));

grant select on all tables in schema wms to authenticated;
grant insert, update, delete on wms.tipos_movimiento to authenticated;
grant execute on function
  wms.postear_movimiento(text, text, jsonb, text, text, text, text, uuid),
  wms.revertir_movimiento(uuid, text),
  wms.asegurar_lote(uuid, text, date, uuid, text),
  wms.verificar_saldos() to authenticated;
