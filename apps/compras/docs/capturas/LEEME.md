# Capturas del manual

Acá van las fotos de pantalla que usa
[`../manual-visual-compras-pagos.html`](../manual-visual-compras-pagos.html).

El manual ya está escrito y se puede leer y repartir **ahora**, con la
carpeta vacía: donde falta una foto muestra un recuadro que dice qué falta,
en qué pantalla se saca y con qué usuario. A medida que vayan cayendo los
archivos acá, el recuadro se reemplaza solo por la imagen. No hay que tocar
el HTML.

## Cómo sacarlas

1. Entra a `erp.logisalud.com/compras` con el usuario que pide cada fila.
2. Navega a la pantalla.
3. Captura **solo la ventana del navegador**, sin la barra de tareas ni el
   escritorio.
4. Guarda el PNG acá con **el nombre exacto** de la primera columna.

Consejos que se notan mucho en el resultado:

- Ancho de ventana ~1280 px para las pantallas de escritorio. Más ancho deja
  la tabla perdida en el medio de la hoja.
- Las cuatro pantallas marcadas *cualquier usuario* conviene sacarlas en
  celular (ancho ~390 px): son las que de verdad se usan desde el teléfono.
- Si una pantalla es más larga que la ventana, usa la captura de página
  completa del navegador en vez de pegar dos fotos.

## Antes de repartir el manual

Estas capturas son de **producción**: salen con nombres de proveedores,
montos y números de factura reales. El manual con fotos es de uso interno —
no va a proveedores, ni a un drive público, ni de adjunto a un correo que
salga de Logisalud.

Si alguna captura muestra algo que no debería circular ni internamente
(una cuenta bancaria, por ejemplo), táchalo antes de guardarla.

## Las 48 fotos

| Archivo | Pantalla | Con qué usuario | Qué se tiene que ver |
| --- | --- | --- | --- |
| `01-login.png` | `/compras/login` | cualquiera | Pantalla de ingreso |
| `02-modulos.png` | `/ (la portada de erp.logisalud.com)` | cualquiera | Portada de módulos |
| `03-inicio-contabilidad.png` | `/compras` | Mariela (contabilidad) | Menú principal, visto por Contabilidad |
| `04-inicio-tesoreria.png` | `/compras` | Milagritos (tesorería) | El mismo menú, visto por Tesorería: son menos opciones, y está bien |
| `10-ordenes.png` | `/compras/ordenes` | Compras o Contabilidad | Listado de órdenes con los filtros arriba |
| `11-oc-nueva.png` | `/compras/ordenes-compra/nueva` | Compras | Cabecera de la orden: proveedor, moneda, condición de pago |
| `12-oc-lineas.png` | `/compras/ordenes-compra/nueva (con dos o tres líneas ya cargadas)` | Compras | Las líneas y el total que se va calculando abajo |
| `13-oc-ficha.png` | `/compras/ordenes-compra/[id] — abre cualquier OC de la lista` | Compras | Ficha de la orden: el estado, las líneas y los botones |
| `14-oc-imprimir.png` | `/compras/ordenes-compra/[id]/imprimir` | Compras | La orden lista para enviar |
| `20-almacen.png` | `/compras/almacen` | Charlie o Roberto (almacén) | Órdenes esperando que llegue la mercadería |
| `21-recepcion-tres-columnas.png` | `/compras/almacen/recepciones/nueva/[ocId]` | Almacén | Las tres columnas por cada producto |
| `22-recepcion-guias.png` | `/compras/almacen/recepciones/nueva/[ocId] (abajo, con dos guías cargadas)` | Almacén | Dos guías para la misma orden, cada una con su archivo |
| `23-recepcion-ficha.png` | `/compras/almacen/recepciones/[id]` | Almacén | La recepción guardada, con sus archivos |
| `30-cuentas-por-pagar.png` | `/compras/cuentas-por-pagar` | Mariela (contabilidad) | Listado de obligaciones |
| `31-obligacion.png` | `/compras/cuentas-por-pagar/[id] — entra a una que esté 'registrada'` | Mariela | Ficha de una obligación |
| `32-nota-credito.png` | `/compras/cuentas-por-pagar/[id] — una que esté esperando NC` | Mariela | Cargar la nota de crédito |
| `33-propuesta-nueva.png` | `/compras/cuentas-por-pagar/propuestas/nueva` | Mariela | Armando el lote |
| `34-propuesta.png` | `/compras/cuentas-por-pagar/propuestas/[id]` | Mariela | El lote armado, esperando aprobación |
| `35-pendientes-aprobar.png` | `/compras/pendientes-aprobar` | Mariela | Todo lo que espera tu decisión, en un solo lugar |
| `36-pagos-por-ejecutar.png` | `/compras/pagos-por-ejecutar` | Milagritos (tesorería) | Lotes aprobados, listos para desembolsar |
| `37-registrar-pago.png` | `/compras/pagos-por-ejecutar/[id]` | Milagritos | La única pantalla donde se registra un pago |
| `40-os-nueva.png` | `/compras/servicios/nueva` | Compras | Nueva orden de servicio |
| `41-factura-servicio.png` | `/compras/facturas/nueva` | Contabilidad | Registrar la factura del servicio |
| `42-os-ficha.png` | `/compras/servicios/[id]` | Contabilidad | Ficha de la orden de servicio |
| `50-pedir-pago.png` | `/compras/pedir-pago` | cualquier usuario | Elegir el tipo de pedido |
| `51-gasto-nueva.png` | `/compras/gastos/nueva` | cualquier usuario | La solicitud |
| `52-gasto-ficha.png` | `/compras/gastos/[id]` | Contabilidad | Ficha de la solicitud |
| `53-rendicion.png` | `/compras/gastos/[id] — un anticipo ya pagado, en rendición` | quien pidió el anticipo | Rendir el anticipo |
| `60-caja-chica.png` | `/compras/caja-chica` | Contabilidad (para que se vea 'Todos los fondos') | Caja chica: el fondo y su saldo |
| `61-movimiento-nuevo.png` | `/compras/caja-chica/fondos/[id]/movimientos/nuevo` | custodio del fondo | Cargar un gasto del fondo |
| `62-reposiciones.png` | `/compras/caja-chica/reposiciones` | Contabilidad | Reposiciones |
| `63-descarga-excel.png` | `/compras/caja-chica — el botón de descarga` | Contabilidad | Descargar el reporte de caja chica |
| `70-financiamiento.png` | `/compras/financiamiento` | Contabilidad | Financiamiento |
| `71-prestamo-nuevo.png` | `/compras/financiamiento/prestamos/nueva` | Contabilidad | Cargar un préstamo |
| `72-fraccionamiento.png` | `/compras/financiamiento/fraccionamientos` | Contabilidad | Fraccionamientos |
| `73-canje-letras.png` | `/compras/financiamiento/letras/canjear/[id]` | Contabilidad | Canjear por letras |
| `74-vencimientos.png` | `/compras/financiamiento/vencimientos` | Contabilidad | Vencimientos próximos |
| `80-impuesto-nuevo.png` | `/compras/impuestos/nueva` | Contabilidad | Registrar un impuesto |
| `81-planilla.png` | `/compras/planilla` | Gestión Humana o Contabilidad | Planilla |
| `90-reportes.png` | `/compras/reportes` | Contabilidad | Los reportes disponibles |
| `91-proyeccion.png` | `/compras/reportes/cuentas-por-pagar/proyeccion-pagos` | Contabilidad | Proyección de pagos |
| `92-antiguedad.png` | `/compras/reportes/cuentas-por-pagar/antiguedad` | Contabilidad | Antigüedad |
| `93-historial-pagos.png` | `/compras/reportes/cuentas-por-pagar/historial-pagos` | Contabilidad | Historial de pagos |
| `94-sabana.png` | `/compras/reportes/sabana-maestra` | Contabilidad | Sábana maestra |
| `95-dashboard.png` | `/compras/dashboard` | Contabilidad | Dashboard |
| `96-proveedores.png` | `/compras/proveedores` | Compras o Contabilidad | Proveedores |
| `97-mi-cuenta-bancaria.png` | `/compras/mi-cuenta-bancaria` | cualquier usuario | Tu cuenta bancaria |
| `98-mis-operaciones.png` | `/compras/mis-operaciones` | cualquier usuario | Mis operaciones |