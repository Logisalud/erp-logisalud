# Guion de pruebas — bloque «Orden de Salida» (OS-1 a OS-7)

Para probar a mano en la vista previa (Preview) con datos de demostración. **Nada de esto toca una base real ni emite una guía ante SUNAT**: es una demostración que se reinicia sola, y la guía electrónica sale de un **simulador** de Nubefact.
Entra por `/wms/login`. Arriba de todas las pantallas hay un selector «Probar como» para cambiar de persona sin cerrar sesión.

> **Cómo leerlo.** Cada paso dice **con quién entrar**, **qué hacer** y **qué deberías ver**. Además, en cada orden y en cada ingreso hay un cuadro **«Dónde va y qué sigue»** que dice qué paso toca, **quién** lo hace y trae el botón directo: si en algún momento no sabes qué hacer, ese cuadro te lo dice. En **Inicio**, «Mis tareas» lista lo que le toca a la persona con la que entraste.

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

## 9. Cómo iniciar cada tipo de salida (SA-2)
Entra como **Jefe de Transporte** (demo) salvo que se diga otro.
1. **Desde la bandeja.** `Pedidos`: lee «Cómo se inicia una orden de salida». Abre PED-DEMO-102 y pulsa **Crear orden de salida**: aparece el mensaje con el número de la orden y qué sigue; el pedido pasa a «Con salida». Pulsa **Crear las órdenes de todos los pedidos por planificar**: PED-DEMO-103 no se crea y dice por qué (producto que el WMS no conoce).
2. **Tipo A (venta manual).** `Salidas` → **Nueva Orden de Salida** → Tipo A. Escribe un N.° de pedido (por ejemplo PED-DEMO-104), RUC de 11 números, razón social, dirección y ubigeo de 6 números; busca un producto por nombre o por código de barras y escribe la cantidad: ves la propuesta por vencimiento y puedes preferir otro lote. Crea la orden: queda «Manual» y «Por conciliar con Pedidos». Repite el mismo número: avisa al instante con enlace a esa orden. Luego en `Pedidos` pulsa **Actualizar desde Pedidos**: llega PED-DEMO-104 y se une a la orden manual (no se crea otra; hay un aviso).
3. **Tipo B (por cuenta de un cliente).** Entra como Jefe de Almacén. Tipo B → elige Diphasac, escribe el N.° de la guía (T001-00001234) y adjunta un PDF. En la tabla elige un producto, escribe un lote que no existe (error al instante), luego un lote de Diphasac (sirve, completa el vencimiento) y un motivo. Crea: en el detalle ves «creada por … en nombre de DIPHASAC» y el enlace al PDF de la guía; el paso siguiente es registrar la GRE del cliente. Prueba también un lote de otro propietario, más cantidad que la disponible y destrucción de algo que no está en Bajas.
4. **Tipo C (sin venta).** Entra como «Autoriza salidas sin venta»: solo ve el tipo C y puede crear la muestra. El Jefe de Almacén ve la muestra apagada y puede crear la devolución al proveedor (solo lotes que no vencieron).
5. **Cancelar.** En una orden manual o creada desde la bandeja, sin picking: **Cancelar la orden** con motivo (para un número de pedido mal escrito).
No hay todavía ruta para las órdenes manuales ni picking desde Bajas (D-122).
