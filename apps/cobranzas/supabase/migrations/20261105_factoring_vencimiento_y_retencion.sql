-- Factoring: la fecha de vencimiento que toma la entidad financiera.
--
-- Cuando un cliente acepta el factoring, el vencimiento que va al contrato
-- NO es necesariamente el de la factura: suele tener dos o tres días más,
-- según lo que el cliente confirme. Esa es la fecha con la que trabaja la
-- entidad, y hasta ahora no existía en ningún lado — el reporte mostraba el
-- vencimiento de la factura, sacado de `v_saldos`, que es otra cosa.
--
-- Va POR FACTURA y no por operación (decisión del usuario, 2026-11-05): un
-- canje agrupa varias facturas del mismo cliente y cada una puede quedar
-- con su fecha. La pantalla la propone igual a la de la factura y deja
-- cambiarla, con un botón para aplicar la misma a todas.
--
-- Nullable a propósito: los 4 canjes que ya existen (15 facturas, todas con
-- su ingreso al banco hecho) no tienen esta fecha y no se inventa. Donde
-- está vacía, el reporte muestra la de la factura y lo dice.
--
-- LA RETENCIÓN NO SE AGREGA ACÁ, Y ES A PROPÓSITO
--
-- El otro pedido del mismo día era "un campo para la retención de facturas,
-- en el canje de letras y factoring". La retención del IGV ya vive en un
-- solo lugar: `pagos` con `tipo = 'retencion'`, que es lo que descuentan
-- `v_cobros`/`v_saldos` y lo que muestran el estado de cuenta y el export de
-- documentos. Agregarle una columna `retencion` a las tablas de canje
-- crearía una segunda retención para la misma factura, y en el momento en
-- que las dos no coincidan nadie va a saber cuál es la buena.
--
-- Así que el campo nuevo de los formularios escribe esa misma fila de
-- `pagos`, y los reporteadores la leen de ahí. Lo que sí cambia es quién
-- puede escribirla: `/api/pagos` rechaza cualquier pago sobre una factura
-- canjeada o en factoring —con razón, para que nadie registre ahí el pago
-- del cliente— así que la retención la insertan las rutas del canje, que
-- son las que saben que esto no es un pago del cliente sino parte del canje.

alter table factoring_canje_facturas
  add column if not exists fecha_vencimiento date;

comment on column factoring_canje_facturas.fecha_vencimiento is
  'El vencimiento que toma la entidad de factoring, que puede ser el de la '
  'factura o unos días más según confirme el cliente. Vacío en los canjes '
  'anteriores al 2026-11-05: ahí vale el de la factura.';
