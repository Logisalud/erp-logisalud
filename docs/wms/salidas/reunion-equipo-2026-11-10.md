# Salidas · reunión del equipo (2026-11-10)

Orden pedido por Sebas (donde choque con el mensaje del piloto, manda este). Estado al 2026-11-10:

| # | Pieza | Estado |
|---|-------|--------|
| 1a | Guía y Nubefact: causa y arreglo | **Hecho en código** (modo por entorno + aviso de modo prueba). Causa en producción: `guia_modo = PANEL` (el WMS no envía a Nubefact) y falta `NUBEFACT_MODO` (cae en el simulador). Falta decisión: ver abajo |
| 1b | Ruteo: auxiliares, columna/filtro/orden «Distrito», vehículo de contingencia | **Hecho**: auxiliares (0052), Distrito, y vehículo de contingencia (0057: marca en el vehículo y nota obligatoria para confirmar la ruta) |
| 1c | Orden de Salida: buscador por guía/orden, «Editar» | **Hecho** (0059): la nota siempre; destinatario y cantidades solo en una orden manual antes del picking (con motivo); una orden de Pedidos solo la nota (y los lotes con su editor). **Pendiente de decisión:** «después del picking, editar devuelve la orden al paso anterior» (mueve stock físico; ver `decisiones-pendientes.md`) |
| 1d | Etiqueta: dirección de destino | Pendiente |
| 1e | «Actualizar desde pedidos» (WMS_PEDIDOS_URL/SECRETO los carga Sebas) | Pendiente |
| 2 | Flujo con pre-guía (TTT1 reservado, aviso a Arlette, números sin usar) | Pendiente |
| 3 | Conformidad y bultos (tomar para conformidad) | **Hecho** (0060): «Tomar para conformidad», el Jefe asigna o suelta, una orden tomada queda bloqueada para otros, quien picó no la conforma. Los auxiliares de almacén y los jefes ahora tienen el permiso de dar la conformidad |
| 4 | Embalaje, etiquetas y carga (Lima 15 y 07; conteo de bultos) | Hecho (migración 0061, **sin aplicar**): sin embalaje para nadie, etiqueta solo provincia, carga por conteo (QR guardado y apagado) |
| 5 | Paquete documental por casillas | Pendiente |
| 6 | Hojas de ruta (cuando lleguen los formatos) | Esperando formatos |
| + | **Pantalla nueva «Guías»** (pedido de Sebas durante el trabajo): buscador de guías con estado, destinatario (cliente o proveedor), fecha, serie-número, orden, pedido, ruta, placa, conductor, bultos, peso, modo, estado SUNAT y enlace; filtros por estado, fecha, destinatario y número | Pendiente (se arma sobre `guias_remision` + `salidas`) |

## 1a · por qué no aparecía nada en el panel de Nubefact
1. En la base real `guia_modo = PANEL`: la pantalla pide «Registrar guía emitida» y **no llama a Nubefact**. Para que el WMS envíe hay que poner `guia_modo = WMS` (parámetro de la base; decisión de Sebas).
2. En producción están `NUBEFACT_ENTORNO`, `NUBEFACT_RUTA`, `NUBEFACT_TOKEN` y `WMS_MODO_PILOTO`, pero **no `NUBEFACT_MODO`**: caía en el simulador. Con este cambio, si `NUBEFACT_ENTORNO=DEMO` y están la ruta https y el token, el modo es PRUEBA sin más variables (una `NUBEFACT_MODO` escrita sigue mandando).
3. La Preview solo tiene `WMS_DEMO`: sin `NUBEFACT_RUTA` ni `NUBEFACT_TOKEN` usa el simulador.


## Actualización 2026-11-11 (rankings, carga y ruta del día)
- **Hecho (en código, sin aplicar la 0053):** «Diferencia detectada en la carga» (botón en la carga de cada pedido; no la registra quien picó ni quien conformó; el Jefe de Transporte puede descartarla con motivo), `wms.pedidos_del_mes` y la pantalla **Ranking del mes** (menú Control): «Cómo voy», «Cómo se gana el mes» y las dos tablas (picking y conformidad), según `ranking-auxiliares.md`. Los jefes no entran.
- **Pendiente:** conformidad con «pedido conforme sí/no» y tipo de diferencia (descripción, documento); el error del cliente/mal despacho desde la entrega; premio por ranking (parámetros).
- **Foto del pedido con la caja abierta antes de cargarlo:** recomendación: la toma **quien carga (el transportista)**, un archivo por pedido, guardado en el bucket privado como las fotos de entrega; sirve de prueba del estado en que se recibió la mercadería. Pendiente de decisión de Sebas y de construir.
- **Hoja interna de la ruta del día (Roberto → transportista), columnas** (del formato `RUTA DEL dd/mm/aaaa`, agrupado por propietario: LGS = Logisalud, DHP = Diphasac): CLIENTE · # CLIENTE (teléfono) · CONDICIÓN (despacho) · GUÍA · DIRECCIÓN · DESTINO (distrito) · TRANSPORTISTA · REPRESENTANTE (vendedor) · FORMA DE PAGO (crédito/contado) · HORARIO (ventana de entrega). Pendiente de construir (sección 6); la de DIGEMID (LS-FR.43.03) sigue aparte.

## Actualización 2026-11-11 (noche)
- **Hecho y aplicado en la base real:** 0055 (pre-guía), 0056 (conformidad del cliente en la entrega y foto del pedido con la caja abierta), 0057 (vehículo de contingencia), 0058 (inspecciones de la unidad LS-FR.49.03 y LS-FR.52.03; la supervisa otro conductor; descarga del mes en Word).
- **Hecho en código, sin aplicar:** 0059 («Editar» la orden) y 0060 («Tomar para conformidad»).
- **Pendiente:** embalaje, etiquetas y carga (punto 4); paquete documental por casillas (5); firma dibujada del conductor y del Director Técnico en las inspecciones; aviso por correo a Arlette; hoja LS-FR.43.03 DIGEMID.
- **Etiqueta de bulto de provincia (punto 4), hecha:** hoja LOGISALUD del formato de etiquetas (ORIGEN y DESTINO, destinatario, entrega a domicilio «DEPARTAMENTO - PROVINCIA - DISTRITO - dirección» desde el ubigeo, n.º de guía, «bulto k de N», QR del bulto, íconos de manipulación y logo). Tamaño de la etiquetera TSC TE200: **104,6 × 75,0 mm** (etiquetas troqueladas, anchuras expuestas 1,3 mm).
- **Pendiente (pedido de Sebas, 11-nov):** pantalla «Rótulos de caja saldo» (formato **LS.ET.07**, «STATUS DEL PRODUCTO (Cajas Saldo)», 2 por hoja A4) para auxiliares, Jefe de Almacén (Charlie y Jasury) y quien tenga el permiso: se llenan solos USUARIO, PRODUCTO, R.S. N.°, LOTE/SERIE, VENCIMIENTO y STATUS (verde «APROBADO»); la **cantidad** queda en blanco (a mano), la **fecha de conteo** viene con el día de hoy y la **firma** en blanco para firmar a mano.


## Punto 4 · decisión final de Sebas (11-nov-2026)

- **Sin proceso de embalaje, ni siquiera para provincia** (parámetro `embalaje_activo` = NO; en SI vuelve para los pedidos nuevos). Los bultos quedan registrados en la conformidad.
- **La etiqueta se mantiene para provincia** (hoja LOGISALUD, 104,6 × 75 mm, con el QR del bulto); se imprime desde «Cargar la unidad». **Lima** (departamento de Lima, ubigeo 15, y Callao, 07; parámetro `ubigeos_lima_metropolitana` = `15,07`) **no lleva etiquetas.**
- **Carga por conteo de bultos en Lima y en provincia** (parámetro `carga_escaneo_qr` = NO): cada pedido se cuenta (`registrar_conteo_carga`) y la unidad se libera con todo contado. **El escaneo del QR queda en el código, apagado**, para cuando todo funcione.
- Demo y pruebas siguen el flujo anterior por defecto; `WMS_DEMO_EMBALAJE=NO` y `WMS_DEMO_CARGA_QR=NO` imitan el piloto.
- Paquete documental de la ruta por casillas por pedido: hecho (marcado de entrada si el cliente pide documentos).

## Ruteo interno, aviso de facturación y hoja de DIGEMID (11-nov-2026)

- **«Mis rutas» y la hoja «Ruta del día»** llevan las columnas del formato interno: cliente, # cliente (teléfono, que ahora entrega Pedidos), condición, guía (la vigente o la pre-guía), dirección, destino, transportista, representante, forma de pago y horario (migración 0062, aplicada).
- **«Así la ve el transportista»:** el Jefe de Transporte (y quien ve las rutas) abre la ruta tal como le aparece al conductor, solo lectura, y ve qué le falta a cada parada (migración 0063).
- **Hoja para DIGEMID:** es la misma ruta sin lo que no se entregó (no entregado o rechazado), renumerada. El registro interno sigue completo, con los motivos.
- **Aviso por correo (Resend)** a quien factura cuando la guía de un pedido queda lista: `RESEND_API_KEY`, `RESEND_FROM` y `AVISO_FACTURACION_CORREOS`. Apagado hasta configurarlas.
- **Inspección de la unidad:** se imprime para firma manuscrita al cerrar el mes (sin firma en pantalla).

## «Ya no sale», anulado / reprogramado y aviso a quien factura (12-nov-2026; migración 0064)

- **«Ya no sale»** (botón del Jefe en la orden ya pickeada): una sola acción con motivo. Cancela la pre-guía (su número pasa a «Números sin usar»), libera lo que nadie pickeó, deja lo pickeado «por devolver a su ubicación» (el auxiliar lo devuelve y otra persona lo verifica, el mismo camino de un cambio o cancelación desde Pedidos) y cancela la orden. Si el pedido sigue, vuelve a la bandeja para rehacer la orden; si se cancela, se avisa al Jefe de Transporte para que el área comercial lo cancele en Pedidos (el WMS no cancela nada en Pedidos). No sirve con guía registrada o enviada (se anula primero la guía), con bultos ya cargados ni con la ruta ya en camino.
- **«Dejar fuera de la salida»** pide el tipo: **anulado** (ya no sale) o **reprogramado** (sale otro día). La hoja de la ruta deja la fila marcada y la hoja para DIGEMID la deja fuera. Nada se borra.
- **Aviso por correo a quien factura:** al crearse la pre-guía («ya puede facturar», con productos y lotes) y al cancelarse («NO factures»).
- En lo que ve la gente no se usa «staging»: se dice «zona de despacho» o «a su ubicación».
