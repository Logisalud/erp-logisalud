-- Productos exonerados de IGV, de punta a punta: catálogo → OC → recepción →
-- obligación. (Sebas, 2026-10-06.)
--
-- Hasta ahora todo el circuito de compras le sumaba 18% a TODO: la OC al
-- subtotal entero (domain/orden-compra.ts), y la recepción a la base entera
-- de la obligación que genera (domain/recepcion-tres-columnas.ts). Un
-- medicamento exonerado — los antidiabéticos de JAM Pharma, y otros que ya
-- están en el catálogo — salía 18% más caro en la OC y en la deuda.
--
-- No alcanza con arreglar la OC: la deuda la crea la recepción, con su propio
-- cálculo. Si solo se corrigiera la OC, la OC diría 81.12 y Tesorería pagaría
-- 95.72.
--
-- Re-ejecutable.

-- ===================================================================
-- 1. El producto sabe si es exonerado
-- ===================================================================
alter table catalogo.productos
  add column if not exists exonerado_igv boolean not null default false;

comment on column catalogo.productos.exonerado_igv is
  'El producto no lleva IGV (exonerado o inafecto). Lo declara Contabilidad: el sistema nunca lo infiere del principio activo. Migración 0078.';

-- Los únicos que se marcan acá: los tres de JAM Pharma, cuyo régimen consta
-- en su propia lista de precios (precio sin IGV = precio final). Los demás
-- exonerados que ya están en el catálogo los confirma Contabilidad — marcar
-- uno por parecido de principio activo sería decidir un régimen tributario
-- a ojo.
update catalogo.productos set exonerado_igv = true, updated_at = now()
 where codigo in ('JAM313', 'JAM314', 'JAM315', 'BOJAM313', 'BOJAM314', 'BOJAM315')
   and not exonerado_igv;

-- ===================================================================
-- 2. La línea de OC guarda lo que se pactó
-- ===================================================================
-- Una FOTO del flag del producto al momento de armar la OC, no una lectura
-- en vivo: si mañana Contabilidad corrige un producto, una OC ya enviada al
-- proveedor no puede cambiar de total sola. Las 66 líneas existentes quedan
-- en false — ninguna es de un producto exonerado (JAM se cargó hoy).
alter table compras.ordenes_compra_items
  add column if not exists exonerado_igv boolean not null default false;

-- ===================================================================
-- 3. La obligación separa lo exonerado
-- ===================================================================
-- `base_imponible` sigue siendo lo que dice su nombre — la base GRAVADA, la
-- que va a SUNAT —, y lo exonerado va en su propia columna. La alternativa
-- (sumar lo exonerado dentro de la base y calcular el IGV solo sobre una
-- parte) da el total correcto el día que se crea, pero el sistema recalcula
-- `igv = base × 18%` en varios lugares: el primer recálculo le volvería a
-- cargar IGV a lo exonerado.
alter table cuentas_x_pagar.obligaciones
  add column if not exists monto_exonerado numeric(14,2) not null default 0;

alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_monto_exonerado_no_negativo;
alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_monto_exonerado_no_negativo check (monto_exonerado >= 0);

comment on column cuentas_x_pagar.obligaciones.monto_exonerado is
  'Valor de las líneas exoneradas de IGV. NO es parte de base_imponible (que es solo lo gravado). total = base_imponible + monto_exonerado + igv. Migración 0078.';

-- `total` y `neto_a_pagar` son generadas: se les cambia la fórmula con
-- SET EXPRESSION (Postgres 17), sin soltar las columnas. Con
-- monto_exonerado = 0 en todas las filas existentes, los valores de las 110
-- obligaciones actuales no cambian un céntimo.
--
-- Re-ejecutable: SET EXPRESSION con la misma fórmula solo recalcula.
alter table cuentas_x_pagar.obligaciones
  alter column total set expression as (base_imponible + monto_exonerado + igv);
alter table cuentas_x_pagar.obligaciones
  alter column neto_a_pagar set expression as
    (base_imponible + monto_exonerado + igv - coalesce(monto_detraccion, 0));
