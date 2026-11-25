-- 1065 — El tablero comercial se alimenta del avance de ventas.
--
-- `comercial.ventas_detalle` —de donde el tablero saca venta, líneas,
-- productos y reposición— se había cargado a mano desde una exportación de
-- Nubefact y no se actualizaba sola: quedaba congelada hasta que alguien la
-- recargara. El avance de ventas, en cambio, se sube a diario.
--
-- Son el MISMO dato. En octubre, con los dos archivos completos, las dos
-- fuentes dan 1.487 líneas y S/ 283.910,69, y coinciden comprobante por
-- comprobante, producto por producto, en fecha, cantidad e importe.
--
-- ── Las tres diferencias de forma ────────────────────────────────────────
--
-- **El RUC.** El avance trae los DNI con 8 dígitos y `ventas_detalle` los
-- guarda rellenados a 11 con ceros. Sin el `lpad`, un cliente persona
-- natural queda partido en dos y su historia de compra se rompe. Es la
-- misma normalización que usa cobranzas.
--
-- **`tipo_venta`.** El avance no trae la columna y hay que deducirla. NO se
-- deduce del importe: el primer intento lo hizo así y falló en 8 filas de
-- octubre —notas de crédito que devuelven un producto bonificado, que van
-- en 0 igual pero son bonificado, no venta— y además hay 587 filas de VENTA
-- con neto 0. Se deduce del CÓDIGO: en las 15.353 filas de la tabla,
-- BONIFICADO equivale exactamente a que el código empiece con `BO`, sin una
-- sola excepción en ninguno de los dos sentidos. Es la convención del
-- catálogo en los dos ERP: el bonificado de DHP005 es BODHP005. Importa
-- porque el ciclo de reposición filtra `tipo_venta <> 'BONIFICADO'`, y un
-- null ahí descartaría la fila entera.
--
-- **`codigo_zona`.** Tampoco viene (el avance trae el código del vendedor,
-- que es otra cosa). Se hereda del último dato conocido del mismo cliente.
-- No entra en ningún cálculo, solo se muestra.
--
-- `anulado` queda en false: el avance ya viene sin anulados, y que octubre
-- cuadre exacto contra el conjunto no anulado lo confirma.
--
-- ── Qué reemplaza y qué no ───────────────────────────────────────────────
-- Cada carga vigente reescribe SU MES completo. El archivo del día trae el
-- mes entero hasta la fecha de corte, así que es la verdad más nueva sobre
-- ese mes; agregar sin borrar duplicaría cada comprobante. Los meses que el
-- avance no cubre —oct 2025 a set 2026, 13.092 filas— quedan intactos.
--
-- Lo que esto NO toca: `comercial.ranking_clientes`, la clasificación oro,
-- plata y bronce, sigue siendo una foto. Mezcla el comportamiento de pago,
-- que vive en la base de cobranzas y esta base no alcanza. Recalcularla es
-- un cambio aparte.
--
-- Aplicado y verificado el 2026-11-25: con las dos cargas vigentes (oct y
-- nov) reprocesadas, la historia anterior a noviembre quedó idéntica al
-- respaldo salvo dos notas de crédito de importe y cantidad cero que el
-- avance tiene y la exportación vieja no; el neto hasta octubre da
-- S/ 2.709.514,72 antes y después. Respaldo en
-- `comercial.ventas_detalle_backup_20261125`.
--
-- Este archivo documenta un cambio aplicado a mano contra la base (ver el
-- README de migraciones). Es re-ejecutable.

create or replace function comercial.refrescar_ventas_desde_avance(p_carga_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'comercial', 'pedidos', 'public'
as $$
declare
  v_periodo text;
  v_filas integer;
begin
  select periodo into v_periodo from pedidos.avance_cargas where id = p_carga_id;
  if v_periodo is null or v_periodo < '2000-01' then
    return 0;  -- las cargas de prueba de instalación llevan periodo 1999-01
  end if;

  delete from comercial.ventas_detalle
  where to_char(fecha, 'YYYY-MM') = v_periodo;

  insert into comercial.ventas_detalle
    (fecha, tipo_documento, nro_documento, anulado, ruc, razon_social, vendedor,
     codigo_zona, distrito, cod_producto, producto, familia, linea,
     tipo_venta, cantidad, neto)
  select d.fecha, d.tipo_documento, d.nro_documento, false,
         case when length(trim(d.ruc)) < 11 then lpad(trim(d.ruc), 11, '0') else trim(d.ruc) end,
         d.razon_social, d.vendedor,
         (select v.codigo_zona from comercial.ventas_detalle v
           where v.ruc = case when length(trim(d.ruc)) < 11 then lpad(trim(d.ruc), 11, '0') else trim(d.ruc) end
             and v.codigo_zona is not null
           order by v.fecha desc limit 1),
         d.distrito, d.cod_producto, d.producto, d.familia, d.linea,
         case when d.cod_producto like 'BO%' then 'BONIFICADO' else 'VENTA' end,
         d.cantidad, d.neto
  from pedidos.avance_detalle d
  where d.carga_id = p_carga_id and d.origen = 'LOGISSA';

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

revoke all on function comercial.refrescar_ventas_desde_avance(uuid) from public, anon, authenticated;

create or replace function comercial.al_quedar_vigente_el_avance()
returns trigger
language plpgsql
security definer
set search_path to 'comercial', 'pedidos', 'public'
as $$
begin
  if new.vigente then
    perform comercial.refrescar_ventas_desde_avance(new.id);
  end if;
  return new;
end $$;

drop trigger if exists avance_alimenta_el_tablero on pedidos.avance_cargas;
create trigger avance_alimenta_el_tablero
after insert or update of vigente on pedidos.avance_cargas
for each row execute function comercial.al_quedar_vigente_el_avance();
