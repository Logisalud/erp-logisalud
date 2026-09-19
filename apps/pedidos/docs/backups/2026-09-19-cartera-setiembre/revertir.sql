-- Revertir customers al estado del 2026-09-19 (antes de la carga de la
-- Nueva Cartera Setiembre 2026). Generado desde customers-antes.json.
-- Huella verificada del estado que restaura: 3dcf2f19d04f90b5c56a8fd6cc84cc46
--
-- Restaura SOLO las dos columnas del snapshot. No toca canal, zona, vendedor
-- ni estado: esa carga no los modifica.

begin;

-- 1) Todo a NULL, que es como estaban 3.399 de los 3.419 clientes.
update pedidos.customers set condicion_pago_habitual_id = null;
update pedidos.customers set limite_credito = null;

-- 2) Los 16 clientes que SÍ tenían condición 1.
update pedidos.customers set condicion_pago_habitual_id = 1
 where ruc_o_documento in ('10083572651', '10207022042', '10431422374', '1043592204', '10435922304', '10459886988', '10466970745', '123', '20610098585', '20611789956', '20613715496', '20999999999', '74453492222', '7888888888', '99999999002', '999999999');

-- 2) Los 4 clientes que SÍ tenían condición 2.
update pedidos.customers set condicion_pago_habitual_id = 2
 where ruc_o_documento in ('10038904758', '10429445592', '20531749147', '74453492');

-- 3) Comprobar antes de confirmar: tiene que dar 3419 y la huella de arriba.
select count(*) filas,
       md5(string_agg(ruc_o_documento || ':' || coalesce(condicion_pago_habitual_id::text,''),
                      ';' order by (ruc_o_documento || ':' || coalesce(condicion_pago_habitual_id::text,'')) collate "C")) huella
  from pedidos.customers;

-- commit;  -- descomentar solo si la huella calza
rollback;
