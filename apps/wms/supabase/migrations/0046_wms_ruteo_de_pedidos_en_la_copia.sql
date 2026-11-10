-- 0046 · WMS · Piloto (Fase 4, P8): el ruteo que ya hizo Pedidos, guardado en la copia del pedido (`pedidos_despacho`)
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0014, 0029 y 0041 (usa su ayudante `_parchar_funcion`).
-- Pedidos ya calcula la zona de reparto (`zona_reparto {codigo, nombre, orden_ruta}`), el orden del distrito dentro de la zona (`orden_distrito`) y el día planificado
-- (`dia_planificado` 1..7 ISO y `fecha_planificada`). El WMS NO lo recalcula: lo guarda tal como llega, dentro del snapshot (que no se edita) y en columnas para filtrar
-- la bandeja por zona y día. Todo es opcional: sin zona, todo queda vacío. Si una versión nueva cambia la zona o el día, `_cambios_de_pedido` lo dice (aviso de cambio como hoy).

alter table wms.pedidos_despacho add column if not exists zona_codigo text;
alter table wms.pedidos_despacho add column if not exists zona_nombre text;
alter table wms.pedidos_despacho add column if not exists zona_orden_ruta integer;
alter table wms.pedidos_despacho add column if not exists orden_distrito integer;
alter table wms.pedidos_despacho add column if not exists dia_planificado smallint;
alter table wms.pedidos_despacho add column if not exists fecha_planificada date;
-- NOT VALID: se exige a las filas nuevas sin revalidar las viejas (que no traen nada)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_despacho_dia_planificado_check' and conrelid = 'wms.pedidos_despacho'::regclass) then
    alter table wms.pedidos_despacho add constraint pedidos_despacho_dia_planificado_check check (dia_planificado is null or dia_planificado between 1 and 7) not valid;
  end if;
end $$;
create index if not exists pedidos_despacho_zona_dia_idx on wms.pedidos_despacho (zona_codigo, dia_planificado) where vigente;

-- Del snapshot a las columnas (acepta los nombres de Pedidos —snake_case— y los del WMS —camelCase—). Lo que viene mal se ignora; nunca rechaza un pedido.
create or replace function wms._ruteo_del_snapshot() returns trigger language plpgsql set search_path = wms, pg_temp as $$
declare z jsonb := coalesce(new.snapshot->'zonaReparto', new.snapshot->'zona_reparto'); v text;
begin
  if z is not null and jsonb_typeof(z) = 'object' and nullif(btrim(coalesce(z->>'codigo', '')), '') is not null then
    new.zona_codigo := btrim(z->>'codigo');
    new.zona_nombre := coalesce(nullif(btrim(coalesce(z->>'nombre', '')), ''), new.zona_codigo);
    v := coalesce(z->>'ordenRuta', z->>'orden_ruta');
    new.zona_orden_ruta := case when v ~ '^-?[0-9]+$' then v::integer else 9999 end;
  end if;
  v := coalesce(new.snapshot->>'ordenDistrito', new.snapshot->>'orden_distrito');
  if v ~ '^-?[0-9]+$' then new.orden_distrito := v::integer; end if;
  v := coalesce(new.snapshot->>'diaPlanificado', new.snapshot->>'dia_planificado');
  if v ~ '^[1-7]$' then new.dia_planificado := v::smallint; end if;
  v := coalesce(new.snapshot->>'fechaPlanificada', new.snapshot->>'fecha_planificada');
  if v ~ '^\d{4}-\d{2}-\d{2}' then begin new.fecha_planificada := left(v, 10)::date; exception when others then null; end; end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'pedidos_despacho_ruteo' and tgrelid = 'wms.pedidos_despacho'::regclass and not tgisinternal) then drop trigger pedidos_despacho_ruteo on wms.pedidos_despacho; end if;
end $$;
create trigger pedidos_despacho_ruteo before insert on wms.pedidos_despacho for each row execute function wms._ruteo_del_snapshot();

-- Lo ya importado (si lo hubiera) se llena una sola vez desde su snapshot: el disparador de inmutabilidad solo compara las columnas del snapshot, no estas.
update wms.pedidos_despacho set zona_codigo = coalesce(snapshot->'zonaReparto'->>'codigo', snapshot->'zona_reparto'->>'codigo')
 where zona_codigo is null and (snapshot ? 'zonaReparto' or snapshot ? 'zona_reparto');

-- El aviso de cambio: ahora dice también si cambió la zona o el día planificado.
do $$ declare v_oid oid; begin
  select p.oid into v_oid from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = '_cambios_de_pedido' order by p.oid desc limit 1;
  if v_oid is not null and position('Cambió la zona de reparto' in pg_get_functiondef(v_oid)) = 0 then
    perform wms._parchar_funcion('_cambios_de_pedido',
      $q$  if coalesce(p_antes->>'condicionPago', '') <> coalesce(p_nuevo->>'condicionPago', '') then$q$,
      $q$  if coalesce(p_antes->'zonaReparto'->>'codigo', p_antes->'zona_reparto'->>'codigo', '') <> coalesce(p_nuevo->'zonaReparto'->>'codigo', p_nuevo->'zona_reparto'->>'codigo', '') then r := r || to_jsonb('Cambió la zona de reparto'::text); end if;
  if coalesce(p_antes->>'diaPlanificado', p_antes->>'dia_planificado', '') <> coalesce(p_nuevo->>'diaPlanificado', p_nuevo->>'dia_planificado', '')
     or coalesce(p_antes->>'fechaPlanificada', p_antes->>'fecha_planificada', '') <> coalesce(p_nuevo->>'fechaPlanificada', p_nuevo->>'fecha_planificada', '') then r := r || to_jsonb('Cambió el día planificado de reparto'::text); end if;
  if coalesce(p_antes->>'condicionPago', '') <> coalesce(p_nuevo->>'condicionPago', '') then$q$);
  end if;
end $$;

revoke execute on all functions in schema wms from public;
