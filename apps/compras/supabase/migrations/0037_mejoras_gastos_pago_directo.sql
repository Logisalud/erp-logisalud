-- Tanda de mejoras de Compras y Pagos (sesión 2026-09-04, piezas A/E/F/H/I).
-- Todo aditivo y re-ejecutable.
--
-- ===================================================================
-- PIEZA A — Anticipo, Reembolso y Gasto directo pierden el aprobador
--           real (el "jefe de área"); nacen en pendiente_contabilidad.
-- ===================================================================
-- El campo informativo "Quién autoriza" (0036) reemplaza esa aprobación:
-- para un Reembolso y un Gasto directo el dinero YA SALIÓ de la empresa
-- (el empleado pagó de su bolsillo, o la factura ya se pagó), así que
-- aprobar después del hecho no decide nada — es un paso vestigial. Para un
-- Anticipo la decisión real la toma Contabilidad al generar la obligación.
--
-- La Orden de Servicio NO entra acá: su aprobación ocurre ANTES de
-- `en_ejecucion`, para autorizar comprometer a la empresa con el proveedor
-- antes de que el servicio empiece — ahí sí decide algo. Tampoco entra la
-- Reposición de Caja Chica (jefe de Almacén). Las tres implementaciones son
-- independientes (services/solicitudes-gasto.ts, services/caja-chica.ts,
-- services/servicios.ts), así que este cambio no las alcanza.
--
-- `pendiente_jefe` y `rechazada_jefe` se dejan en el CHECK a propósito: no
-- quedan filas usándolos tras el UPDATE de abajo, pero borrarlos del
-- constraint no aporta nada y rompería la lectura de cualquier fila
-- histórica que apareciera desde un backup.

alter table gastos.solicitudes_gasto
  alter column estado set default 'pendiente_contabilidad';

-- Las solicitudes vivas en `pendiente_jefe` quedarían huérfanas: la pantalla
-- ya no muestra los botones de jefe, así que nadie podría moverlas.
update gastos.solicitudes_gasto
set estado = 'pendiente_contabilidad'
where estado = 'pendiente_jefe';

-- ===================================================================
-- PIEZA H — Fecha del comprobante en un Reembolso
-- ===================================================================
-- Nullable en la base: la pantalla la exige salvo cuando el tipo de
-- comprobante es "sin_comprobante" (validarSolicitud en domain/gasto.ts),
-- y las solicitudes ya existentes no la tienen.

alter table gastos.solicitudes_gasto
  add column if not exists fecha_factura date;

-- ===================================================================
-- PIEZA I — Alerta de anticipos sin rendir
-- ===================================================================
-- El reloj arranca cuando Tesorería paga el anticipo (ahí pasa a
-- `pendiente_rendicion`, ver services/solicitudes-gasto.ts::
-- marcarSolicitudPagada). Se guarda la fecha en la propia solicitud en vez
-- de leerla de `cuentas_x_pagar.pagos` en cada carga del dashboard: PostgREST
-- no embebe relaciones entre schemas distintos, así que ese camino costaba
-- dos consultas más un Map por cada loop abierto.

alter table gastos.solicitudes_gasto
  add column if not exists fecha_pendiente_rendicion timestamptz;

-- Umbral configurable, mismo patrón que `oc_parcial_alerta_dias` (0031) —
-- nunca hardcodeado en el código.
insert into compras.configuracion (clave, valor)
values ('anticipo_sin_rendir_alerta_dias', '15')
on conflict (clave) do nothing;

-- ===================================================================
-- PIEZA E — Pago Directo: cotización primero, factura después
-- ===================================================================
-- Caso real: el proveedor todavía no emitió la factura, pero ya hay una
-- cotización y hay que dejar registrado el compromiso. Se resuelve con un
-- estado nuevo de la propia obligación en vez de reusar
-- `cuentas_x_pagar.facturas_pendientes`, que es semánticamente lo inverso
-- (ahí vive una factura REAL esperando la mercadería de una OC, y su
-- `oc_id` es NOT NULL).
--
-- Una obligación en `pendiente_factura` no puede pagarse: para entrar a una
-- propuesta de pago hace falta `conforme` (domain/obligacion.ts::
-- puedeEntrarAPropuesta), y desde `pendiente_factura` la única salida es
-- `registrada`, al completar los datos reales de la factura.

alter table cuentas_x_pagar.obligaciones
  add column if not exists cotizacion_storage_path text;

-- Condición de pago elegida al registrar (Pieza F): se guarda para que
-- "Completar factura" calcule el vencimiento con el MISMO valor que se
-- eligió al registrar la cotización, y no con el default que el proveedor
-- tenga meses después.
alter table cuentas_x_pagar.obligaciones
  add column if not exists condicion_pago_dias integer;

alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_estado_check;

alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_estado_check check (estado in (
    'pendiente_factura', 'registrada', 'observada', 'conforme',
    'en_propuesta', 'pagada', 'cerrada', 'canjeada_por_letra'
  ));
