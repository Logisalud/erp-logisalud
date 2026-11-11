-- 0055 · WMS · Flujo con PRE-GUÍA (docs/wms/salidas/pre-guia-diseno.md; Sebas aprobó el diseño el 2026-11-11)
--
-- Orden: Orden de Salida → picking → conformidad → PRE-GUÍA → ruteo → envío a Nubefact. La pre-guía NO existe ante SUNAT: es un borrador del WMS que RESERVA el siguiente número de la serie
-- (T…) apenas se da la conformidad; vehículo y conductor salen después de la ruta (se leen de la ruta, no se copian) y, al enviar, Nubefact la genera con ESE mismo número.
--   · Varias pre-guías pueden estar reservadas a la vez (hasta ahora solo se admitía una guía en curso por serie).
--   · Un número de pre-guía NUNCA se reutiliza: si la pre-guía se cancela, el número pasa a SIN_USAR y se decide con la contadora (lista «Números sin usar»).
--   · `reservar_numero_guia` (el envío) ADOPTA el número de la pre-guía de esa orden; los números de otras pre-guías no cuentan como «otra guía en curso».
--   · `liberar_numero_guia` no libera el número de una pre-guía (si Nubefact rechaza el envío, la pre-guía sigue con su número).
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0032 y 0035 (usa `_parchar_funcion`).

alter table wms.guia_numeros add column if not exists pre_guia boolean not null default false;
select wms._ampliar_check_in('wms.guia_numeros', 'guia_numeros_estado_check', 'estado', array['SIN_USAR']);
create unique index if not exists guia_numeros_pre_guia_vigente_uk on wms.guia_numeros (salida_id) where pre_guia and estado = 'RESERVADO' and not archivado;

-- Crea la pre-guía de una orden ya conformada: reserva el siguiente número de la serie. Idempotente: si la orden ya tiene su pre-guía reservada, la devuelve.
create or replace function wms.crear_pre_guia(p_serie text, p_entorno text, p_salida uuid) returns jsonb
language plpgsql security definer set search_path = wms, pg_temp as $$
declare c wms.guia_correlativos; n wms.guia_numeros; v_serie text := upper(btrim(coalesce(p_serie, ''))); v_num integer; s wms.salidas;
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para crear la pre-guía');
  if p_entorno is null or p_entorno not in ('SIMULADOR', 'PRUEBA', 'PRODUCCION') then raise exception 'Falta el entorno de Nubefact con el que se emitirá' using errcode = 'P0001'; end if;
  select * into s from wms.salidas where id = p_salida;
  if not found then raise exception 'No encontramos esa salida' using errcode = 'P0001'; end if;
  if s.estado = 'CANCELADA' then raise exception 'La orden está cancelada: no lleva guía' using errcode = 'P0001'; end if;
  if s.conformada_en is null then raise exception 'La pre-guía se crea cuando el pedido tiene la conformidad' using errcode = 'P0001'; end if;
  select * into c from wms.guia_correlativos where serie = v_serie for update;
  if not found then raise exception 'La serie % de guías no está configurada', v_serie using errcode = 'P0001'; end if;
  select * into n from wms.guia_numeros where salida_id = p_salida and pre_guia and estado = 'RESERVADO' and not archivado;
  if found then return jsonb_build_object('serie', n.serie, 'numero', n.numero, 'nueva', false); end if;
  if exists (select 1 from wms.guias_remision g where g.salida_id = p_salida and g.estado = 'VIGENTE') then raise exception 'La orden ya tiene su guía' using errcode = 'P0001'; end if;
  if p_entorno = 'PRODUCCION' and not c.confirmado then
    raise exception 'Todavía no se puede reservar un número real: falta confirmar con qué número empieza la serie %', v_serie using errcode = 'P0001';
  end if;
  if p_entorno <> 'PRODUCCION' and c.confirmado then
    raise exception 'La serie % ya está confirmada para producción: no se reservan números de prueba', v_serie using errcode = 'P0001';
  end if;
  -- un número devuelto por un envío que Nubefact nunca recibió (LIBERADO) se usa primero, para no dejar huecos; un SIN_USAR (pre-guía cancelada) no se reutiliza jamás
  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and estado = 'LIBERADO' and not archivado;
  if v_num is not null then
    update wms.guia_numeros set estado = 'RESERVADO', pre_guia = true, salida_id = p_salida, entorno = p_entorno, guia_id = null, detalle = null, reservado_por = auth.uid(), reservado_en = now(), resuelto_en = null
     where serie = v_serie and numero = v_num and not archivado;
  else
    v_num := c.ultimo + 1;
    if v_num > 99999999 then raise exception 'La serie % llegó a su último número', v_serie using errcode = 'P0001'; end if;
    update wms.guia_correlativos set ultimo = v_num where serie = v_serie;
    insert into wms.guia_numeros (serie, numero, estado, salida_id, entorno, reservado_por, pre_guia) values (v_serie, v_num, 'RESERVADO', p_salida, p_entorno, auth.uid(), true);
  end if;
  perform wms.registrar_audit('pre_guia_creada', 'guia_numeros', v_serie || '-' || v_num, null, jsonb_build_object('serie', v_serie, 'numero', v_num, 'entorno', p_entorno, 'salida', p_salida), null);
  return jsonb_build_object('serie', v_serie, 'numero', v_num, 'nueva', true);
end $$;

-- Cancela la pre-guía (con motivo): su número queda SIN_USAR para decidirlo con la contadora; nunca lo toma otro pedido. Devuelve si había algo que cancelar.
create or replace function wms.cancelar_pre_guia(p_salida uuid, p_motivo text) returns boolean
language plpgsql security definer set search_path = wms, pg_temp as $$
declare n wms.guia_numeros; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform wms._exigir_accion('registrar_documentacion', 'No tienes permiso para cancelar la pre-guía');
  if v_motivo is null then raise exception 'Escribe por qué se cancela la pre-guía' using errcode = 'P0001'; end if;
  select * into n from wms.guia_numeros where salida_id = p_salida and pre_guia and estado = 'RESERVADO' and not archivado for update;
  if not found then return false; end if;
  update wms.guia_numeros set estado = 'SIN_USAR', resuelto_en = now(), detalle = v_motivo where id = n.id;
  perform wms.registrar_audit('pre_guia_cancelada', 'guia_numeros', n.serie || '-' || n.numero, null, jsonb_build_object('serie', n.serie, 'numero', n.numero, 'salida', p_salida), v_motivo);
  return true;
end $$;

-- El envío adopta el número de la pre-guía de esa orden; los números de otras pre-guías no cuentan como «otra guía en curso».
do $$ begin
  perform wms._parchar_funcion('reservar_numero_guia',
    $q$  select * into n from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and not archivado order by numero limit 1 for update;$q$,
    $q$  select * into n from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and pre_guia and salida_id = p_salida and not archivado limit 1 for update;
  if found then return jsonb_build_object('numero', n.numero, 'reintento', false); end if;
  select * into n from wms.guia_numeros where serie = v_serie and estado = 'RESERVADO' and not pre_guia and not archivado order by numero limit 1 for update;$q$);
  perform wms._parchar_funcion('liberar_numero_guia',
    $q$  if not found or n.estado <> 'RESERVADO' then return false; end if;$q$,
    $q$  if not found or n.estado <> 'RESERVADO' or n.pre_guia then return false; end if;$q$);
end $$;

grant execute on function wms.crear_pre_guia(text, text, uuid), wms.cancelar_pre_guia(uuid, text) to authenticated;
revoke execute on all functions in schema wms from public;
