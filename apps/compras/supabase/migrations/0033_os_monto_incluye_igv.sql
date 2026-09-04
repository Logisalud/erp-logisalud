-- Punto 5(a) de la ronda de hallazgos de Mariela (Contabilidad): el monto
-- estimado de una Orden de Servicio era ambiguo — nada decía si
-- `monto_estimado` venía con IGV incluido o no, y eso importaba para poder
-- comparar contra la factura real más adelante (ver 0034 y la validación
-- nueva en domain/servicio.ts).
--
-- Nullable a propósito: las OS ya existentes no tienen forma de saber cuál
-- era la intención original — se dejan en null (sin ese dato) en vez de
-- adivinar true/false, y la validación nueva de "factura no puede superar
-- el monto de la OS" simplemente no corre para esas filas viejas. Las OS
-- nuevas sí lo piden como campo obligatorio desde la pantalla.

alter table servicios.ordenes_servicio
  add column if not exists monto_incluye_igv boolean;
