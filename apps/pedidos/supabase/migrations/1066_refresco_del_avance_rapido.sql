-- 1066 — Arreglo: publicar el avance fallaba por culpa de la 1065.
--
-- El disparador que alimenta el tablero (1065) tardaba **10,3 segundos** y
-- el rol `authenticated` —con el que la app escribe— corta a los 8. La
-- publicación del avance se caía entera, con el mensaje genérico de Next
-- ("An error occurred in the Server Components render"), que no dice nada
-- de la base. Nadie podía subir el avance del día.
--
-- Dos causas, las dos de la 1065:
--
--  · `codigo_zona` se resolvía con una subconsulta CORRELACIONADA: por cada
--    una de las 796 filas que se insertaban, un barrido de las 15.000 de la
--    tabla ordenado por fecha. Ahora el mapa de zonas se arma una sola vez,
--    en una temporal indexada por RUC.
--  · El `delete` filtraba por `to_char(fecha,'YYYY-MM')`, una función sobre
--    la columna, que no puede usar índice. Ahora compara contra un rango de
--    fechas.
--
-- Y dos índices que no existían: `comercial.ventas_detalle` se leía entera
-- en cada consulta del tablero.
--
-- Medido antes y después sobre las mismas dos cargas: 10.302 ms → 130 ms.
-- Probado además forzando `statement_timeout = 8s`, el límite real del rol
-- de la app, con el disparador activo.
--
-- Nota sobre `codigo_zona`: el avance no trae la zona, así que se hereda
-- del último comprobante conocido del mismo cliente. Un cliente que compra
-- por primera vez en el mes que se carga queda con la zona en null —hoy
-- son 334 filas—. Es un dato que no entra en ningún cálculo y que el
-- tablero no muestra; se prefiere vacío antes que deducirlo del vendedor,
-- que sería inventarlo.
--
-- Este archivo documenta un cambio aplicado a mano contra la base (ver el
-- README de migraciones). Es re-ejecutable.

create index if not exists ventas_detalle_fecha_idx on comercial.ventas_detalle (fecha);
create index if not exists ventas_detalle_ruc_fecha_idx on comercial.ventas_detalle (ruc, fecha desc);

create or replace function comercial.refrescar_ventas_desde_avance(p_carga_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'comercial', 'pedidos', 'public'
as $$
declare
  v_periodo text;
  v_desde date;
  v_filas integer;
begin
  select periodo into v_periodo from pedidos.avance_cargas where id = p_carga_id;
  if v_periodo is null or v_periodo < '2000-01' then
    return 0;  -- las cargas de prueba de instalación llevan periodo 1999-01
  end if;
  v_desde := to_date(v_periodo || '-01', 'YYYY-MM-DD');

  -- El mapa de zonas se arma ANTES de borrar: después, el mes que se está
  -- reemplazando ya no está para consultarlo. Una fila por cliente, la más
  -- reciente que tenga zona.
  create temporary table zonas_del_cliente on commit drop as
  select distinct on (ruc) ruc, codigo_zona
  from comercial.ventas_detalle
  where codigo_zona is not null
  order by ruc, fecha desc;

  create index on zonas_del_cliente (ruc);

  -- El mes entero se reemplaza, no se completa: el archivo del día trae el
  -- mes completo hasta la fecha de corte, así que es la verdad más nueva
  -- sobre ese mes. Agregar sin borrar duplicaría cada comprobante.
  delete from comercial.ventas_detalle
  where fecha >= v_desde and fecha < (v_desde + interval '1 month');

  insert into comercial.ventas_detalle
    (fecha, tipo_documento, nro_documento, anulado, ruc, razon_social, vendedor,
     codigo_zona, distrito, cod_producto, producto, familia, linea,
     tipo_venta, cantidad, neto)
  select d.fecha, d.tipo_documento, d.nro_documento, false,
         r.ruc, d.razon_social, d.vendedor,
         z.codigo_zona,
         d.distrito, d.cod_producto, d.producto, d.familia, d.linea,
         case when d.cod_producto like 'BO%' then 'BONIFICADO' else 'VENTA' end,
         d.cantidad, d.neto
  from pedidos.avance_detalle d
  cross join lateral (
    select case when length(trim(d.ruc)) < 11 then lpad(trim(d.ruc), 11, '0') else trim(d.ruc) end as ruc
  ) r
  left join zonas_del_cliente z on z.ruc = r.ruc
  where d.carga_id = p_carga_id and d.origen = 'LOGISSA';

  get diagnostics v_filas = row_count;
  drop table if exists zonas_del_cliente;
  return v_filas;
end $$;

revoke all on function comercial.refrescar_ventas_desde_avance(uuid) from public, anon, authenticated;
