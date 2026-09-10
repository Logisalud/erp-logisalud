-- "Pago en cuotas" para OS y Pago Directo, no solo para compras
-- (sesión 2026-09-10).
--
-- La maquinaria de "un documento se paga en varios vencimientos con fecha"
-- ya existía y está integrada con propuestas y con la bandeja de
-- vencimientos: `canjearPorLetras` parte una obligación en N letras, deja
-- la original en `canjeada_por_letra` (así no se paga dos veces) y después
-- Contabilidad genera la obligación de cada vencimiento. Lo único que la
-- ataba a compras era esta tabla:
--
--   proveedor_id uuid not null references compras.proveedores(id)
--
-- Con eso, una OS (proveedor de servicio) o un Pago Directo a notaría /
-- seguros / courier — que desde 0037+ puede tener proveedor_servicio_id —
-- fallaban en el insert. Se abre la tabla a las dos fuentes con el mismo
-- patrón que ya usa cuentas_x_pagar.obligaciones: dos columnas nullables y
-- un CHECK que exige exactamente una.
--
-- El CHECK es MÁS estricto que el `not null` que reemplaza: antes nada
-- impedía... nada, porque solo había una opción posible. Ahora es
-- imposible una letra sin proveedor o con los dos. Las filas existentes
-- tienen proveedor_id cargado y la columna nueva en null, así que ya lo
-- cumplen — ampliar así no puede fallar contra datos viejos.

alter table financiamiento.letras_por_pagar
  alter column proveedor_id drop not null;

alter table financiamiento.letras_por_pagar
  add column if not exists proveedor_servicio_id uuid
    references servicios.proveedores_servicio(id);

alter table financiamiento.letras_por_pagar
  drop constraint if exists letras_proveedor_exactamente_uno;

alter table financiamiento.letras_por_pagar
  add constraint letras_proveedor_exactamente_uno check (
    (proveedor_id is not null) <> (proveedor_servicio_id is not null)
  );
