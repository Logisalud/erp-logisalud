-- Precio de compra por producto — cargado por proveedor a medida que Sebas
-- manda las listas (Biosana/Prades/Reumasol primero, el resto después).
-- Nullable: no todos los productos tienen precio de compra cargado
-- todavía, y no hay forma de adivinarlo. El precio de venta sigue viviendo
-- en pedidos.price_lists — esta columna es solo el lado de compra.
--
-- Nota: esta migración ya se había aplicado directo contra la base real
-- (qpkigzniatidsvnxikox) antes de que este archivo existiera en el repo —
-- se agrega ahora para que el repo quede como fuente de verdad real de lo
-- que hay en la base. `if not exists` la deja segura de re-correr.

alter table catalogo.productos
  add column if not exists precio_compra numeric(14,4);
