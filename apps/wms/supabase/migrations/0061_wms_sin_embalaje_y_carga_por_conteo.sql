-- 0061 · WMS · Sin proceso de embalaje y carga por CONTEO de bultos (decisión de Sebas, 11-nov-2026)
--
--   1. El embalaje se apaga (parámetro `embalaje_activo` = NO): ningún pedido pasa por «Embalar». Todos quedan con los bultos que se registraron en la conformidad (hasta ahora solo Lima).
--      El código del embalaje NO se borra: poner `embalaje_activo` = SI lo vuelve a encender para los pedidos nuevos.
--   2. Lima = departamento de Lima (ubigeo 15) y Callao (07): parámetro `ubigeos_lima_metropolitana` = «15,07». Lo demás es provincia.
--   3. La ETIQUETA se mantiene para provincia (sale de los bultos de la conformidad; Lima no lleva): `wms.salida_lleva_etiqueta`.
--   4. La carga se concilia por CONTEO de bultos (parámetro `carga_escaneo_qr` = NO): `wms.registrar_conteo_carga` marca como cargados los primeros N bultos del pedido (y retira los demás con
--      motivo si se corrige); la unidad solo se libera con todos los bultos de los pedidos que salen contados. El escaneo del QR (`cargar_bulto`) sigue existiendo, apagado en la pantalla.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0021 y 0023.

insert into wms.parametros (clave, valor, nota) values
  ('embalaje_activo', 'NO', 'NO = ningún pedido pasa por «Embalar»: los bultos quedan registrados en la conformidad. SI = vuelve el embalaje para los pedidos a provincia (decisión de Sebas, 11-nov-2026: apagado en el piloto).'),
  ('carga_escaneo_qr', 'NO', 'NO = la carga se concilia por conteo de bultos por pedido. SI = se escanea el QR de cada bulto (el código sigue disponible para cuando todo funcione).')
on conflict (clave) do nothing;

update wms.parametros set valor = '15,07', nota = 'Prefijos de ubigeo de LIMA (departamento de Lima, 15, y Callao, 07): sus pedidos no llevan etiquetas. Lo demás es provincia (decisión de Sebas, 11-nov-2026).'
 where clave = 'ubigeos_lima_metropolitana' and valor = '1501,0701';

-- ¿Algún embalaje? Con el embalaje apagado, ninguno (la conformidad deja los bultos). El resto es la regla de la 0023: a provincia se embala; sin ubigeo, también (lo más prudente).
create or replace function wms._requiere_embalaje(p_referencia_tipo text, p_referencia_id text) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare v_ubigeo text; v_lima text; v_activo text;
begin
  select valor into v_activo from wms.parametros where clave = 'embalaje_activo';
  if coalesce(v_activo, 'SI') <> 'SI' then return false; end if;
  if p_referencia_tipo is distinct from 'pedido' or p_referencia_id is null then return true; end if;
  select nullif(btrim(coalesce(d.snapshot->'cliente'->>'ubigeo', '')), '') into v_ubigeo from wms.pedidos_despacho d where d.pedido_id = p_referencia_id and d.vigente;
  if v_ubigeo is null then return true; end if;
  select valor into v_lima from wms.parametros where clave = 'ubigeos_lima_metropolitana';
  return not exists (select 1 from unnest(string_to_array(coalesce(v_lima, ''), ',')) pre where nullif(btrim(pre), '') is not null and v_ubigeo like btrim(pre) || '%');
end $$;

-- ¿Este pedido lleva etiquetas? Sí si va a provincia (o no se sabe a dónde): el ubigeo es el del pedido vigente o el del destinatario escrito en la orden.
create or replace function wms.salida_lleva_etiqueta(p_salida uuid) returns boolean
language plpgsql stable security definer set search_path = wms, pg_temp as $$
declare s wms.salidas; v_ubigeo text; v_lima text;
begin
  if not wms.es_usuario() then raise exception 'Sin acceso' using errcode = '42501'; end if;
  select * into s from wms.salidas where id = p_salida;
  if not found then return true; end if;
  v_ubigeo := coalesce((select nullif(btrim(coalesce(d.snapshot->'cliente'->>'ubigeo', '')), '') from wms.pedidos_despacho d where s.referencia_tipo = 'pedido' and d.pedido_id = s.referencia_id and d.vigente),
                       nullif(btrim(coalesce(s.cliente_manual->>'ubigeo', '')), ''));
  if v_ubigeo is null then return true; end if;
  select valor into v_lima from wms.parametros where clave = 'ubigeos_lima_metropolitana';
  return not exists (select 1 from unnest(string_to_array(coalesce(v_lima, ''), ',')) pre where nullif(btrim(pre), '') is not null and v_ubigeo like btrim(pre) || '%');
end $$;

-- Los pedidos que ya estaban abiertos cuando se apagó el embalaje: los conformados sin bultos reciben los de su conformidad; los demás dejan de pedir embalaje.
do $$
declare s record; i integer;
begin
  if coalesce((select valor from wms.parametros where clave = 'embalaje_activo'), 'SI') = 'NO' then
    for s in select x.id, x.numero, x.bultos_conformidad, x.conformada_por from wms.salidas x
              where x.estado = 'ABIERTA' and x.conformada_en is not null and x.bultos_conformidad is not null and x.conformada_por is not null
                and not exists (select 1 from wms.bultos b where b.salida_id = x.id and b.estado = 'EMBALADO')
    loop
      for i in 1 .. s.bultos_conformidad loop
        insert into wms.bultos (salida_id, secuencia, total, codigo, embalado_por) values (s.id, i, s.bultos_conformidad, s.numero || '-B' || i, s.conformada_por);
      end loop;
    end loop;
    update wms.salidas x set requiere_embalaje = false
     where x.requiere_embalaje and x.estado = 'ABIERTA' and not exists (select 1 from wms.bultos b where b.salida_id = x.id and b.estado = 'EMBALADO' and exists (select 1 from wms.bulto_contenido c where c.bulto_id = b.id));
  end if;
end $$;

-- «Cuántos bultos cargaste de este pedido»: deja cargados los primeros N bultos y retira los demás de ESTA ruta (con motivo, el conteo se corrige). Repetirlo con el mismo número no cambia nada.
create or replace function wms.registrar_conteo_carga(p_ruta uuid, p_salida uuid, p_contados integer) returns integer
language plpgsql security definer set search_path = wms, pg_temp as $$
declare b record; v_total integer; v_antes integer;
begin
  perform wms._exigir_accion('cargar_ruta', 'No tienes permiso para cargar la unidad');
  perform wms._exigir_ruta_en_carga(p_ruta);
  if not exists (select 1 from wms.ruta_paradas where ruta_id = p_ruta and activa and salida_id = p_salida) then raise exception 'Ese pedido no está en esta ruta' using errcode = 'P0001'; end if;
  if exists (select 1 from wms.carga_exclusiones where ruta_id = p_ruta and salida_id = p_salida) then raise exception 'Ese pedido se dejó fuera de esta salida' using errcode = 'P0001'; end if;
  if not wms.listo_para_carga(p_salida) then raise exception 'Ese pedido todavía no está listo para carga: faltan la guía, el paquete documental completo o la conformidad' using errcode = 'P0001'; end if;
  select count(*) into v_total from wms.bultos where salida_id = p_salida and estado = 'EMBALADO';
  if v_total = 0 then raise exception 'Ese pedido todavía no tiene bultos registrados' using errcode = 'P0001'; end if;
  if p_contados is null or p_contados < 0 or p_contados > v_total then raise exception 'Este pedido tiene % bultos: cuenta de 0 a %', v_total, v_total using errcode = 'P0001'; end if;
  select count(*) into v_antes from wms.carga_bultos c join wms.bultos x on x.id = c.bulto_id where c.ruta_id = p_ruta and c.estado = 'CARGADO' and x.salida_id = p_salida;
  for b in select id, secuencia from wms.bultos where salida_id = p_salida and estado = 'EMBALADO' order by secuencia loop
    if b.secuencia <= p_contados then
      if exists (select 1 from wms.carga_bultos where bulto_id = b.id and estado = 'CARGADO' and ruta_id <> p_ruta) then raise exception 'Un bulto de este pedido ya está cargado en otra ruta' using errcode = 'P0001'; end if;
      if not exists (select 1 from wms.carga_bultos where bulto_id = b.id and estado = 'CARGADO') then insert into wms.carga_bultos (ruta_id, bulto_id, cargado_por) values (p_ruta, b.id, auth.uid()); end if;
    else
      update wms.carga_bultos set estado = 'RETIRADO', retirado_por = auth.uid(), retirado_en = now(), motivo_retiro = 'Conteo corregido: se contaron ' || p_contados || ' de ' || v_total
       where bulto_id = b.id and ruta_id = p_ruta and estado = 'CARGADO';
    end if;
  end loop;
  if v_antes <> p_contados then
    perform wms.registrar_audit('conteo_de_carga', 'rutas', p_ruta::text, jsonb_build_object('contados', v_antes), jsonb_build_object('salida', p_salida, 'contados', p_contados, 'bultos', v_total), null);
  end if;
  return p_contados;
end $$;

grant execute on function wms.salida_lleva_etiqueta(uuid), wms.registrar_conteo_carga(uuid, uuid, integer) to authenticated;
revoke execute on all functions in schema wms from public;
