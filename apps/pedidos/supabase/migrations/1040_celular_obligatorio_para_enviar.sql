-- El pedido no sale sin el celular del cliente.
--
-- Pedido del 2026-09-23. Hasta hoy el celular solo se pedía al dar de alta un
-- cliente nuevo, y encima como opcional. Resultado: de los 3.424 clientes,
-- 473 tienen número. Operaciones no puede coordinar la entrega y Cobranzas no
-- puede llegar al cliente, y para eso ya no alcanza con pedirlo por buena
-- voluntad.
--
-- Se valida el FORMATO y no solo que haya algo escrito: un "123" anotado para
-- salir del paso es tan inútil como el vacío. Celular peruano = 9 dígitos que
-- empiezan en 9; de los 473 ya cargados, 472 cumplen (el que no es un
-- 5555555555 evidentemente inventado, que va a quedar bloqueado hasta que lo
-- corrijan — que es lo correcto).
--
-- La regla vive acá, en submit_order, y no solo en la pantalla: es
-- SECURITY DEFINER y es la única autoridad sobre qué pedido puede salir. La
-- validación del formulario es una cortesía para no hacer ir y volver al
-- vendedor; esta es la que manda.
--
-- Impacto medido sobre lo ya enviado: de los 86 pedidos, 26 (30%) se habrían
-- frenado, de 26 de los 79 clientes que pidieron. Por eso el mismo cambio
-- agrega en la pantalla del pedido un recuadro para cargar el celular ahí
-- mismo: sin esa salida, un tercio de los pedidos quedaría trabado sin nada
-- que el vendedor pueda hacer desde el celular.
--
-- El resto de submit_order queda igual. Se verificó que la copia de partida
-- era byte a byte la de producción (md5 9c1faa628f38376075a7d605e58a0bd7)
-- antes de tocar nada.

do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  if v_customer.canal_id is null then
    raise exception 'El cliente no tiene canal de venta asignado; no se puede calcular precio';
  end if;
$viejo$;
  v_nuevo constant text :=
$nuevo$  if v_customer.canal_id is null then
    raise exception 'El cliente no tiene canal de venta asignado; no se puede calcular precio';
  end if;

  -- Sin celular el pedido sale y despues nadie puede contactar al cliente
  -- para coordinar la entrega ni para cobrar. Se valida el formato, no solo
  -- que haya algo: un numero inventado no sirve para nada.
  if coalesce(btrim(v_customer.whatsapp), '') !~ '^9[0-9]{8}$' then
    raise exception 'El cliente no tiene celular registrado. Agregalo en el pedido para poder enviarlo.';
  end if;
$nuevo$;
begin
  -- Se parte de pg_get_functiondef y no de prosrc: así la firma
  -- (p_order_id uuid, p_motivo text) y los atributos (security definer,
  -- search_path) se conservan tal cual. Reescribir la cabecera a mano crea
  -- una sobrecarga nueva en vez de reemplazar la función — y quedan dos
  -- submit_order conviviendo.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'submit_order';

  if v_def is null then
    raise exception 'No existe pedidos.submit_order';
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'submit_order no tiene el bloque esperado: revisar antes de aplicar';
  end if;
  if position(v_nuevo in v_def) > 0 then
    raise notice 'La validación de celular ya estaba aplicada; no se toca nada.';
    return;
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;
