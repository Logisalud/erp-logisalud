-- Las deudas de las 11 recepciones que se quedaron sin obligación.
-- (Aprobado por Sebas, 2026-10-06.)
--
-- Desde el rediseño de tres columnas (2026-09-18) el insert automático de la
-- obligación usaba `storage_path_factura` en vez de `factura_storage_path`:
-- fallaba en todas las recepciones, y como ese paso es best-effort el error
-- se tragaba. La recepción quedaba guardada y la deuda nunca llegaba a
-- Cuentas por Pagar (arreglado en el PR #161). Las cuatro primeras son de
-- antes del rediseño, cuando la obligación se daba de alta a mano, y
-- tampoco la tenían.
--
-- Los montos NO se calculan acá: salen de las mismas funciones que usa la
-- app (`totalizarRecepcion`, `calcularFechaVencimientoReal`,
-- `normalizarNumeroFactura`), corridas sobre las líneas de cada recepción, y
-- se escriben tal cual. Así la deuda es exactamente la que la recepción
-- habría creado sola — incluidas OC-2026-0015 (DAPHA 10) y OC-2026-0018
-- (JAMOL 5), que salen sin IGV por la 0079.
--
-- Vencimiento: desde la fecha de conformidad de la recepción (regla de
-- negocio 3); OC-2026-0019, que no tiene conformidad porque llegó con
-- discrepancia, desde la fecha de recepción. Total: S/ 169,607.05.
--
-- Re-ejecutable: solo inserta si la recepción sigue sin obligación.

insert into cuentas_x_pagar.obligaciones (
  origen, proveedor_id, recepcion_id, numero_factura, moneda,
  base_imponible, monto_exonerado, igv, sin_igv,
  estado, espera_nota_credito, fecha_vencimiento_real,
  factura_storage_path, created_by, observaciones
)
select 'compra', oc.proveedor_id, r.id, v.numero_factura, oc.moneda,
       v.base, v.exonerado, v.igv, v.sin_igv,
       v.estado, v.espera_nc, v.vence,
       r.storage_path_factura_proveedor, r.recibido_por, v.obs
  from (values
    ('7eed9285-cd45-4f18-8733-32693ee75ae1', 'OC-2026-0002', 'F001-00009828', 415.38, 0, 74.77, false, 'registrada', false, date '2027-01-22', null),
    ('f00793e1-2198-4b3f-959f-2f6d629f5c48', 'OC-2026-0005', 'F001-00009832', 29396, 0, 5291.28, false, 'registrada', false, date '2027-01-26', null),
    ('d20fe556-d637-4baa-b601-325021a5d4c5', 'OC-2026-0001', 'F001-00001033', 3808.1, 0, 685.46, false, 'registrada', false, date '2026-12-23', '3 línea(s) con entrega parcial: queda saldo por recibir en la orden.'),
    ('0cdb33fc-a53d-449b-ab3f-d07a073f4f91', 'OC-2026-0012', 'F001-00001038', 5452.24, 0, 981.4, false, 'registrada', false, date '2026-12-27', '1 línea(s) con entrega parcial: queda saldo por recibir en la orden.'),
    ('f42841dc-9939-414b-b798-87e9ccb830da', 'OC-2026-0014', 'F001-00009836', 6960.49, 0, 1252.89, false, 'registrada', false, date '2027-01-26', '2 línea(s) con entrega parcial: queda saldo por recibir en la orden.'),
    ('4a824048-001a-453d-b276-5a8f307b1ce0', 'OC-2026-0015', 'F001-00009835', 0, 27552, 0, true, 'registrada', false, date '2027-01-26', null),
    ('60a1c254-5705-4ea5-8364-6d53ca24afd4', 'OC-2026-0016', 'F001-00009837', 45864.4, 0, 8255.59, false, 'registrada', false, date '2027-01-26', null),
    ('bf3be69d-991b-4789-97e8-7680a0839ff5', 'OC-2026-0020', 'F001-00009840', 5772.2, 0, 1039, false, 'registrada', false, date '2027-01-26', null),
    ('dc4b860b-0bbb-4d5d-ba02-ddeb26d3f8e6', 'OC-2026-0019', 'F002- 002161', 6793.24, 0, 1222.78, false, 'observada', true, date '2026-12-24', 'Llegó menos de lo facturado: esperando nota de crédito del proveedor.'),
    ('8693660c-0444-41d0-b4e1-c7870b2390d9', 'OC-2026-0018', 'F001-00009839', 0, 13003.2, 0, true, 'registrada', false, date '2027-01-26', null),
    ('7b18795c-9271-4125-be29-94fcfbea3baa', 'OC-2026-0017', 'F001-00009838', 4903.92, 0, 882.71, false, 'registrada', false, date '2027-01-26', null)

  ) as v(recepcion_id, oc_codigo, numero_factura, base, exonerado, igv, sin_igv,
         estado, espera_nc, vence, obs)
  join almacen.recepciones r on r.id = v.recepcion_id::uuid
  join compras.ordenes_compra oc on oc.id = r.oc_id and oc.codigo = v.oc_codigo
 where not exists (
   select 1 from cuentas_x_pagar.obligaciones o where o.recepcion_id = r.id
 );
