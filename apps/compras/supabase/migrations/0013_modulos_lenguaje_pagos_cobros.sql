-- Corrección de lenguaje en la pantalla de módulos: "pagos" describe dinero
-- que SALE de Logisalud (Compras y Pagos); dinero que ENTRA de los clientes
-- es un "cobro" (Cuentas por Cobrar). La descripción de Cobranzas decía
-- "pagos", ambiguo al lado de la tarjeta de Compras y Pagos en la misma
-- pantalla. No toca la tabla public.pagos de Cobranzas ni ningún nombre
-- interno — es solo el texto visible en la tarjeta.
--
-- Re-ejecutable.
update public.modulos
set descripcion = 'Cuentas por cobrar, cobros y conciliación bancaria.'
where id = 'cobranzas';
