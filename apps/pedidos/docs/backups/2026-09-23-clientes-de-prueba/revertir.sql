-- Revierte el borrado de los 7 clientes de prueba del 2026-09-23.
-- Ver RESUMEN.md. Correr entero, en orden: las direcciones dependen del cliente.

insert into pedidos.customers
  (id, razon_social, ruc_o_documento, whatsapp, estado, canal_id, zona_id,
   tipo_comprobante_permitido, condicion_pago_habitual_id, direccion_fiscal,
   created_at, updated_at)
values
  ('80ee7087-b9c1-484f-bd57-a04cd46aaf58','PRUEBA','123',null,'RECHAZADO',2,3,'BOLETA',1,null,'2026-08-03 20:57:28.920412+00','2026-08-05 23:33:24.78003+00'),
  ('8128fa82-177c-4e2c-b28c-474f54b0fa9e','PEPITO','74453492',null,'RECHAZADO',2,3,'BOLETA',2,null,'2026-09-02 22:48:38.745062+00','2026-09-02 22:48:38.745062+00'),
  ('54a9c069-4436-4157-b7b9-f549366fb3de','pepito SAC','999999999',null,'RECHAZADO',2,14,'BOLETA',1,null,'2026-09-05 14:57:40.696172+00','2026-09-05 14:57:40.696172+00'),
  ('32d43cbf-e6f1-438a-a7bb-b4cd3e7588b5','pepito','74453492222','937027239','RECHAZADO',2,6,'BOLETA',1,'av123','2026-09-10 18:15:11.81611+00','2026-09-10 18:15:11.81611+00'),
  ('8412a373-77b9-46f6-96f6-f495a9dc7790','pepito','7888888888','999999999','RECHAZADO',2,5,'BOLETA',1,'999999','2026-09-11 18:11:41.017873+00','2026-09-11 18:11:41.017873+00'),
  ('846ae84d-18df-4fa9-8efb-95ee37bc008b','RAZON  123','1043592204',null,'RECHAZADO',2,4,'BOLETA',1,'AV 123','2026-09-11 18:22:09.362358+00','2026-09-11 18:22:09.362358+00'),
  ('5b43e3bb-2d88-43cc-9022-0710c61c1f65','PEPITO SAN MIGUEL','123456789','5555555555','RECHAZADO',1,3,'BOLETA',2,'AV.AVIACION 123','2026-09-19 15:22:58.995236+00','2026-09-19 15:22:58.995236+00');

insert into pedidos.customer_addresses
  (id, customer_id, direccion, ubigeo, referencia, es_principal, estado, solicitado_por, created_at)
values
  ('3535f5a5-ae3f-4838-8ddb-67816b0fca15','80ee7087-b9c1-484f-bd57-a04cd46aaf58','Prueba 123',null,null,true,'activo','842aa287-1939-41ab-aae1-c26aa77bc9ba','2026-08-03 20:57:29.259399+00'),
  ('f5c18e73-6f0b-499c-a7d1-4f11d85cdb58','8128fa82-177c-4e2c-b28c-474f54b0fa9e','av 123',null,null,true,'activo','bad18086-4a75-4526-a9e2-a21b8365e0b4','2026-09-02 22:48:39.111002+00'),
  ('08249447-f6ec-4fbf-8f6c-0cf8f0d39a64','54a9c069-4436-4157-b7b9-f549366fb3de','AV.ABC','021005',null,true,'activo','842aa287-1939-41ab-aae1-c26aa77bc9ba','2026-09-05 14:57:41.089975+00'),
  ('a001755b-9a89-4449-bcdf-f3fe9663c7c1','32d43cbf-e6f1-438a-a7bb-b4cd3e7588b5','av123','070102',null,true,'activo','bad18086-4a75-4526-a9e2-a21b8365e0b4','2026-09-10 18:15:12.488364+00'),
  ('36625676-0c5c-4723-a4af-a3c0a6d35a55','8412a373-77b9-46f6-96f6-f495a9dc7790','9999','190307',null,true,'activo','842aa287-1939-41ab-aae1-c26aa77bc9ba','2026-09-11 18:11:41.194077+00'),
  ('a9f618ed-03fe-4863-a9e8-e67197f0cd9d','846ae84d-18df-4fa9-8efb-95ee37bc008b','av 123','150902',null,true,'activo','842aa287-1939-41ab-aae1-c26aa77bc9ba','2026-09-11 18:22:09.608477+00'),
  ('3375267a-327e-46dd-93d6-9157d92f65ec','5b43e3bb-2d88-43cc-9022-0710c61c1f65','JIRON VILLA CARRILLO','150140',null,true,'activo','bad18086-4a75-4526-a9e2-a21b8365e0b4','2026-09-19 15:22:59.185713+00');

-- El log de correo 156 quedó con customer_id en null al borrarse su cliente
-- (la FK es ON DELETE SET NULL). Esto lo vuelve a apuntar.
update pedidos.notification_logs
   set customer_id = '5b43e3bb-2d88-43cc-9022-0710c61c1f65'
 where id = 156;
