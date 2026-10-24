# Guion de pruebas — bloque «Orden de Salida» (OS-1 a OS-7)

Para probar a mano en la vista previa (Preview) con datos de demostración. **Nada de esto toca una base real ni emite una guía ante SUNAT**: es una demostración que se reinicia sola, y la guía electrónica sale de un **simulador** de Nubefact.
Entra por `/wms/login`. Arriba de todas las pantallas hay un selector «Probar como» para cambiar de persona sin cerrar sesión.

> **Cómo leerlo.** Cada paso dice **con quién entrar**, **qué hacer** y **qué deberías ver**. Además, en cada orden y en cada ingreso hay un cuadro **«Dónde va y qué sigue»** que dice qué paso toca, **quién** lo hace y trae el botón directo: si en algún momento no sabes qué hacer, ese cuadro te lo dice. En **Inicio**, «Mis tareas» lista lo que le toca a la persona con la que entraste.

## Empieza aquí: cómo se inicia una salida
- **Lo más rápido para probar:** entra a **Salidas** («Órdenes de salida»). La demo ya trae **órdenes de ejemplo en cada etapa y de los tres tipos** (stock asignado, picking, conformidad, guía emitida, embalaje, carga, salida confirmada, con falta de stock, cancelada); cada una lleva la etiqueta «Ejemplo». La tabla de la **sección 13** dice qué orden abrir, con quién entrar y qué probar.
- **Una orden nace de tres maneras** (detalle en la sección 9): (1) en **Pedidos por despachar**, botón «Crear orden de salida» sobre un pedido que llegó de Pedidos; (2) con **Nueva Orden de Salida** (A: venta manual con n.º de pedido; B: por cuenta de un cliente de almacenamiento; C: muestra o devolución al proveedor); (3) al planificar una ruta con un pedido que aún no tiene orden.
- **Si la lista de Salidas está vacía** dice «Las salidas nacen de los pedidos. Trae los pedidos nuevos o crea una salida manual», con los dos botones.
- **Dónde está cada cosa:** el menú lateral sigue el orden del trabajo (sección 11). Cada orden dice **qué sigue y quién lo hace** (cuadro «Dónde va y qué sigue»); en Inicio, «Mis tareas».
- **Después de iniciar,** las tres clases siguen el flujo normal: picking, conformidad, bultos, guía (A y C) y ruta de Logisalud o, en la B, entrega al transportista del cliente (sección 12). Cuando falta stock o el pedido cambia, ver la sección 10.

## 0. Primera vez (cualquier persona)
1. Entra a **Inicio**. Se abre solo un **recorrido de 5 pantallas** (Siguiente / Anterior / Cerrar). Ciérralo: al recargar **no** vuelve a abrirse solo, pero el botón **«Ver el recorrido»** lo abre cuando quieras.
2. Entra como **Auditoría (solo lectura)**: **Mis tareas** dice «No tienes tareas pendientes».

## 1. Orden de Salida impresa y conformada (Jefe de Transporte → auxiliar → Sandra)
1. **Jefe de Transporte** → Inicio → **Mis tareas**: aparece la orden del pedido *PED-DEMO-101* (número **OS-AAAA-NNNNN**) con el botón del paso que toca. **Salidas** (en PC es una **tabla**) tiene la columna **«Qué sigue y quién lo hace»**.
2. Abre la orden. Elige quién hace el picking (un auxiliar) y **genera la orden**: el número impreso es el de la Orden de Salida.
3. **Auxiliar** → **Picking** → marca cada línea. **Hoja para imprimir** en PDF.
4. **Asistente de DT («Sandra»)** → **Conformidad**: quien pickeó **no** puede dar la conformidad de su propia línea. Marca **Conforme** y **cuenta los bultos** (un pedido a Lima conserva esos bultos y no se embala; uno a provincia sí se embala).
   - Después de cada acción sale un mensaje que dice **qué pasó y qué sigue**.

## 2. Guía electrónica con Nubefact (Jefe de Transporte)
1. **Rutas** → asigna el pedido a una ruta con vehículo y conductor (la ruta va **antes** que la guía; la guía toma de ahí placa, conductor y fecha).
2. **Salidas** → la orden → **Emitir guía**. Verás el aviso **«Simulador: la guía no existe ante SUNAT»**, los datos que toma sola (cliente, dirección, lotes con vencimiento, bultos) y solo confirmas **fecha de inicio del traslado** y **peso bruto** (12 kg por defecto; la licencia solo si el conductor no la tiene guardada).
3. **Emitir guía**: Nubefact recibe la guía (paso 1) y el WMS consulta enseguida si «SUNAT» la aceptó (paso 2). Verás el número **TTT1-NNNNNNNN**, «Aceptada por SUNAT», el **PDF** del simulador y el aviso a **Pedidos** (número de guía y líneas conformadas con lote y vencimiento).
4. Si SUNAT todavía no responde, la guía queda **«en espera»** y aparece el botón **«Consultar estado en SUNAT»**; mientras no la acepte no hay PDF ni se avisa a Pedidos.
5. Pedido a **cliente de almacenamiento (tipo B)**: el WMS **no** emite guía; se **registra la GRE** que trae el cliente.

## 3. Anular una guía — caso 2 con nueva emisión (Jefe de Transporte)
1. En la orden con guía → **Anular la guía** → elige **«Me equivoqué en el contenido»** (caso 2) y cuenta el motivo. Antes de confirmar lee **«Qué pasa después»**.
2. Resultado: la guía queda **Anulada** (no se borra), la **conformidad se reabre**, el stock vuelve de Despacho a su ubicación (con movimientos vinculados en el Kardex), **Pedidos recibe el aviso** y el WMS **no toca la factura** (Contabilidad decide si se anula o hay nota de crédito). La baja ante SUNAT queda **marcada como pendiente** para hacerla a mano.
3. **Sandra** da otra vez la conformidad y el **Jefe de Transporte emite la guía nueva**.
4. Los casos **1** (datos del traslado: la orden no cambia) y **3** (la guía ya salió: no se anula desde el WMS, se corrige con un retorno y una nueva orden) están en el mismo cuadro.

## 4. Embalaje, carga y salida (auxiliar y Jefe de Transporte)
Igual que en el guion del bloque A (`guion-de-pruebas-bloque-a.md`, pasos 6 y 7): **Embalaje** → bultos con QR → **Carga de unidad** (checklist, escaneo, conciliación) → **Liberar la unidad** → **Confirmar la salida** (ahí recién baja el stock; míralo en **Kardex**).
- **LS-FR.43.03** (ruta): el formato lleva el **usuario** (Jefe de Transporte), las **cajas = bultos**, la **temperatura** y la **hora real de salida**; en la ruta puedes **imprimir la copia**, **subir el escaneo firmado** (cambiarlo pide motivo y conserva el anterior) y **cerrar la ruta** adjuntando el archivo del data logger.

## 5. Devolución con acta al 100 % (Retornos)
1. **Jefe de Transporte** (o Almacén, Sandra, Katia) → **Retornos** → elige una Orden de Salida que ya salió → motivo, factura o boleta y unidades por lote (nunca más de lo que salió).
2. Nace una **devolución por autorizar**. **Sandra o Katia** la autorizan.
3. **Auxiliar** recibe al **100 %** → el acta organoléptica decide el destino (Aprobados, o Bajas/Rechazados). Mira el **cuadro «Dónde va»** del ingreso.
4. **Liberación (LS-POE.04.05)**: en el acta, **observación** reversible (el producto sigue en Cuarentena) y, en productos de clientes, el **dictamen del DT del cliente** (adjunto, cantidades, confirmación en dos pasos).
5. **Muestreo (LS-TB.02.02)**: **Calidad → Muestreo**: la tabla como parámetro con vigencia y los productos con antecedentes de calidad.

## 6. Un lote en Reserva (Jefe de Transporte o Dirección Técnica)
1. **Salidas** → la orden → toca un lote → **Poner en Reserva** con motivo (el lote **sigue Aprobado**, solo no se asigna).
2. Las asignaciones afectadas vuelven a asignarse; la Reserva se quita con otro botón y **queda la historia**.

## 7. Bajas y vencidos (Katia / Jefe de Almacén)
1. En **Alertas**, un lote **vencido** lleva directo a **dar de baja**. **Bajas** → **Nueva solicitud**: elige el stock, el motivo y su **sustento** (sin sustento no hay baja).
2. **Dirección Técnica autoriza** → se genera la **Orden de Baja LS-FR.56.01** (PDF) y el stock pasa a Bajas/Rechazados. Anular una orden anula el documento (se reemite).
3. **Lo vencido no sale por ninguna salida**. La **devolución a proveedor** es una salida solo de Logissa, con lote indicado y antes de vencer. La **destrucción** de un cliente sale solo desde Bajas.

## 8. Carga inicial (Administración y Dirección Técnica)
**Carga inicial**: cada fila trae su estado de Odoo (Aprobado, Cuarentena o Bajas), con **lote y vencimiento obligatorios**; un Aprobado exige registro sanitario vigente. Administración sube y revisa; **Dirección Técnica confirma una sola vez**. El **Kardex** y la historia del lote muestran el recorrido «paso 1 de 3».

## Lo que NO está (a propósito)
- **Nada se emite en producción.** El entorno de pruebas de Nubefact y producción siguen sin probarse hasta que lo apruebes.
- **No hay conexión real con Pedidos**: los avisos van a una bandeja y se envían cuando Pedidos tenga su receptor (es requisito de producción, D-80).
- La **baja ante SUNAT** de una guía no la hace el WMS: según Nubefact solo se hace desde el portal de SUNAT con Clave SOL; las reglas (plazo, después de iniciado el traslado) están **pendientes** de Contabilidad.
- Pendientes de Katia y Contabilidad: ver `decisiones-pendientes.md` (política de canje, datos del formato LS-FR.56.01, formato del data logger, serie y último número de guía, licencias y DNI de conductores).

## 9. Cómo iniciar cada tipo de salida (SA-2)
Entra como **Jefe de Transporte** (demo) salvo que se diga otro.
1. **Desde la bandeja.** `Pedidos`: lee «Cómo se inicia una orden de salida». Abre PED-DEMO-102 y pulsa **Crear orden de salida**: aparece el mensaje con el número de la orden y qué sigue; el pedido pasa a «Con salida». Pulsa **Crear las órdenes de todos los pedidos por planificar**: PED-DEMO-103 no se crea y dice por qué (producto que el WMS no conoce).
2. **Tipo A (venta manual).** `Salidas` → **Nueva Orden de Salida** → Tipo A. Escribe un N.° de pedido (por ejemplo PED-DEMO-104), RUC de 11 números, razón social, dirección y ubigeo de 6 números; busca un producto por nombre o por código de barras y escribe la cantidad: ves la propuesta por vencimiento y puedes preferir otro lote. Crea la orden: queda «Manual» y «Por conciliar con Pedidos». Repite el mismo número: avisa al instante con enlace a esa orden. Luego en `Pedidos` pulsa **Actualizar desde Pedidos**: llega PED-DEMO-104 y se une a la orden manual (no se crea otra; hay un aviso). La orden toma lo que dice el pedido (SA-3): su línea se quita y entra la del pedido, que pide 250.000 unidades y no hay, así que la orden queda en «Sin stock» con el vendedor (Rosa Paredes) como responsable y el aviso para copiarle.
3. **Tipo B (por cuenta de un cliente).** Entra como Jefe de Almacén. Tipo B → elige Diphasac, escribe el N.° de la guía (T001-00001234) y adjunta un PDF. En la tabla elige un producto, escribe un lote que no existe (error al instante), luego un lote de Diphasac (sirve, completa el vencimiento) y un motivo. Crea: en el detalle ves «creada por … en nombre de DIPHASAC» y el enlace al PDF de la guía; el paso siguiente es registrar la GRE del cliente. Prueba también un lote de otro propietario, más cantidad que la disponible y destrucción de algo que no está en Bajas.
4. **Tipo C (sin venta).** Entra como «Autoriza salidas sin venta»: solo ve el tipo C y puede crear la muestra. El Jefe de Almacén ve la muestra apagada y puede crear la devolución al proveedor (solo lotes que no vencieron).
5. **Cancelar.** En una orden manual o creada desde la bandeja, sin picking: **Cancelar la orden** con motivo (para un número de pedido mal escrito).
Las órdenes manuales ya tienen su despacho (ver la sección 12); sigue sin existir el picking desde Bajas (D-122).

## 10. Cuando falta stock, y cuando el pedido cambia o se cancela (SA-3)
En la demostración, entra como **Jefe de Transporte**. Los controles «Probar como si fueras Pedidos» están en el detalle de cada pedido de **Pedidos** (solo en la demostración).
1. **Falta de stock.** En Pedidos pulsa «Actualizar desde Pedidos». En Rutas crea una ruta (fecha de hoy, camioneta BKW-757, conductor Luis Quispe) y agrega **PED-DEMO-104** (pide 250.000: no hay). Abre su orden en Salidas. Debe verse: la etapa «Sin stock suficiente»; en «Dónde va y qué sigue»: **«Sigue: el vendedor Rosa Paredes decide con el cliente si se quita lo que falta o se cancela el pedido»** y «Lo hace: Vendedor Rosa Paredes»; el cuadro **«Falta stock»** con el motivo por línea y cantidades (sin stock / en Cuarentena / en Reserva / con vencimiento menor a 60 días) y la frase de que solo hay dos caminos y se deciden en Pedidos. **No hay ningún botón para cambiar cantidades** ni para generar el picking.
2. **Copiar aviso para el vendedor.** Pulsa «Copiar aviso para el vendedor» (en la orden y en el detalle del pedido en Pedidos): el botón dice **«Copiado»**. Pega en un chat: trae pedido, cliente, qué falta, por qué con cantidades y las dos decisiones (sin RUC ni dirección).
3. **El vendedor reduce.** En el pedido pulsa «Reducir una línea» (reduce a lo que hay): la orden se actualiza sola, ya no falta stock, la etapa pasa a «Stock asignado», aparece la alerta «El pedido … cambió: se redujo … Ya no falta stock: la orden sigue su flujo.». Prueba también «Agregar una línea» y «Registrar la factura»: la orden muestra **«Factura: facturada F001-000NN»** y no hay dónde digitarla.
4. **Picking iniciado y pedido cancelado.** Con la orden de 104 asignada: genera el picking, pickea como **auxiliar**, da la conformidad como **asistente DT** (otra persona). En Pedidos pulsa «Cancelar el pedido». La orden queda en **«Por devolver lo picado»** (no se cierra), con «Sigue: el auxiliar devuelve lo picado a su ubicación y otra persona lo verifica». Como **auxiliar**: «Ya devolví lo picado» (se crea el movimiento interno Despacho → ubicación). Como **Jefe de Almacén** (otra persona): «Verifico que volvió a su ubicación». La orden pasa a **Cancelada** y en Pedidos el pedido queda **«Cancelado en Pedidos»** con su motivo. Quien devolvió no puede verificar.
5. **Lo que se guarda.** Cada faltante y cada decisión del vendedor quedan en `wms.quiebres_stock` (vista `v_quiebres_stock`) para el reporte futuro de quiebres; el reporte aún no está.
**Lo que sigue pendiente:** la conexión real con Pedidos (hoy el aviso se copia a mano, D-80) y que Pedidos facture solo con `GUIA_EMITIDA` (solo documentado, D-49).

## 11. Por dónde empezar: el menú
El menú de la izquierda (en el teléfono, la barra de abajo y el botón **Más**) sigue el orden del trabajo: **Inicio, Entradas, Almacén, Salidas, Despacho y transporte, Control**. Cada persona ve solo lo que usa. Usa «Probar como» (barra negra de arriba) para cambiar de rol.
1. **Jefe de Transporte** (PC): en **Salidas** hay cuatro opciones, en este orden: **Pedidos por despachar** (los pedidos que llegan de Pedidos), **Órdenes de salida** (las salidas ya creadas), **Nueva salida** (verde, para crear una salida a mano) y **Rutas**. Entra a cada una. *Mientras la pantalla de Nueva salida no esté integrada en tu Preview, ese enlace puede dar «página no encontrada»: es esperado.*
2. Debajo, **Despacho y transporte** trae los pasos de piso con verbo: **Preparar pedidos (picking)**, **Embalar**, **Cargar la unidad** (y **Dar conformidad** para quien la da, como Sandra).
3. **Almacén** y **Control** arrancan cerrados para el Jefe de Transporte: toca el encabezado para abrirlos (se recuerda). Si Control está cerrado y hay alertas, el encabezado muestra cuántas.
4. **Auxiliar de almacén**: no ve Pedidos por despachar, Nueva salida ni Rutas; ve Órdenes de salida (solo para mirar) y sus pasos: Preparar pedidos, Embalar, Cargar la unidad.
5. **Auditoría**: solo lectura (pedidos, órdenes, rutas, auditoría), sin Nueva salida ni pasos de piso. **Autoriza salidas sin venta**: ve Nueva salida y lo básico, sin la bandeja.
6. **Teléfono (390 px)**: la barra de abajo muestra lo principal de tu rol (el Jefe de Transporte: Inicio, Órdenes y Rutas; el Auxiliar: Inicio, Picking y Almacén), más Buscar y **Más**. «Más» agrupa por las mismas secciones, con encabezados que se abren y cierran.
7. **Tablet (1024 px)**: solo íconos, con una raya entre secciones; deja el cursor sobre un ícono para ver su nombre.
Evidencia: `docs/wms/ux-menu-lateral.md` (antes y después, con capturas por rol).

## 12. Despachar órdenes manuales (A, B y C) (SA-6)
Antes de empezar crea las órdenes de la sección 9: una **venta manual (A)** con N.° de pedido, una **muestra (C)** y una **orden por cuenta de un cliente (B)**. Las tres siguen el flujo normal (picking, conformidad, documentos, embalaje); lo que cambia es cómo salen.
1. **C pide a quién va.** Entra como «Autoriza salidas sin venta» → Nueva salida → Muestra. Antes de la tabla aparece «¿A quién va la muestra?» (nombre, RUC de 11 números, dirección y ubigeo de 6). Si lo dejas vacío, dice qué falta. En la devolución al proveedor pregunta por el proveedor.
2. **Planificar la ruta (A y C).** Entra como Jefe de Transporte. En la orden, «Dónde va y qué sigue» muestra el paso **«Ruta planificada»** antes de la guía. Ve a **Rutas → Nueva ruta**, elige vehículo y conductor y baja hasta **«Órdenes manuales por despachar»**: están la venta A (con su pedido) y la muestra C; la orden B **no** está. Agrégalas: salen como paradas con la etiqueta «Orden manual». Si la ruta es de hoy y las órdenes se crearon hoy, pide la **excepción de corte con motivo**. Guarda el plan y confirma la ruta (nace su LS-FR.43.03).
3. **Una orden, una ruta.** Abre otra ruta: las órdenes ya asignadas aparecen bloqueadas («Ya está en RUT-…»).
4. **Quitar la parada no cancela.** En una ruta, quita la parada de una orden y guarda: la orden sigue en «Stock asignado», sin cancelarse, y vuelve a ofrecerse. Cancelar la ruta tampoco cancela las órdenes.
5. **Guía, carga y salida (A y C).** Haz picking, conformidad y carga los COA que falten (como en las secciones 3 a 6). En la orden, el panel de la guía muestra la ruta, la placa, el conductor y la fecha de la ruta y el cliente o destinatario; emite la guía (simulador). Ve a **Carga**, abre la ruta: la conciliación lista las dos paradas (la venta por su N.° de pedido y la muestra por su N.° de orden); checklist, escaneo o «marcar cargado», **liberar la unidad** y **confirmar la salida**: el stock baja solo ahí. El PDF de LS-FR.43.03 de la ruta lista las dos paradas con su cliente o destinatario y sus bultos.
6. **Si el pedido de A llega después.** Con una venta manual ya en una ruta, en `Pedidos` pulsa «Actualizar desde Pedidos» cuando llegue su número: se une a la orden, la parada de la ruta sigue y ahora es también del pedido (la guía usa los datos del pedido).
7. **B: entrega al transportista del cliente.** La orden B no lleva ruta ni guía del WMS. Haz picking, conformidad, registra la **GRE del cliente**, completa el paquete y el embalaje. Cuando está «Lista para carga», el siguiente paso es **«Entregar la mercadería al transportista del cliente»** (lo hacen el Jefe de Transporte o el Jefe de Almacén). En el bloque «Entrega al transportista del cliente» escribe el transportista (o quién recoge), la placa o el DNI (8 números), la hora y quién entrega por el almacén; adjunta, si quieres, la foto o el PDF del cargo. Al registrar, la orden pasa a **«Entregada al transportista»**, la salida se confirma y el stock baja. Repetirlo no baja el stock dos veces. El auxiliar no ve el formulario.
8. **Toda orden A, B o C muestra siempre qué sigue y quién lo hace**, desde el stock asignado hasta «Terminada».
Pendiente de Sebas: si B puede ir en una ruta propia de Logisalud cuando un cliente lo pide (hoy no; D-135).

## 13. Órdenes de ejemplo: recorre cualquier etapa sin crearla

En la demostración, **Órdenes de salida** ya trae 24 órdenes de ejemplo (con la etiqueta «Ejemplo») además de PED-DEMO-101. Entra con la persona indicada y prueba lo que dice la última columna. Las órdenes de tipo B y C no tienen número de pedido: búscalas por su tipo en la lista. Para ver la pantalla vacía real o la suite de siempre se apagan con `WMS_DEMO_EJEMPLOS=0` (o `vacio`). La lista completa y qué se prueba en cada una está en `apps/wms/domain/ejemplos.ts`.

| Orden de ejemplo | Etapa | Con quién entrar | Qué probar |
|---|---|---|---|
| PED-DEMO-201 | Stock asignado | Jefe de Transporte | Designar a quien pica y generar la hoja de picking; cambiar un lote. |
| PED-DEMO-202 | En picking | Auxiliar | Seguir el picking de la hoja (una línea ya está pickeada). |
| PED-DEMO-203 | Pendiente de conformidad | Asistente de Dirección Técnica | Dar la conformidad y contar bultos; quien pickeó no puede darla. |
| PED-DEMO-204 | Conforme | Jefe de Transporte | Armar una ruta con este pedido y emitir la guía (simulador). |
| PED-DEMO-205 | Documentación completa (guía emitida) | Auxiliar | Ver la guía y su PDF simulado; embalar en bultos. |
| PED-DEMO-206 | Embalada, falta la documentación | Jefe de Transporte | Reabrir el embalaje con motivo; completar guía y documentos. |
| PED-DEMO-207 | Lista para carga | Auxiliar | Escanear bultos, checklist del vehículo y liberar la unidad. |
| PED-DEMO-208 | Salida confirmada | Jefe de Transporte | Ver el stock ya descontado y el LS-FR.43.03; crear un retorno. |
| PED-DEMO-209 | Sin stock suficiente | Jefe de Transporte | Leer por qué falta y copiar el aviso para el vendedor. |
| PED-DEMO-210 | Cancelada | Jefe de Transporte | Ver la cancelación con motivo y el stock liberado. |
| PED-DEMO-211 | Cancelada porque Pedidos canceló el pedido | Jefe de Transporte | En Pedidos por despachar figura «Cancelado en Pedidos». |
| PED-DEMO-212 | Por devolver lo picado (el pedido cambió) | Auxiliar y otra persona | Devolver lo picado con un movimiento verificado. |
| PED-DEMO-221 | Manual por conciliar, stock asignado | Jefe de Transporte | Si el pedido llega por la bandeja se une a esta orden sin duplicarla. |
| PED-DEMO-222 | Manual por conciliar, conforme | Jefe de Transporte | Planificar su ruta (parada por orden) y emitir la guía. |
| PED-DEMO-223 | Manual por conciliar, lista para carga | Auxiliar / Jefe de Transporte | Cargar la unidad de su ruta. |
| PED-DEMO-224 | Manual por conciliar, salida confirmada | Jefe de Transporte | Ver la salida terminada de una venta manual. |
| B · Diphasac (stock asignado) | Por cuenta de un cliente, stock asignado | Jefe de Transporte o Jefe de Almacén | Solo su stock, lote de su guía, «creada por … en nombre de …». |
| B · AJR (conforme) | Por cuenta de un cliente, GRE registrada | Jefe de Transporte | GRE del cliente registrada; no hay guía del WMS. |
| B · Triamed (lista) | Lista para entregar | Jefe de Transporte o Jefe de Almacén | Registrar la entrega al transportista del cliente. |
| B · Medic Pharma (entregada) | Entregada al transportista | Jefe de Transporte o Jefe de Almacén | Ver la entrega ya registrada y el stock descontado. |
| C · Muestra (conforme) | Muestra de Logissa, conforme | Autoriza salidas sin venta / Jefe de Transporte | Planificar su ruta y emitir la guía con motivo «otros». |
| C · Devolución al proveedor (conforme) | Devolución, conforme | Jefe de Transporte | Lote indicado y antes de su vencimiento; guía de devolución. |
| C · Muestra con ruta | Lista para carga | Auxiliar | Cargar la unidad de su ruta. |
| C · Devolución que ya salió | Salida confirmada | Jefe de Transporte | Ver la salida confirmada de una devolución al proveedor. |

## 14. Conductor real y «conductor en documentos» (SB-A)
La ruta guarda siempre al conductor real (Hans o Michele). Mientras exista el parámetro temporal, la guía electrónica y el LS-FR.43.03 llevan a Michele.
1. **Ver quién figura.** Entra como Jefe de Transporte → Rutas → Personal y vehículos. Arriba, «Conductor que figura en los documentos» dice quién sale en la guía y en el formato, y que es temporal.
2. **Cambiarlo.** Elige otra persona, escribe el motivo y guarda. Sin motivo no deja. Los documentos nuevos llevan a esa persona; los ya emitidos no cambian. «El conductor real de cada ruta» deja los documentos con quien maneja.
3. **Verlo en la guía.** En una orden con ruta, antes de emitir, el panel dice «La guía lleva a … El conductor real de la ruta es …». La guía sale con el carné de extranjería de Michele (tipo 4 de SUNAT).
4. **Verlo en el LS-FR.43.03.** En la ruta, el panel del formato dice lo mismo, y el PDF lleva a quien figura.
5. **Auditoría.** Cada guía registrada y cada impresión del formato dejan el evento «conductor en documento» con el conductor real y el que figuró.
6. **Documento pendiente.** En cada conductor, «Documento y licencia»: Hans aparece como «Documento pendiente». Prueba un DNI de menos de 8 números: la pantalla lo explica.
7. **Sin vehículo calificado.** En Planificar ruta, cualquier vehículo sirve para cualquier cliente: ya no sale «exige vehículo calificado».
8. Solo el Jefe de Transporte cambia estos datos; los demás roles los ven.
