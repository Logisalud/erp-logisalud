-- 1068 — El refresco del avance guarda la línea ya con el nombre del negocio.
--
-- Sin esto, el próximo avance volvería a meter "GENERICO" y "OTC" crudos y
-- el ranking se partiría otra vez en dos renglones por línea: la 1067
-- habría arreglado la historia y el siguiente archivo la rompería de nuevo.
--
-- La equivalencia sale de `comercial.lineas_canonicas` (ver 1067), que a su
-- vez viene de la hoja "lineas" del archivo de avance.
--
-- Una línea que no esté en la tabla entra tal cual. Es preferible un nombre
-- crudo a la vista —que se nota y se corrige agregando una fila— que una
-- venta que desaparece del ranking.
--
-- Es la misma función de la 1066 con un `left join` más. Se repite entera
-- porque `create or replace` no admite parches parciales.
--
-- Aplicado a mano contra la base (ver el README de migraciones).
-- Re-ejecutable.
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
         d.distrito, d.cod_producto, d.producto, d.familia,
         coalesce(lc.linea, d.linea),
         case when d.cod_producto like 'BO%' then 'BONIFICADO' else 'VENTA' end,
         d.cantidad, d.neto
  from pedidos.avance_detalle d
  cross join lateral (
    select case when length(trim(d.ruc)) < 11 then lpad(trim(d.ruc), 11, '0') else trim(d.ruc) end as ruc
  ) r
  left join zonas_del_cliente z on z.ruc = r.ruc
  left join comercial.lineas_canonicas lc on lc.linea_cruda = upper(trim(d.linea))
  where d.carga_id = p_carga_id and d.origen = 'LOGISSA';

  get diagnostics v_filas = row_count;
  drop table if exists zonas_del_cliente;
  return v_filas;
end $$;

revoke all on function comercial.refrescar_ventas_desde_avance(uuid) from public, anon, authenticated;
