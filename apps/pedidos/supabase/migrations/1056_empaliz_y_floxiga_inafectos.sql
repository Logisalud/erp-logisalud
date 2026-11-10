-- 1056 — EMPALIZ y FLOXIGA no pagan IGV.
--
-- APLICADA A MANO el 2026-11-06 sobre el proyecto de pedidos; este archivo
-- documenta el cambio.
--
-- Los tres entraron el 2026-10-09 con la carga de la lista de JAM Pharma y
-- tomaron el perfil GRAVADO 18% por defecto. Son inafectos: EMPALIZ es
-- empagliflozina y FLOXIGA es dapagliflozina, la misma molécula que DAPHA
-- 10 de Diphasac, que ya estaba bien cargada como INAFECTO desde siempre.
-- Lo confirmó el usuario el 2026-11-06.
--
-- Se veía en la lista de precios de noviembre y no me di cuenta: en las 32
-- filas gravadas el valor de venta es el precio final dividido 1,18, y en
-- estas tres los dos números son iguales (104 y 104; 66 y 66). Lo leí como
-- un error del archivo del proveedor. Era al revés: el archivo estaba bien
-- y el ERP estaba mal.
--
-- QUÉ CAMBIA Y QUÉ NO
--
-- El precio al cliente no se mueve: la caja de FLOXIGA sale a S/ 66,00
-- antes y después. Lo que estaba mal era la descomposición —el ERP partía
-- esos 66 en 55,93 de base y 10,07 de IGV— y eso es lo que viaja al
-- comprobante electrónico y al registro de ventas.
--
-- FLOXIGA se vendió en 4 pedidos (7 cajas, S/ 70,49 de IGV que no
-- correspondía). Se corrigieron las dos líneas de los pedidos que todavía
-- no se despachan, #288 y #336. Los despachados, #233 (14/10) y #263
-- (15/10), quedan como están a la espera de que el usuario decida: la
-- mercadería ya salió, y si Contabilidad los facturó por fuera con IGV,
-- corregir acá dejaría los dos sistemas distintos. EMPALIZ nunca se vendió.
--
-- Los pedidos NUEVOS salen bien solos: `services/orders.ts` lee el perfil
-- del producto al agregar la línea y lo congela ahí, así que no hay código
-- que tocar. Las líneas viejas conservan su foto, que es justamente para lo
-- que está ese diseño.

-- ---------------------------------------------------------------------
-- 1. El perfil tributario de los tres productos y sus gemelos de bonificación
-- ---------------------------------------------------------------------
-- Cerrar el vigente y abrir el nuevo van en la misma transacción: hay un
-- índice único parcial de un solo perfil vigente por producto.
do $perfil$
declare
  v_ids uuid[];
begin
  select array_agg(p.id) into v_ids
    from pedidos.products p
    join pedidos.suppliers s on s.id = p.supplier_id
   where s.nombre = 'JAM Pharma'
     and p.codigo_interno in ('JAM313','JAM314','JAM315','BOJAM313','BOJAM314','BOJAM315');

  if array_length(v_ids, 1) <> 6 then
    raise exception 'Se esperaban 6 productos y se encontraron %', coalesce(array_length(v_ids,1), 0);
  end if;

  -- Re-ejecutable: si ya están inafectos, no hay nada vigente que cerrar y
  -- el insert no corre.
  if exists (select 1 from pedidos.product_tax_profiles t
              where t.product_id = any(v_ids) and t.vigente_hasta is null
                and t.afectacion_tributaria = 'GRAVADO') then

    update pedidos.product_tax_profiles
       set vigente_hasta = current_date
     where product_id = any(v_ids) and vigente_hasta is null;

    insert into pedidos.product_tax_profiles (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
    select unnest(v_ids), 'INAFECTO', 0, current_date;
  end if;
end
$perfil$;

-- ---------------------------------------------------------------------
-- 2. Las dos líneas de los pedidos que todavía no se despacharon
-- ---------------------------------------------------------------------
-- El total no se toca; se le pasa el IGV a la base, que es donde iba.
update pedidos.order_items oi
   set afectacion_tributaria = 'INAFECTO',
       tasa_igv = 0,
       igv = 0,
       subtotal = oi.total
  from pedidos.products p, pedidos.orders o
 where p.id = oi.product_id
   and o.id = oi.order_id
   and p.codigo_interno in ('JAM313','JAM314','JAM315')
   and o.estado not in ('DISPATCHED', 'CANCELLED')
   and oi.afectacion_tributaria = 'GRAVADO';
