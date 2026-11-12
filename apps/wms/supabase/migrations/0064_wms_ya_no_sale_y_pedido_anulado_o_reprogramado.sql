-- 0064 · WMS · «Ya no sale» y pedido anulado o reprogramado (decisión de Sebas, 11-nov-2026)
--
--   1. `wms.ya_no_sale(orden, motivo, rehacer)`: el vendedor avisa, con la orden ya hecha o ya pickeada, que el pedido ya no sale. En UNA sola acción del Jefe, con motivo:
--        · la pre-guía se cancela (su número pasa a «Números sin usar»);
--        · lo que nadie pickeó se libera; lo ya pickeado o llevado a la zona de despacho queda «por devolver a su ubicación» (el auxiliar lo devuelve y OTRA persona lo verifica,
--          el mismo camino que usa un cambio o una cancelación desde Pedidos): hasta entonces la orden queda bloqueada y después se cancela sola;
--        · si el pedido estaba en una ruta que todavía no sale, queda marcado «anulado» en esa ruta (su fila no se borra);
--        · `rehacer` = el pedido sigue vigente: al cancelarse la orden el pedido vuelve a la bandeja para crear una orden nueva. Sin `rehacer`, el pedido se cancela y se avisa al
--          Jefe de Transporte para que el área comercial lo cancele en Pedidos (el WMS no cancela nada en Pedidos).
--      No sirve con una guía ya registrada o enviada (se anula la guía primero), con bultos ya cargados en el vehículo, ni con la ruta ya en camino.
--   2. «Dejar fuera de la salida» pide el TIPO: ANULADO (ya no sale) o REPROGRAMADO (sale otro día); FUERA es el de siempre. La hoja de la ruta marca la fila y la hoja de DIGEMID la deja fuera.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0021, 0029 y 0055.

alter table wms.carga_exclusiones add column if not exists tipo text not null default 'FUERA';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'carga_exclusiones_tipo_check' and conrelid = 'wms.carga_exclusiones'::regclass) then
    alter table wms.carga_exclusiones add constraint carga_exclusiones_tipo_check check (tipo in ('FUERA', 'ANULADO', 'REPROGRAMADO'));
  end if;
end $$;
alter table wms.salidas add column if not exists rehacer_al_cancelar boolean not null default false;

do $$ begin if to_regprocedure('wms.excluir_pedido_de_carga(uuid, uuid, text)') is not null then drop function wms.excluir_pedido_de_carga(uuid, uuid, text); end if; end $$;
create or replace function wms.excluir_pedido_de_carga(p_ruta uuid, p_salida uuid, p_motivo text, p_tipo text default 'FUERA') returns void
language plpgsql security definer set search_path = wms, pg_temp as $$
declare v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_id uuid := gen_random_uuid(); v_tipo text := upper(btrim(coalesce(p_tipo, 'FUERA')));
begin
  perform wms._exigir_accion('liberar_unidad', 'No tienes permiso para dejar un pedido fuera de la salida');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if v_mot is null then raise exception 'Cuenta por qué el pedido se deja fuera de la salida' using errcode = 'P0001'; end if;
  if v_tipo not in ('FUERA', 'ANULADO', 'REPROGRAMADO') then raise exception 'Elige si el pedido se anula o se reprograma' using errcode = 'P0001'; end if;
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida) then raise exception 'Ese pedido ya se dejó fuera de la salida' using errcode = 'P0001'; end if;
  insert into wms.carga_exclusiones (id, ruta_id, salida_id, motivo, por, tipo) values (v_id, p_ruta, p_salida, v_mot, auth.uid(), v_tipo);
  update wms.carga_bultos c set estado = 'RETIRADO', retirado_por = auth.uid(), retirado_en = now(), motivo_retiro = 'El pedido se dejó fuera de la salida: ' || v_mot
   where c.ruta_id = p_ruta and c.estado = 'CARGADO' and exists (select 1 from wms.bultos b where b.id = c.bulto_id and b.salida_id = p_salida);
  perform wms.registrar_audit('pedido_fuera_de_la_salida', 'rutas', p_ruta::text, null, jsonb_build_object('salida', p_salida, 'tipo', v_tipo), v_mot);
end $$;

-- Al cancelarse la orden por completo, si se pidió rehacerla el pedido vuelve a la bandeja (queda sin orden) para crear una nueva.
do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = '_cancelar_salida_por_pedido' and pg_get_functiondef(p.oid) like '%rehacer_al_cancelar%') then return; end if;
  perform wms._parchar_funcion('_cancelar_salida_por_pedido',
    $q$  perform wms.registrar_audit('salida_cancelada_por_pedido',$q$,
    $q$  if (select rehacer_al_cancelar from wms.salidas where id = p_salida) then update wms.pedidos_despacho set salida_id = null where salida_id = p_salida; end if;
  perform wms.registrar_audit('salida_cancelada_por_pedido',$q$);
end $$;

create or replace function wms.ya_no_sale(p_salida uuid, p_motivo text, p_rehacer boolean default false) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; sl record; v_r jsonb; v_lib integer := 0; v_dev integer := 0; v_mot text := nullif(btrim(coalesce(p_motivo, '')), ''); v_ruta record; n wms.guia_numeros;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para cancelar una salida');
  if v_mot is null or length(v_mot) < 5 then raise exception 'Cuenta por qué ya no sale (al menos 5 letras)' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa orden' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La orden ya no está abierta: si ya salió, el transportista marca el pedido como no entregado o rechazado' using errcode = 'P0001'; end if;
  if s.cancelacion_pendiente then raise exception 'Esta orden ya está por cancelarse: falta devolver lo picado a su ubicación' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE') then
    raise exception 'La orden ya tiene su guía: anula la guía primero y después usa «Ya no sale»' using errcode = 'P0001';
  end if;
  if exists (select 1 from wms.carga_bultos cb join wms.bultos b on b.id = cb.bulto_id where b.salida_id = p_salida and cb.estado = 'CARGADO') then
    raise exception 'Ya hay bultos de este pedido cargados en el vehículo: retíralos de la carga primero' using errcode = 'P0001';
  end if;
  select r.id, r.numero, r.estado into v_ruta from wms.ruta_paradas pa join wms.rutas r on r.id = pa.ruta_id where pa.salida_id = p_salida and pa.activa and r.estado <> 'CANCELADA' limit 1;
  if found and v_ruta.estado in ('EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA') then
    raise exception 'La ruta % ya salió: el transportista marca el pedido como no entregado o rechazado', v_ruta.numero using errcode = 'P0001';
  end if;

  -- 1. la pre-guía (si la hay) se cancela: su número no se reutiliza, pasa a «Números sin usar»
  select * into n from wms.guia_numeros where salida_id = p_salida and pre_guia and estado = 'RESERVADO' and not archivado for update;
  if found then
    update wms.guia_numeros set estado = 'SIN_USAR', resuelto_en = now(), detalle = 'Ya no sale: ' || v_mot where id = n.id;
    perform wms.registrar_audit('pre_guia_cancelada', 'guia_numeros', n.serie || '-' || n.numero, null, jsonb_build_object('serie', n.serie, 'numero', n.numero, 'salida', p_salida), v_mot);
  end if;

  -- 2. en una ruta que todavía no sale, el pedido queda marcado «anulado» (su fila no se borra)
  if v_ruta.id is not null and v_ruta.estado in ('LISTA_PARA_CARGA', 'LIBERADA') and not exists (select 1 from wms.carga_exclusiones x where x.ruta_id = v_ruta.id and x.salida_id = p_salida) then
    insert into wms.carga_exclusiones (ruta_id, salida_id, motivo, por, tipo) values (v_ruta.id, p_salida, 'Ya no sale: ' || v_mot, auth.uid(), 'ANULADO');
  end if;

  -- 3. lo que nadie pickeó se libera; lo pickeado (o ya en la zona de despacho) queda por devolver a su ubicación, con verificación de otra persona
  update wms.salidas set rehacer_al_cancelar = coalesce(p_rehacer, false), motivo_cancelacion = 'Ya no sale: ' || v_mot where id = p_salida;
  for sl in select * from wms.salida_lineas where salida_id = p_salida and estado <> 'CANCELADA' order by creada_en, id loop
    v_r := wms._soltar_linea(sl.id, null, 'PEDIDO_CANCELADO', null);
    v_lib := v_lib + (v_r->>'liberadas')::integer; v_dev := v_dev + (v_r->>'por_devolver')::integer;
  end loop;
  if v_dev = 0 then
    perform wms._cancelar_salida_por_pedido(p_salida, 'Ya no sale: ' || v_mot);
  else
    update wms.salidas set cancelacion_pendiente = true where id = p_salida;
    update wms.alertas set estado = 'ATENDIDA', atendida_en = now(), nota_atencion = 'Ya no sale'
     where estado = 'ABIERTA' and clave in (select 'stock:' || id from wms.salida_lineas where salida_id = p_salida);
    perform wms._alertar('DEVOLUCION_PICKING', 'jefe_almacen', null, null, 'devolucion:' || p_salida,
      format('La orden %s ya no sale: tiene %s unidades ya picadas por devolver a su ubicación. El auxiliar las devuelve y otra persona lo verifica; después la orden se cancela sola.', s.numero, v_dev));
  end if;
  if not coalesce(p_rehacer, false) then
    perform wms._alertar('PEDIDO_CANCELADO', 'jefe_transporte', null, null, 'ya-no-sale:' || p_salida,
      format('El pedido %s ya no sale (orden %s): avisa al área comercial para que lo cancele en Pedidos. Motivo: %s', coalesce(s.pedido_numero, '—'), s.numero, v_mot));
  end if;
  perform wms.registrar_audit('ya_no_sale', 'salidas', p_salida::text, null, jsonb_build_object('liberadas', v_lib, 'por_devolver', v_dev, 'rehacer', coalesce(p_rehacer, false)), v_mot);
  return jsonb_build_object('liberadas', v_lib, 'por_devolver', v_dev, 'cancelada', v_dev = 0, 'rehacer', coalesce(p_rehacer, false), 'pre_guia', case when n.id is null then null else n.serie || '-' || lpad(n.numero::text, 8, '0') end);
end $$;

grant execute on function wms.excluir_pedido_de_carga(uuid, uuid, text, text), wms.ya_no_sale(uuid, text, boolean) to authenticated;
revoke execute on all functions in schema wms from public;
