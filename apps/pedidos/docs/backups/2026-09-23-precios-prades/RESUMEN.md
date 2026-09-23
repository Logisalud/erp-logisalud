# Dos precios de Prades estaban intercambiados — 2026-09-23

## Qué pasaba

Contra la lista de Prades (Lima) que pasó el usuario, dos productos tenían el
precio del otro:

| Producto | Estaba | Debía |
|---|---|---|
| PLGS06 · COLLAGEN PRETTY VITALS CJA X 33 SACHETS | S/ 74.00 | **S/ 85.00** |
| PLGS09 · NUTRIVIDA ADVANCE LATA X 1KG | S/ 85.00 | **S/ 74.00** |

En los 5 canales (Horizontal, Mayorista, Minicadenas, Subdistribuidores,
Tops), que tienen el mismo precio en esta lista.

## Por qué

Los códigos están corridos respecto de la lista del proveedor. Desde PLGS06,
cada código apunta a un producto distinto del que tiene la lista de Prades:

| Código | En la lista de Prades | En el sistema |
|---|---|---|
| PLGS06 | NUTRIVIDA KIDS vainilla | COLLAGEN PRETTY VITALS sachets |
| PLGS07 | NUTRIVIDA KIDS chocolate | NUTRIVIDA KIDS vainilla |
| PLGS08 | NUTRIVIDA ADVANCE | NUTRIVIDA KIDS chocolate |
| PLGS09 | COLLAGEN PRETTY VITALS sachets | NUTRIVIDA ADVANCE |
| PLGS14 | OVAMET 40-1 | BLACKY FE tira x 12 (inactivo) |
| PLGS23 | — | OVAMET 40-1 |

Los importes de la lista son correctos; lo que se corrió es a qué producto le
tocaba cada uno. Como NUTRIVIDA KIDS vainilla y chocolate cuestan lo mismo
(74), el corrimiento solo se notó en las dos puntas: PRETTY VITALS sachets y
NUTRIVIDA ADVANCE.

**Solo se corrigieron los precios.** Los códigos quedan como están: cambiarlos
tocaría productos ya vendidos y es una decisión del maestro de productos, no
de la lista de precios.

## Consecuencia ya ocurrida

El pedido **#71** (Vider Salud, 21/09) llevó 6 unidades de NUTRIVIDA ADVANCE.
El vendedor pidió descuento de 85 a 72 y se lo aprobaron: con el precio
correcto (74) el descuento real fue de S/ 2 y no de S/ 13. El pedido **no se
tocó** — ya está enviado y su precio quedó grabado en la línea.

Los otros tres productos con el código corrido nunca se pidieron.

## Cómo se aplicó

`UPDATE` en el sitio sobre las 10 filas (2 productos × 5 canales), sin
versionar con `vigente_hasta`. Es a propósito: el precio **nunca** fue el que
estaba cargado — fue un error de carga, no un cambio de precio. Versionarlo
haría parecer que el 74 estuvo vigente y válido hasta hoy.

Queda registrado en `pedidos.audit_logs` con la acción
`corregir_precios_cruzados_prades`, con el antes y el después.

## Cómo revertir

```sql
update pedidos.price_list_items set precio = 74.0000 where id in (1261,1262,1263,1264,1265);
update pedidos.price_list_items set precio = 85.0000 where id in (1276,1277,1278,1279,1280);
```

## Otros dos hallazgos, sin tocar

- **PLGS24 ASHWCALMEX** tiene precio (S/ 62.00 en los 5 canales) pero
  `price_list_id` en NULL: se cargó suelto el 2026-09-16, fuera del
  importador, y no figura en la lista de Prades. Ya se vendió en el pedido
  #49.
- **PLGS17** y **PLGS19** tienen la presentación distinta a la de la lista
  (SELENIO X 30 vs X 60 cápsulas; NAD 500 mg vs 900 mg). El precio coincide en
  los dos casos, así que no se tocó nada: hay que confirmarlo con Prades.
