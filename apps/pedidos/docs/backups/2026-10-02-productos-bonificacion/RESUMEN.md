# 7 productos de bonificación creados — 2026-10-02

Al cargar `STOCK_LOGISALUD_02.10.xlsx`, 7 códigos no existían en el catálogo
y sus filas no se iban a cargar. Se crearon.

## Qué son estos códigos

No son productos nuevos: son el **gemelo de bonificación** de un producto
que ya existe. El prefijo `BO` identifica a la familia, que ya estaba en el
catálogo desde sep-2026 (`BODHP008`, `BODHP109`, `BOP000019`, …). Un gemelo
de bonificación lleva la misma descripción, presentación, proveedor y unidad
que su base, **no tiene precio de lista** —no se vende, se entrega—, y la
base lo apunta con `codigo_bonificacion`.

El mapeo no es obvio en los `BOP`: `BOP000019` ↔ `PLGS19`, no `P000019`.

| Nuevo | Base | Producto | Unidades en el stock |
|---|---|---|---:|
| BODHP009 | DHP009 | D - CORT 4 4 MG/ 2 ML CJA X 1 AMP. | 248 |
| BODHP108 | DHP108 | JAMOL 5 5 MG CJA X 30 TAB. REC. | 134 |
| BODHP209 | DHP209 | DIPHADIC LONG 2 % CJA X TBO X 50 G | 1.945 |
| BODHP211 | DHP211 | IBUCALM 200 200 MG X 100 CAP. BDA. | 3 |
| BODHP306 | DHP306 | HISOPOS NADÓ X 500 BASTBIO/PTA/ALGODÓN | 40 |
| BOP000020 | PLGS20 | MELENA DE LEON 500 MG FCO X 60 CAP. | 4 |
| BOP000024 | PLGS24 | ASHWCALMEX 500 MG FCO X 120 CAP. | 8 |

Cada uno copió de su base: `codigo_proveedor`, `descripcion`,
`presentacion`, `supplier_id`, `marca`, `unidad_medida`, `principio_activo`,
`controla_lote` y `controla_vencimiento`. Estado `activo`, sin precio.

## Dos cosas que NO se copiaron, a propósito

**`PLGS20` tiene basura en `unidad_medida`:** el valor guardado es
`50.847457627118644` — un número que aterrizó en la columna de unidad de
medida, probablemente de una carga vieja. A `BOP000020` se le puso `UND`, que es lo
que usan los otros `BOP`. **La basura sigue en `PLGS20`**: corregirla es un cambio sobre un producto que se vende y
no estaba pedido.

**No se seteó `codigo_bonificacion` en los productos base.** Los 7 quedan
creados pero sin enlazar desde su base. Enlazarlos hace que la app los
**ofrezca al vendedor** como bonificación de ese producto, que es un cambio
de comportamiento comercial y no fue lo que se pidió. Es una línea cuando se
decida.

## Verificación

Los **153 códigos** del archivo existen ahora en el catálogo y ninguno está
inactivo: el archivo entero debería cargar sin rechazos.

Queda en `pedidos.audit_logs` id **8515**.

## Cómo revertirlo

```sql
delete from pedidos.products
 where codigo_interno in ('BODHP009','BODHP108','BODHP209','BODHP211',
                          'BODHP306','BOP000020','BOP000024');
```

Es seguro mientras no se les haya cargado stock ni usado en un pedido; si ya
se cargó el Excel, primero hay que borrar ese stock.
