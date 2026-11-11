# Salidas · reunión del equipo (2026-11-10)

Orden pedido por Sebas (donde choque con el mensaje del piloto, manda este). Estado al 2026-11-10:

| # | Pieza | Estado |
|---|-------|--------|
| 1a | Guía y Nubefact: causa y arreglo | **Hecho en código** (modo por entorno + aviso de modo prueba). Causa en producción: `guia_modo = PANEL` (el WMS no envía a Nubefact) y falta `NUBEFACT_MODO` (cae en el simulador). Falta decisión: ver abajo |
| 1b | Ruteo: auxiliares, columna/filtro/orden «Distrito», vehículo de contingencia | Auxiliares (0052) y Distrito: **hechos**. Contingencia: pendiente |
| 1c | Orden de Salida: buscador por guía/orden, «Editar» | Pendiente |
| 1d | Etiqueta: dirección de destino | Pendiente |
| 1e | «Actualizar desde pedidos» (WMS_PEDIDOS_URL/SECRETO los carga Sebas) | Pendiente |
| 2 | Flujo con pre-guía (TTT1 reservado, aviso a Arlette, números sin usar) | Pendiente |
| 3 | Conformidad y bultos (tomar para conformidad) | Pendiente |
| 4 | Embalaje, etiquetas y carga (Lima 15 y 07; conteo de bultos) | Pendiente |
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
