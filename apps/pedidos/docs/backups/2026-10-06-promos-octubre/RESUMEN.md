# Promociones de octubre 2026 (Diphasac) — 2026-10-06

Las promociones de setiembre se habían cargado el 3/09 **sin fecha de fin**,
así que el 6 de octubre seguían aplicando. Los vendedores lo venían
reportando a mano: el pedido 155 de Omar Rubio quedó frenado con 9
solicitudes de descuento cuyo motivo era, textual, *"PROMOCIÓN MES DE
OCTUBRE NO JALA EL SIST"*.

Archivo de origen: `DIPHASAC_ListaDePrecios_OCT_2026.xlsx`, hoja
`LISTA_PRECIOS_2026` (copia en esta carpeta). Confirmado por
aromero@logisalud.com antes de cargar.

## Qué quedó vigente

**25 productos con promoción, 65 filas** (una por producto y canal), con
`vigente_desde = 2026-10-06` y sin fecha de fin:

- **30 escalas** por % de descuento: 18 en Horizontal y 3 productos
  (DIPHANATUR 300, 500 y FORTE) con un tramo de 10 a más cajas en
  Mayorista, Subdistribuidores, Minicadenas y Tops.
- **35 bonificaciones** (compra N, lleva M): 7 productos × 5 canales.
- **0 descuentos condicionados.**

## Qué reemplazó

Lo de setiembre (18 escalas + 44 bonificaciones + 1 condicionado) se cerró
con `vigente_hasta = 2026-10-05`. No se borró nada: el histórico queda.

| | |
|---|---|
| Sin cambio | las 35 bonificaciones y la escala de DIPHANATUR FORTE |
| Mejoran | DIPHANATUR 300 y 500 (40%→50%), MUCOFLUX 200 (10%→25%), DUO DAPHA 10 (de "2 a más al 15%" a "1 a más al 50%") |
| Empeora | **PROSTAMICIL baja de 30% a 24%** — confirmado como intencional |
| Cambian de tipo | **DUO DAPHA 5, GLICOFAST 1000, JAMOL 5, VITAMINA E y NADO x500 dejan de entregar unidades gratis** y pasan a % de descuento |
| Nuevos | IBUCALM 200 (25%), DIPHACOXIB (15%), DIPHADIC LONG 100 (10%), DIPHARELAX 100 (10%), DRAVOM (14%), CELECOXIB (25%), ESOMEPRAZOL (28%) |
| Dado de baja | el paquete **IBUCALM + MUCOFLUX (−16%)**: el usuario confirmó que ya no existe |

## Por qué no se usó el importador de la app

`/admin/maestros/promociones` cierra lo anterior **sólo dentro de la misma
tabla**: busca por `product_id` + `sales_channel_id` en la tabla que está
escribiendo. Los 5 productos que pasan de bonificación a escala se escriben
en `promo_escalas`, así que sus 9 filas viejas de `promo_bonificaciones`
habrían quedado vivas — el producto daría la unidad gratis **y además** el
descuento nuevo. Por eso se cargó por SQL, cerrando las tres tablas.
Tampoco importa el descuento condicionado (en el archivo era una nota en
prosa), que acá había que dar de baja.

Si se arregla esa parte del importador, la próxima carga puede ser por la
app.

## Verificación

- 65 filas vigentes, 25 productos, `vigente_desde = 2026-10-06` en todas.
- Ningún producto con escala **y** bonificación a la vez (era el riesgo).
- Ningún producto `BO*` (gemelo de bonificación) con promo: cuatro códigos
  de proveedor apuntan a dos productos desde que se crearon los gemelos el
  2/10, y la carga se filtró al producto que se vende.
- El precio promocional que calcula el motor (`precio de lista × (1 − %)`)
  coincide al céntimo con el declarado en el archivo en 24 de las 30
  escalas. Las 6 restantes son los tramos de Minicadenas y
  Subdistribuidores de DIPHANATUR 300/500/FORTE: el archivo declara un solo
  precio para todo el bloque mayorista, calculado sobre la lista de
  Mayorista, y esos dos canales tienen una lista un poco menor. El cliente
  paga **menos** que el declarado (ej. 54,83 contra 56,08), no más. Es el
  mismo comportamiento que tenía la carga de setiembre.
- Los precios de lista del archivo son **idénticos** a los ya cargados en
  los 54 productos: no había nada que reimportar ahí.
- Las 7 solicitudes de descuento pendientes del pedido 155 que pedían
  precio de promoción coinciden ahora al céntimo con lo que el sistema
  calcula solo (MUCOFLUX 16,46 · DIPHANATUR 500 53,55 · DIPHACOXIB 35,70).
  Las otras 2 son MELENA DE LEON a precio de lista — la "autorización de
  Belén", que no es promoción.

Queda en `pedidos.audit_logs` id **8534**.

## Cómo revertirlo

```sql
delete from pedidos.promo_escalas where vigente_desde = date '2026-10-06';
delete from pedidos.promo_bonificaciones where vigente_desde = date '2026-10-06';
update pedidos.promo_escalas set vigente_hasta = null where vigente_hasta = date '2026-10-05';
update pedidos.promo_bonificaciones set vigente_hasta = null where vigente_hasta = date '2026-10-05';
update pedidos.promo_descuentos_condicionados set vigente_hasta = null where vigente_hasta = date '2026-10-05';
```

Los respaldos completos de las tres tablas, tal como estaban antes, quedaron
en `pedidos.promo_escalas_backup_20261006`,
`pedidos.promo_bonificaciones_backup_20261006` y
`pedidos.promo_descuentos_cond_backup_20261006`.
