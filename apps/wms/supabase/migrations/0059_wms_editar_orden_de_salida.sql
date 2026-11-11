-- 0059 · «Editar» la Orden de Salida (Jefe de Almacén y quien tenga `preparar_salidas`; pedido de Sebas, reunión del 10-nov, punto 1c).
--
-- Solo se edita una orden MANUAL (decisión de Sebas, 11-nov). Una orden que viene de Pedidos se cambia en Pedidos (llega una versión nueva y el WMS la aplica); sus lotes tienen su propio editor.
-- Reglas por ETAPA, en una orden manual (sin pedido unido):
--   · La NOTA se puede cambiar mientras la orden esté abierta, en la etapa que esté (queda el antes y el después en la auditoría).
--   · Si todavía no empezó el picking ni tiene guía, además el destinatario y las CANTIDADES de sus líneas (con motivo): lo reservado se suelta o se vuelve a asignar por FEFO.
--     Quitar o agregar productos se hace cancelando la orden y creando otra.
--   · Cambiar líneas o destinatario una vez que el picking empezó (devolver la orden al paso anterior) NO se hace aquí: mueve stock físico y queda como decisión pendiente.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear).

alter table wms.salidas add column if not exists nota_orden text;

create or replace function wms.editar_orden_salida(p_salida uuid, p_cambios jsonb, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare
  s wms.salidas; l wms.salida_lineas; x jsonb; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_cant integer; v_cambia_estructura boolean := false;
  v_de_pedido boolean; v_picking boolean; v_guia boolean; v_cambios text[] := array[]::text[]; v_nota text; v_cli jsonb; k text; v_res text;
begin
  perform wms._exigir_accion('preparar_salidas', 'No tienes permiso para editar la orden');
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then raise exception 'No hay nada que cambiar' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida for update;
  if not found then raise exception 'No encontramos esa orden' using errcode = 'P0001'; end if;
  if s.estado <> 'ABIERTA' then raise exception 'La orden ya no está abierta: no se edita' using errcode = 'P0001'; end if;
  v_de_pedido := coalesce(s.creada_desde, '') in ('BANDEJA', 'RUTA') or exists (select 1 from wms.pedidos_despacho pd where pd.salida_id = p_salida and pd.vigente);
  v_picking := exists (select 1 from wms.ordenes_picking op where op.salida_id = p_salida and op.estado <> 'CANCELADA');
  v_guia := exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE');
  v_cambia_estructura := p_cambios ? 'lineas' or p_cambios ? 'destinatario';

  if v_de_pedido then raise exception 'Esta orden viene de un pedido: se cambia desde Pedidos (llega como versión nueva). Los lotes se cambian en cada línea' using errcode = 'P0001'; end if;
  if v_cambia_estructura then
    if v_picking then raise exception 'La orden ya empezó el picking: no se cambian sus líneas ni su destinatario desde aquí' using errcode = 'P0001'; end if;
    if v_guia then raise exception 'La orden ya tiene su guía: no se cambian sus líneas ni su destinatario' using errcode = 'P0001'; end if;
    if v_motivo is null or length(v_motivo) < 5 then raise exception 'Escribe por qué cambias la orden (al menos 5 letras)' using errcode = 'P0001'; end if;
  end if;

  if p_cambios ? 'nota' then
    v_nota := nullif(btrim(coalesce(p_cambios->>'nota', '')), '');
    if length(coalesce(v_nota, '')) > 500 then raise exception 'La nota es demasiado larga (máximo 500 letras)' using errcode = 'P0001'; end if;
    if v_nota is distinct from s.nota_orden then
      update wms.salidas set nota_orden = v_nota where id = p_salida;
      perform wms.registrar_audit('orden_nota_editada', 'salidas', p_salida::text, jsonb_build_object('nota', s.nota_orden), jsonb_build_object('nota', v_nota), v_motivo);
      v_cambios := array_append(v_cambios, 'nota');
    end if;
  end if;

  if p_cambios ? 'destinatario' then
    if s.cliente_manual is null then raise exception 'Esta orden no tiene destinatario escrito a mano' using errcode = 'P0001'; end if;
    v_cli := s.cliente_manual;
    for k in select jsonb_object_keys(p_cambios->'destinatario') loop
      if k not in ('ruc', 'razon_social', 'direccion', 'ubigeo') then raise exception 'Del destinatario solo se cambian el RUC o documento, la razón social, la dirección y el ubigeo' using errcode = 'P0001'; end if;
      if nullif(btrim(coalesce(p_cambios->'destinatario'->>k, '')), '') is null then raise exception 'El dato «%» del destinatario no puede quedar vacío', k using errcode = 'P0001'; end if;
      v_cli := jsonb_set(v_cli, array[k], to_jsonb(btrim(p_cambios->'destinatario'->>k)));
    end loop;
    if coalesce(v_cli->>'ubigeo', '') !~ '^[0-9]{6}$' then raise exception 'El ubigeo tiene 6 números (por ejemplo 150101)' using errcode = 'P0001'; end if;
    if coalesce(v_cli->>'ruc', '') !~ '^([0-9]{8}|[0-9]{11})$' then raise exception 'El RUC tiene 11 números (o el DNI, 8)' using errcode = 'P0001'; end if;
    if v_cli is distinct from s.cliente_manual then
      update wms.salidas set cliente_manual = v_cli where id = p_salida;
      perform wms.registrar_audit('orden_destinatario_editado', 'salidas', p_salida::text, s.cliente_manual, v_cli, v_motivo);
      v_cambios := array_append(v_cambios, 'destinatario');
    end if;
  end if;

  if p_cambios ? 'lineas' then
    if jsonb_typeof(p_cambios->'lineas') <> 'array' then raise exception 'Las líneas deben venir en una lista' using errcode = 'P0001'; end if;
    for x in select * from jsonb_array_elements(p_cambios->'lineas') loop
      select * into l from wms.salida_lineas where id = nullif(x->>'linea_id', '')::uuid and salida_id = p_salida for update;
      if not found then raise exception 'Una de las líneas no es de esta orden' using errcode = 'P0001'; end if;
      if l.estado = 'CANCELADA' then raise exception 'Una de las líneas ya está cancelada' using errcode = 'P0001'; end if;
      if coalesce(x->>'cantidad', '') !~ '^[0-9]+$' or (x->>'cantidad')::integer < 1 then raise exception 'La cantidad debe ser un número entero desde 1 (para quitar una línea, cancela la orden y crea otra)' using errcode = 'P0001'; end if;
      v_cant := (x->>'cantidad')::integer;
      if v_cant = l.cantidad then continue; end if;
      if v_cant < l.cantidad then
        perform wms._soltar_linea(l.id, l.cantidad - v_cant, 'EDICION_ORDEN', null);
        update wms.salida_lineas set cantidad = v_cant where id = l.id;
        perform wms._asignar_linea(l.id);   -- recompone el estado de la línea (ASIGNADA) y atiende la alerta de stock si había
      else
        update wms.salida_lineas set cantidad = v_cant where id = l.id;
        v_res := wms._asignar_linea(l.id);
      end if;
      perform wms.registrar_audit('orden_linea_editada', 'salida_lineas', l.id::text, jsonb_build_object('cantidad', l.cantidad), jsonb_build_object('cantidad', v_cant), v_motivo);
      v_cambios := array_append(v_cambios, 'linea:' || l.id::text);
    end loop;
  end if;

  return jsonb_build_object('cambios', to_jsonb(v_cambios), 'sin_stock', (select count(*)::int from wms.salida_lineas where salida_id = p_salida and estado = 'SIN_STOCK'));
end $$;

grant execute on function wms.editar_orden_salida(uuid, jsonb, text) to authenticated;
revoke execute on all functions in schema wms from public;
