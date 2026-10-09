# Alta de la línea JAM Pharma — 2026-10-09

Proveedor nuevo, el sexto. Archivo de origen: `JAM_PHARMA_PRECIOS.xlsx`
(copia en esta carpeta), hojas `PRECIOS` y `PROMOS`.

## Qué se cargó

| | |
|---|---:|
| Proveedor | JAM Pharma |
| Productos vendibles (`JAM…`) | 34 |
| Gemelos de bonificación (`BOJAM…`) | 34 |
| Perfiles tributarios (GRAVADO 18%) | 68 |
| Precios (34 productos × 6 canales) | 204 |
| Bonificaciones (27 productos × 6 canales) | 162 |

Queda en `pedidos.audit_logs` id **8700**.

## Decisiones de carga

**Un solo precio, los seis canales.** El archivo trae una única columna
"PRECIO CON IGV", sin apertura por canal. Se cargó ese precio igual en los
seis (Horizontal, Mayorista, Minicadenas, Tops, Subdistribuidores,
Clínicas). Dejar un canal afuera no es neutro: el producto le aparecería
"sin precio" a un cliente de ese canal y no se podría pedir. Hoy la cartera
es 3.437 clientes Horizontal, 1 Mayorista y 1 Subdistribuidores, así que en
la práctica el que manda es Horizontal.

**Las promos, también en los seis canales**, por lo mismo: la hoja `PROMOS`
no distingue canal.

**`1 + 0` = sin promoción.** Siete productos tienen el código de
bonificación creado pero la columna de bonificadas en cero: `JAM107`,
`JAM205`, `JAM313`, `JAM314`, `JAM315`, `JAM316`, `JAM317`. El gemelo
existe, la promo no se cargó.

**El bonificado es el gemelo, no el mismo producto.** A diferencia de las
promos de Diphasac (donde `producto_bonificado_id` va en null y se bonifica
el mismo código), acá el archivo empareja cada producto con su `BOJAM…`, y
así quedó cargado. Por eso los 34 gemelos también tienen perfil tributario:
el motor (`pedidos.aplicar_promociones`) **no entrega la bonificación si el
producto bonificado no tiene uno**, y lo hace en silencio.

**Lo que el archivo no trae** y quedó vacío: presentación, principio
activo, marca y master pack. `unidad_medida` quedó en `CJA`.

## Lo que NO se cargó, y por qué

**`JAM203` y `BOJAM203` quedaron pendientes.** En la hoja `PRECIOS` figuran
con la descripción *"TENSOFLOW 10MG CJA X 30 TAB REC"* — **idéntica a la de
`JAM202`** — pero en la hoja `PROMOS` el mismo código aparece como
*"TENSOFLOW 15MG"*. Los precios son distintos (JAM202 = 85, JAM203 = 76),
así que son dos productos distintos y una de las dos hojas tiene mal el
nombre.

Cargarlo igual dejaba dos productos con el mismo nombre y distinto precio
en el buscador del vendedor: el error más fácil de cometer y el más difícil
de ver en un pedido. Falta confirmar la descripción correcta; con eso se
cargan el producto, su gemelo, sus 6 precios y su promo 1 + 1.

## Verificación

- Los 34 productos, sus descripciones y los 204 precios coinciden con el
  archivo, sin una sola diferencia.
- Los 34 tienen precio en los 6 canales y el mismo precio en todos.
- Ninguno de los 68 quedó sin perfil tributario.
- Las 162 filas de promoción apuntan al gemelo que dice el archivo, y los 27
  bonificados tienen perfil tributario.

## Un hallazgo aparte (no se tocó)

Los 7 gemelos creados el 2/10 para el stock —`BODHP009`, `BODHP108`,
`BODHP209`, `BODHP211`, `BODHP306`, `BOP000020`, `BOP000024`— **no tienen
perfil tributario**. Hoy no rompe nada porque ningún producto los declara
como su bonificación, pero el día que se enlace uno, el motor va a saltear
la bonificación sin avisar. Es un `insert` de 7 filas cuando se decida.

## Cómo revertirlo

```sql
delete from pedidos.promo_bonificaciones
 where product_id in (select id from pedidos.products where codigo_interno like 'JAM%');
delete from pedidos.price_list_items
 where product_id in (select id from pedidos.products where codigo_interno like '%JAM%');
delete from pedidos.price_lists where archivo_nombre = 'JAM_PHARMA_PRECIOS.xlsx';
delete from pedidos.product_tax_profiles
 where product_id in (select id from pedidos.products where codigo_interno like '%JAM%');
delete from pedidos.products where codigo_interno like 'JAM%' or codigo_interno like 'BOJAM%';
delete from pedidos.suppliers where nombre = 'JAM Pharma';
```

Es seguro mientras ningún pedido haya usado estos productos; si ya se usaron,
primero hay que resolver esos pedidos.
