-- 0066 · WMS · El número de una pre-guía cancelada se reutiliza (12-nov-2026; Sebas aprobó la recomendación)
--
-- Nubefact pide correlativos seguidos. Una pre-guía cancelada que NUNCA se envió a Nubefact (`enviado_en` vacío) no existe para Nubefact ni para SUNAT: su número queda libre y lo toma primero la
-- siguiente pre-guía (o la siguiente guía emitida desde el panel o sin pre-guía), igual que un número LIBERADO: así la serie no tiene huecos y la lista «Números sin usar» deja de acumular.
--   · Si la pre-guía se canceló DESPUÉS de un intento de envío (`enviado_en` con fecha), el número NO se reutiliza sola: puede estar en Nubefact y se revisa allá (sigue como SIN_USAR).
--   · Quien factura ya recibió el aviso «NO factures» con el número cancelado; la hoja impresa de esa pre-guía no vale (la pantalla y el aviso la marcan como cancelada).
-- No cambia la cancelación: `cancelar_pre_guia`, «Ya no sale» y la cancelación de la orden siguen dejando el número SIN_USAR con su motivo en la auditoría. Se reutiliza al crear la siguiente pre-guía.
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0055 y 0065.

do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'crear_pre_guia' and pg_get_functiondef(p.oid) like '%(estado = ''LIBERADO'' or (estado = ''SIN_USAR'' and enviado_en is null))%') then return; end if;
  perform wms._parchar_funcion('crear_pre_guia',
    $q$  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and estado = 'LIBERADO' and not archivado;$q$,
    $q$  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and (estado = 'LIBERADO' or (estado = 'SIN_USAR' and enviado_en is null)) and not archivado;$q$);
end $$;

do $$ begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'reservar_numero_guia' and pg_get_functiondef(p.oid) like '%(estado = ''LIBERADO'' or (estado = ''SIN_USAR'' and enviado_en is null))%') then return; end if;
  perform wms._parchar_funcion('reservar_numero_guia',
    $q$  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and estado = 'LIBERADO' and not archivado;$q$,
    $q$  select min(numero) into v_num from wms.guia_numeros where serie = v_serie and (estado = 'LIBERADO' or (estado = 'SIN_USAR' and enviado_en is null)) and not archivado;$q$);
  -- el número que viene de una pre-guía cancelada ya no es pre-guía cuando lo toma un envío sin pre-guía
  perform wms._parchar_funcion('reservar_numero_guia',
    $q$    update wms.guia_numeros set estado = 'RESERVADO', salida_id = p_salida, entorno = p_entorno,$q$,
    $q$    update wms.guia_numeros set estado = 'RESERVADO', pre_guia = false, salida_id = p_salida, entorno = p_entorno,$q$);
end $$;

revoke execute on all functions in schema wms from public;
