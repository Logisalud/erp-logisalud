-- Punto 2 de la ronda de hallazgos de Mariela (Contabilidad) — causa raíz
-- confirmada: subir el PDF de la factura (sección "Factura" de la ficha de
-- la OS) marcaba la orden como 'facturada' de una — antes de que alguien
-- complete los datos reales (N° de factura, fecha, Base, IGV) en
-- "Registrar obligación". Eso la sacaba del listado de pendientes de
-- services/facturas-elegibles.ts como si el trabajo ya estuviera resuelto,
-- sin estarlo — Mariela tenía que "ir directo a la OS" bordeando el
-- buscador para terminar algo que el sistema ya daba por hecho.
--
-- Nuevo estado intermedio 'factura_adjunta': se adjuntó el documento, pero
-- todavía no se registraron los datos reales de la factura. Sigue
-- apareciendo como pendiente en facturas-elegibles.ts (con su propia
-- etiqueta, para notar que ya hay avance) hasta que
-- services/servicios.ts::registrarObligacionDesdeOS complete el ciclo y
-- recién ahí pase a 'facturada'/'conformada' de verdad.
--
-- Prospectivo: no hay backfill de OS ya existentes en 'facturada'/
-- 'conformada' (revisado con el usuario caso por caso antes de decidir
-- qué hacer con las que están "atrapadas" sin obligación registrada — ver
-- conversación, no se toca acá ninguna fila).

alter table servicios.ordenes_servicio
  drop constraint if exists ordenes_servicio_estado_check;

alter table servicios.ordenes_servicio
  add constraint ordenes_servicio_estado_check check (estado in (
    'pendiente_jefe', 'rechazada_jefe', 'aprobada', 'en_ejecucion',
    'factura_adjunta', 'facturada', 'conformada', 'cerrada', 'anulada'
  ));
