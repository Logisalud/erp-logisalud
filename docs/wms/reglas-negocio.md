# Reglas de negocio WMS — CERRADAS

> **Decisión D-31 (2026-10-08, ratificada por Sebas):** *«Devolución no es un estado»* queda **reemplazada**. Existe el estado sanitario `DEVOLUCIONES` («Devoluciones»): una devolución nace en el Área de Devoluciones en ese estado, nunca pasa por Cuarentena y su Acta Organoléptica la lleva a Aprobado o a Bajas/Rechazados. Lo que se conserva de la regla antigua: el **origen del ingreso es un dato separado del estado** (`partidas.origen`, `ingresos.tipo`) y los reportes pueden filtrar por origen. Cualquier texto que diga lo contrario es histórico.
Fuentes: docs/wms/procesos/ (hoja 03_TO-BE), docs/wms/formatos/, docs/wms/layouts/, docs/wms/topologia.md. Si algo difiere, avisa; no elijas.

## Alcance actual
Solo entradas y movimientos internos. Las salidas (preparación, despacho, transporte) se construyen después de su mapeo; el modelo debe admitirlas sin rehacerse.

## Transición
- El WMS opera en paralelo a Odoo hasta tener salidas; recién entonces lo reemplaza.
- Carga inicial: exportación de Odoo tras el inventario general (dato real).
- En Odoo, LWDIP = almacén DHP (Diphasac).

## Roles
| Persona | Rol |
|---|---|
| Katia Zapata | Dirección Técnica: decide estados, valida productos, aprueba ajustes |
| Sandra López | Asistente DT: evaluación organoléptica, alta de productos, cierre documental |
| Charlie Chancco | Jefe de Almacén (así se llama el cargo en la interfaz y en el acta, como en LS-FR.03.05) |
| Roberto, Jasury | Reemplazos de Charlie (autorizan movimientos) |
| Christians, Jose Carlos, Alberto, Milka | Auxiliares de almacén |
El equipo usa teléfonos personales.

## Propietarios del stock
- Logissa: stock propio, comprado.
- Diphasac, Triamed, Medic Pharma Lab, AJR Labs: clientes que guardan su mercadería; no la comercializamos.
- Diphasac es también proveedor.
- Todo saldo tiene propietario.
- Posiciones de almacenamiento: un solo propietario fijo (ver topologia.md).
- Áreas compartidas (Recepción, Cuarentena, Embalaje, Despacho): una posición puede tener varios propietarios a la vez.
- La asignación de posiciones a un propietario tiene vigencia (desde/hasta) y referencia al contrato o adenda que la sustenta. Un cambio de asignación nunca mueve stock por sí solo.
- Diphasac → Logissa: solo por conducto regular (compra local con movimiento físico). El inventario nuevo nace en Cuarentena (supuesto, pendiente de Katia).

## Maestro de productos
- Maestro único para todo propietario; incluye productos que no compramos.
- Registro sanitario y su vencimiento son atributos del producto.
- **Datos regulatorios (D-37, 2026-10-08):** solo Katia (Dirección Técnica) y Sandra (asistente) los crean y editan, con la **misma autoridad y sin validación adicional**:
  registro sanitario, vencimiento del registro, forma farmacéutica, concentración, fabricante y condición de almacenamiento. Se aplica en la base de datos
  (RLS + `wms.editar_regulatorio`/`crear_producto`; sin DML directo). Cada cambio guarda campo, valor anterior, valor nuevo, usuario, fecha y **motivo obligatorio**.
  Un lote solo se aprueba si el producto tiene registro sanitario y vencimiento cargados y vigentes. Las actas firmadas conservan los datos como estaban al firmarse.
  Presentación y principio activo viven en `catalogo.productos` (Compras): ver `regulatorio-duplicidad.md` (decisión pendiente).
- *(Reemplazado por D-37: «Sandra crea el producto; Katia lo valida».)*
- No hay productos controlados.

## Fuentes de verdad — un dato se escribe una sola vez
- **Compras:** OC, proveedor, precio y condiciones, factura (número, archivo y cantidad facturada) y toda la consecuencia económica (entrega parcial, nota de crédito, excedente sin facturar, obligación, saldo y cierre de la OC). La lógica OC vs Factura vs Físico vive solo en Compras; el WMS no la copia.
- **WMS:** la Solicitud de Ingreso (lote, vencimiento y cantidad que ingresará, con su historial), el Acta de Recepción, la **cantidad física confirmada (se captura una sola vez, aquí)**, la ubicación, el inventario, el estado sanitario, los movimientos y la trazabilidad.
- **Dirección Técnica:** decisiones sanitarias.
- **Pedidos:** demanda.
- Hoy la cantidad física confirmada pasa a Compras **a mano** (el WMS la resalta para copiarla); la automatización llega después. El WMS nunca escribe en Compras.

## Flujo de ingreso (addendum del 2026-10-08)
La recepción no empieza cuando llega el camión: empieza con la **Solicitud de Ingreso** (LS-FR.05.05).
1. **Solicitud de Ingreso** = mercadería **programada / esperada**: usuario o propietario, proveedor o cliente, tipo, fecha prevista, motivo, producto, registro sanitario, **lote, vencimiento, cantidad**, guía/DUA, observaciones. **No crea stock.** Se muestra como "Por llegar".
   - Compra local: nace de la OC (el sistema prellena proveedor, producto, presentación, saldo, propietario Logissa). Una línea de OC puede dividirse en varias líneas de solicitud, una por lote.
   - Mercadería de cliente: hoy la prepara Sandra o Katia con la guía del cliente; con el portal, el cliente la crea y Sandra o Katia la autorizan.
   - Numeración **SI-AAAA-NNNNN** (por año). Mantiene su número toda su vida.
2. **Llegada y verificación:** la recepción **verifica** lo declarado ("Esto es lo que esperamos. Confirma lo que encontramos"); no se vuelve a escribir lote y vencimiento. Si todo coincide: una confirmación. Si no coincide: se muestra la diferencia ("Esperábamos 50 y encontramos 45") y se **actualiza la Solicitud** antes de seguir.
3. **La Solicitud es editable hasta el cierre del ingreso, siempre con historial** (campo, antes, después, quién, cuándo, motivo). Se conserva la **solicitud inicial** (lo anunciado) y la **final** (lo autorizado). Cambiar un lote declarado por otro es un ajuste explícito con motivo, no un rechazo. Toda diferencia entre inicial y final avisa a Sandra y a Katia.
4. **Acta de Recepción** (LS-FR.03.05): se genera **prellenada desde la Solicitud final**. Agrega lo propio de la recepción: cantidad establecida y recibida, bultos, paletas, verificaciones, tipo de conteo, vehículo, temperatura, horarios, responsables y firmas. Si el conteo definitivo vuelve a diferir, no se cierra: se ajusta la Solicitud (con historial) y se regenera.
5. **Invariante de un ingreso cerrado:** solicitud final = cantidad aceptada = acta (recibida) = suma de lotes = inventario creado. No es la cantidad de la OC ni la de la factura.
6. **Seis cantidades que no se mezclan:** cantidad_oc, solicitud inicial, solicitud final, factura, física confirmada e inventario.
7. **Qué ocurre después:** compra y cliente → Cuarentena → Evaluación Organoléptica → Aprobado o Bajas/Rechazados. **Devolución → Área de Devoluciones (estado «Devoluciones») → Evaluación Organoléptica → Aprobado o Bajas/Rechazados; nunca pasa por Cuarentena.**
8. Si llegan más unidades que el saldo de la OC, el WMS registra lo físico y alerta (EXCEDE_OC) a Katia y a Compras; **no lo resuelve solo**.

## Tipos de ingreso
| Tipo | Se origina en | Documentos | Nace en |
|---|---|---|---|
| Compra local | Solicitud prellenada desde la OC | Guía y factura (la factura vive en Compras) | Cuarentena (A-6 a A-9) |
| Devolución | Solicitud con la guía de devolución | **Factura o boleta original (obligatoria)** + formulario de devolución | **Área de Devoluciones**, estado «Devoluciones» |
| Ingreso de cliente | Solicitud con la guía del cliente | Guía | Cuarentena (A-6 a A-9) |
- Importación y traslado: fuera de alcance (aún no se importa).
- Una OC puede tener **varias solicitudes** (entregas parciales); cada solicitud es un ingreso distinto.
- Unidad: la misma de Compras (unidades). Las cajas master no se cuentan.

## Recepción (REC-01, REC-02)
1. Recepción es un proceso, no un estado. Recepción (A-1 a A-5, A-M1) es tránsito: al confirmar, el inventario nace en Cuarentena (A-6 a A-9) —o, si es devolución, en el Área de Devoluciones—.
2. Vencimiento: se registra la **fecha completa** que muestra el producto físico. Solo si el producto mismo muestra únicamente mes y año, se usa el último día del mes (y se conserva el texto original).
3. Temperatura (rango 15–25 °C) en el Acta de Recepción. Fuera de rango: se recibe y se alerta a Katia.
4. Registro sanitario vencido: alerta inmediata a Katia; el lote no puede aprobarse hasta que ella resuelva.
5. Solicitud de Ingreso: ver "Flujo de ingreso".
6. Acta de Recepción (LS-FR.03.05):
   - Numeración I-AAAAMM-correlativo.
   - Se genera y firma en el sistema. Firman Jefe de Almacén, DT y responsable de conteo con su usuario logueado.
   - El transportista firma en pantalla y se registran su nombre, DNI y placa.
   - Firmada es inmutable: solo se anula con motivo y se emite otra vinculada (el número anulado no se reutiliza).
7. Datos propios de la recepción física (no vienen de la Solicitud): bultos, paletas, placa y marca del vehículo, temperatura, tipo de conteo, hora de inicio y fin, verificaciones del producto.

## Evaluación organoléptica y aprobación
- Acta de Evaluación Organoléptica (LS-FR.55.02): una por producto y lote, también en devoluciones. La llena Sandra; Katia decide y firma en el WMS.
- Muestra = techo(√unidades del lote) + 1. Vuelve completa a su caja: no descuenta stock.
- El acta firmada sustenta la decisión. No existe Acta de Liberación.
- Lo rechazado en Cuarentena nunca vuelve al proveedor.

## Estado sanitario (INV-03)
- Estados: Cuarentena, **Devoluciones** (solo devoluciones: espera su evaluación), Aprobado, Bajas/Rechazados.
- «Devoluciones» es el estado sanitario de lo devuelto mientras espera su evaluación (decisión de Sebas del 2026-10-08; el addendum pedía no crearlo y esa parte queda sustituida). Se mantienen separados origen, ubicación, flujo de calidad y estado sanitario; "no vendible" es todo lo que no está Aprobado.
- **Quién registra el cambio:** Katia, al firmar el Acta de Evaluación Organoléptica en el WMS, registra Aprobado o Bajas/Rechazados. Charlie (Jefe de Almacén) no ejecuta ese cambio; solo mueve físicamente (movimientos internos) cuando corresponde.
- Permitido:
  - Cuarentena → Aprobado
  - Cuarentena → Bajas/Rechazados
  - Devoluciones → Aprobado
  - Devoluciones → Bajas/Rechazados
  - Aprobado → Bajas/Rechazados (Katia + sustento)
- PROHIBIDO SIEMPRE: Aprobado → Cuarentena (y nada vuelve a Cuarentena ni a Devoluciones). Se valida en dominio y en base de datos.
- Estado, condición, ubicación, propietario y origen son datos distintos.
- VERDE/ÁMBAR: el modelo los soporta (solo con Aprobado); la interfaz se construye después.

## Zonas BPA y compatibilidad
Cada posición tiene tipo de área y propietario. El sistema bloquea combinaciones inválidas:
| Tipo de área | Estados admitidos |
|---|---|
| Recepción | Ninguno (tránsito) |
| Cuarentena (compartida) | Cuarentena |
| Devoluciones (por propietario) | Devoluciones, solo con origen devolución |
| Aprobados (por propietario) | Aprobado |
| Bajas/Rechazados (por propietario) | Bajas/Rechazados |
| Contramuestra (por propietario) | Pendiente (solo importación) |
| Embalaje, Despacho | Fuera de alcance |
- Salir de Cuarentena hacia un rack: solo si está Aprobado con acta organoléptica firmada, y a una posición del mismo propietario.
- Rechazado: solo hacia Bajas/Rechazados del mismo propietario.

## Movimientos internos (INV-02)
**Ajuste de Sebas (2026-10-09), reemplaza lo anterior: solo DOS personas y sin autorización en el sistema.**
- **Ejecutado por:** quien crea el movimiento en el sistema y mueve físicamente la mercadería. Es **la misma persona**.
- **Verificado por:** otro auxiliar, el Jefe de Almacén o su reemplazo. **Nunca quien ejecutó** (D-15, en dominio, funciones y restricciones de la base; la regla es por persona, no por rol: ni siendo el Jefe verifica lo suyo).
- **Se elimina la autorización previa del Jefe:** la indicación es verbal y no se registra en el sistema. El flujo es **ejecutar → verificar**.
- **Verificación línea por línea.** Las líneas conformes se confirman (en un solo movimiento del libro); una línea con diferencia queda abierta y la resuelve el Jefe o su reemplazo, **por separado**. No se «cuadra» una cantidad.
- **El stock cambia solo al verificar cada línea.** Desde que se ejecuta, las unidades quedan **reservadas** para que nadie más las mueva. Un movimiento abierto reserva sus unidades pero **no bloquea la ubicación**; solo un conteo la bloquea.
- **Disponible para mover** = saldo − unidades reservadas por movimientos abiertos (incluidas las líneas de la misma operación). **Nunca stock negativo:** no se puede mover más que lo disponible.
- **Una operación, varias líneas;** cada línea con su producto, lote, propietario, origen, destino y cantidad. Origen y destino **por defecto** (opcionales) en la cabecera para el caso común; cualquier línea puede cambiarse a cualquier origen o destino. Al elegir el lote se autocompletan vencimiento, propietario y estado.
- **Destinos permitidos:** solo posiciones del propietario de esa línea, más las áreas compartidas, y compatibles con su estado sanitario. Se valida al elegir (con mensaje humano) y otra vez en la base de datos, por línea.
- **Referencia:** cada movimiento tiene un correlativo **MI-AAAA-NNNNN** que se reinicia cada año; se ve en la lista, el detalle, la búsqueda universal y la historia del lote (el Kardex del formato Farmacil lleva solo entradas y salidas, no movimientos internos).
- Anula el movimiento quien lo ejecutó o el Jefe, solo mientras nadie verificó ninguna línea.
- Se guarda: origen, destino, producto, lote, propietario, cantidad, motivo, ejecutor y verificador.
- Corrección = movimiento inverso vinculado al original. Mover no cambia el estado sanitario.

## Inventarios cíclicos (INV-05)
- **Implementado (Batch 3, 0007):** el Jefe programa conteos por ubicación (3 por semana, parámetro `conteos_por_semana`). El contador **no ve** el saldo del sistema (ni lo puede leer por la API). Una ubicación en conteo **no se mueve** hasta cerrarlo. Si hay diferencia, la **segunda persona** cuenta, también a ciegas; si dos conteos coinciden entre sí, se registra la **causa** y el Jefe **propone** un ajuste que **autoriza Dirección Técnica** (distinta de quien propone) y deja su sustento y su fila en el Kardex; sin explicación, se **escala** con evidencia. El conteo se cierra con fecha, alcance, quién contó, diferencia, causa y acción.
- **Kardex:** solo entradas y salidas (ingresos, carga inicial, ajustes y sus reversas), con saldo corrido y saldo inicial al comienzo del rango; los movimientos internos y cambios de estado van en la historia completa del lote.
- **Carga inicial:** administración la sube (con vista previa fila por fila); **no se confirma sin la decisión de Dirección Técnica sobre el estado del stock inicial (D-09)**.
- 3 por semana, programados **por rotación** (primero lo que hace más tiempo no se cuenta); una ubicación no se repite dentro de la semana; la ubicación con movimientos por verificar no se puede contar todavía. Un **conteo extra por incidencia** exige decir la incidencia y no cuenta entre los 3. (Implementado en Batch 3b, 0009.)
- Primer conteo ciego.
- Reconteo por otra persona solo si hay diferencia.
- Posición en pausa durante el conteo.
- Causa registrada.
- Ajuste solo con aprobación de Katia, con antes, después, motivo y evidencia.

## Revisión diaria (INV-04)
Recorrido con 4 focos: orden, limpieza, ubicaciones y situaciones anormales. Solo se registran pendientes, con responsable.
- **Implementado (Batch 3b, 0009):** lo hace el Jefe de Almacén o su reemplazo, una por día. No mueve stock, no decide estados y no es una inspección de calidad: todo traslado se hace con un Movimiento (INV-02). El **responsable es obligatorio** y debe ser alguien del equipo. Un foco con pendientes abiertos no queda «sin problemas»; la revisión no se cierra con focos sin revisar. Los pendientes siguen visibles en las revisiones siguientes hasta que su responsable (o el Jefe) los resuelve y el Jefe los verifica. Un pendiente que puede afectar producto avisa a Dirección Técnica.

## Expediente (REC-03)
- La OC (o el N° de acta, si no hay compra) agrupa los documentos.
- El WMS enlaza, no duplica.
- Faltantes con responsable y estado. Sandra cierra.

## Parámetros acordados (2026-10-08)
- **D-29 Kardex:** el código del formato es el parámetro configurable `kardex_codigo_formato` = «LS-FR-KDX (provisional)»; el PDF lo muestra como provisional. Ya no bloquea el Batch 3.
- **D-30 Vencimientos:** umbral de alerta de 90 días, configurable, y alerta también para un lote **ya vencido**. En el Batch 3 el reporte de vencimientos incluye vencidos y por vencer con tramos configurables.
- **D-28b «Aprobado · por trasladar»:** plazo de 24 h configurable antes de alertar.
- **D-11 / D-12 / D-13:** firma electrónica con el usuario registrado; el formato de recepción lleva DNI del transportista y «Ingreso de cliente»; la numeración organoléptica es O-AAAAMM-NNNN.
- **D-36:** el dueño de la cantidad física es el WMS; la copia manual a Compras es temporal (`integracion-wms-compras.md`).

## Integridad
Ningún registro se oculta ni se borra. Toda corrección deja historia (usuario, fecha, motivo).

## Pendientes para Katia (no implementar hasta su respuesta)
1. **(Prioridad)** Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena (supuesto actual) o conserva Aprobado?
2. Destino físico y documental de lo rechazado en Cuarentena y de las devoluciones no conformes.
3. Bloqueo temporal (hold) de un lote Aprobado.
4. Documentos obligatorios por tipo de Baja/Rechazo.
5. Naturaleza de Contramuestra (solo importaciones).
6. Confirmar muestreo techo(√unidades) + 1.
7. Acondicionamiento en la ubicación "Calidad" de Odoo: formalizarlo (ÁMBAR) o eliminarlo. No se migra.
