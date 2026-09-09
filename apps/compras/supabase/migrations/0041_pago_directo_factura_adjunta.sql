-- Pago Directo: cuando SÍ hay factura (no es el caso de "pendiente de
-- factura", ver 0037), permitir subir el escaneo/PDF de esa factura como
-- sustento — mismo criterio que la cotización de 0037, columna aparte.
alter table cuentas_x_pagar.obligaciones
  add column if not exists factura_storage_path text;
