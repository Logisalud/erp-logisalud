# Menú lateral: por dónde empezar (SA-4)

Pedido de Sebas (sección 4 del bloque «Salidas: cómo iniciar»): revisar con Impeccable el menú y la organización de todo lo construido, y cambiar **solo** lo que impide entender por dónde empezar. Que Salidas quede agrupada y clara, que las secciones sigan el orden del trabajo, que cada nombre diga qué se hace y que cada rol vea solo lo que usa. Decisiones: D-131, D-132 y D-133 (`decisiones-pendientes.md`).

**Capturas.** Antes: `docs/wms/screenshots/menu-antes/<rol>-<viewport>.png`. Después: `docs/wms/screenshots/menu-despues/<rol>-<viewport>.png`. Lado a lado, una imagen por rol: `docs/wms/screenshots/menu-comparacion/<rol>.png` (barra ancha 1280, tablet de íconos y hoja «Más» del teléfono; izquierda ANTES, derecha DESPUÉS). Roles: `jefe_transporte`, `jefe_almacen`, `auxiliar`, `asistente_dt` (Sandra), `direccion_tecnica` (Katia), `autoriza_salidas_sin_venta`, `auditoria_lectura`, `admin_wms`. Viewports: `desktop-1440x900`, `laptop-1280x800` (barra ancha), `tablet-1024x768` (íconos), `telefono-390x844` (barra inferior) y `telefono-mas-390x844` (hoja «Más»). Se generan con `apps/wms/scripts/capturas-menu.mjs`.

## 1. Diagnóstico: qué confundía

Auditoría hecha con la skill `impeccable` (crítica de jerarquía y arquitectura de información, más el detector automático sobre `shell.tsx` y `layout.tsx`, que no encontró fallas técnicas: el problema no era visual sino de organización). Revisadas todas las pantallas de `app/(app)/*`. Evidencia en `menu-antes/`.

| # | Qué confundía | Evidencia |
|---|---|---|
| 1 | **«Salidas» era un solo enlace perdido en medio de una lista plana.** La bandeja («Pedidos»), las rutas y las salidas estaban separadas por «Retornos» y «Movimientos»; nada decía que el trabajo empieza por los pedidos. «Nueva salida» no existía. | `menu-antes/jefe_transporte-laptop-1280x800.png`: el orden era Inicio, Almacén, Entradas, Retornos, Movimientos, Pedidos, Rutas, Salidas, Picking… |
| 2 | **Veinte o más enlaces sin un solo encabezado.** No había forma de saber qué es de entradas, de almacén o de salidas. | Todas las capturas de barra ancha. |
| 3 | **El menú se cortaba.** En 1280×800 el Jefe de Transporte tenía que desplazar la barra para llegar a Alertas, Calidad o Auditoría; en el teléfono, la hoja «Más» no tenía alto máximo y se salía de la pantalla. | `jefe_transporte-laptop-1280x800.png` (corta en «Conteos»), `auxiliar-telefono-mas-390x844.png` (la primera fila queda tapada). |
| 4 | **Nombres que no dicen qué se hace:** «Pedidos» (¿de compra?, ¿de clientes?), «Documentos» (en realidad son los documentos regulatorios: COA, registro sanitario, BPM), «Retornos», «Embalaje», «Carga de unidad», «Conformidad», «Picking». | Barra ancha de cualquier rol. |
| 5 | **Todos veían casi todo.** Un Auxiliar veía Calidad, Documentos, Expedientes, Retornos y las colas de pedidos que no puede usar; Auditoría veía Picking, Embalaje y Carga, que no puede operar; el rol «Autoriza salidas sin venta» veía 15 enlaces y ninguno era lo suyo. | `auxiliar-desktop-1440x900.png`, `auditoria_lectura-*`, `autoriza_salidas_sin_venta-*`. |
| 6 | **La barra del teléfono era igual para todos:** Inicio, Almacén y Entradas. Quien despacha (Jefe de Transporte) no tenía a un toque nada de salidas; el Auxiliar tampoco tenía Picking. | `jefe_transporte-telefono-390x844.png`. |
| 7 | **Tablet: íconos repetidos y sin separación.** «Pedidos» y «Carga de unidad» usaban el mismo camión; 22 íconos en fila sin raya alguna. | `jefe_transporte-tablet-1024x768.png`. |
| 8 | **Alertas sin presencia:** al fondo de la lista, con su insignia casi invisible en el teléfono (dentro de «Más»). | `auxiliar-telefono-mas-390x844.png`. |
| 9 | **El enlace activo se encendía por prefijo:** al estar en `/salidas/nueva` se marcarían a la vez «Salidas» y «Nueva salida». | `components/shell.tsx` (código anterior). |

## 2. Qué cambió y por qué (antes → después)

Explicado para quien no es técnico. Solo cambia el menú: no se tocó ningún permiso ni la base de datos.

| Antes | Después | Por qué (en simple) |
|---|---|---|
| Una lista plana de 20 a 23 enlaces. | Seis bloques en el orden del trabajo: **Inicio, Entradas, Almacén, Salidas, Despacho y transporte, Control**, con un encabezado cada uno. | Se lee como se trabaja: llega la mercadería, se guarda, se vende y sale, se despacha, se controla. |
| «Pedidos» · «Rutas» · «Salidas» sueltos. | **Salidas** es un grupo con cuatro opciones, en este orden: **Pedidos por despachar**, **Órdenes de salida**, **Nueva salida** (verde, la acción principal) y **Rutas**. | Responde a «¿cómo empiezo una salida?»: miro los pedidos que esperan, veo las órdenes ya creadas, creo una a mano o armo una ruta. |
| «Picking», «Conformidad», «Embalaje», «Carga de unidad» mezclados con todo. | Bloque **Despacho y transporte**: **Preparar pedidos (picking)**, **Dar conformidad**, **Embalar**, **Cargar la unidad**. | Son los pasos del piso, después de planificar. Cada nombre empieza con lo que haces. |
| «Entradas» y, más abajo, «Retornos». | **Entradas**: **Recepciones** y **Devoluciones** (lo que los clientes devuelven). | Todo lo que llega al almacén queda junto; «Devoluciones» es la palabra de siempre. |
| «Almacén», «Movimientos», «Conteos», «Revisión diaria», «Bajas» desperdigados. | **Almacén**: **Mapa del almacén**, Productos, Movimientos, Conteos, Revisión diaria, **Dar de baja**. | Lo que hay en el almacén y lo que haces con ello, en un solo lugar. |
| «Documentos» · «Calidad» · «Expedientes» · «Kardex» · «Alertas» · «Reportes» · «Auditoría» mezclados. | Bloque **Control**: Alertas, **Kardex (historial)**, Calidad, **Documentos regulatorios**, Expedientes, Reportes, Propietarios, Auditoría, Carga inicial. | Lo que se revisa y se respalda. «Documentos regulatorios» dice de qué papeles se trata. |
| Todos los bloques abiertos y el menú se cortaba. | Los encabezados se **abren y cierran** (se recuerda tu elección; el bloque de la pantalla en que estás nunca se esconde). Arrancan cerrados **Control** (casi todos) y **Almacén** (para quien planifica salidas). Si Control está cerrado y hay alertas, el encabezado muestra cuántas. | Lo de todos los días cabe sin desplazarte y no pierdes los avisos. |
| Un solo enlace encendido por prefijo. | Se enciende solo **el más específico**. | Estar en «Nueva salida» marca solo «Nueva salida». |
| Teléfono: barra fija (Inicio, Almacén, Entradas) para todos. | Barra **por rol**: Jefe de Transporte → Inicio, Órdenes, Rutas; Jefes de Almacén y Auxiliar → Inicio, Picking, Almacén; Sandra y Katia → Inicio, Recepciones, Almacén; Autoriza salidas → Inicio, Nueva salida, Almacén; Auditoría → Inicio, Auditoría, Reportes. Nombres cortos para que quepan en una línea. | Lo que cada persona hace más, a un toque. |
| Teléfono: «Más» era una lista larga sin título y sin tope de alto. | «Más» agrupa por las **mismas secciones con sus encabezados** (que se abren y cierran), se desplaza dentro de la hoja, y el botón lleva un **punto ámbar** si hay alertas abiertas. | Mismo orden en PC y en teléfono; las alertas no se pierden. |
| Tablet: íconos corridos, dos camiones iguales. | Íconos con una **raya entre secciones**; el pedido tiene un ícono de lista y «Nueva salida» uno de caja con «+». | Se distinguen las secciones sin necesidad de texto. |
| Todos veían casi todo. | **Cada rol ve solo lo que usa** (sección 3). Un bloque sin enlaces no aparece. | Menos ruido y menos botones que no se pueden usar. |

Lo que **no** se tocó (a propósito): las rutas de las pantallas, los permisos, la búsqueda Ctrl+K y el recorrido/«Mis tareas» (siguen apuntando a las mismas rutas), los reportes, y los títulos de las pantallas (el menú añade el verbo; ver pendiente al final).

## 3. Qué ve cada rol (después)

Cada rol sigue viendo **Inicio**. La regla: el menú es un espejo de lo que el rol ya puede hacer. Las colas de trabajo (picking, conformidad, embalaje, carga) solo las ve quien puede hacer ese paso; quien solo lee mira «Órdenes de salida».

| Rol | Entradas | Almacén | Salidas | Despacho y transporte | Control |
|---|---|---|---|---|---|
| **Jefe de Transporte** (Roberto) y **Jefe de Almacén** (Charlie, Jasury) | Recepciones, Devoluciones | Mapa, Productos, Movimientos, Conteos, Revisión diaria, Dar de baja | Pedidos por despachar, Órdenes de salida, Nueva salida, Rutas | Preparar pedidos (picking), Embalar, Cargar la unidad | Alertas, Kardex, Calidad, Documentos regulatorios, Expedientes, Reportes, Propietarios |
| **Auxiliar de almacén** | Recepciones | igual que el Jefe | Órdenes de salida (para mirar) | Preparar pedidos (picking), Embalar, Cargar la unidad | Alertas, Kardex, Reportes |
| **Asistente de DT** (Sandra, con Conformidad de despacho) | Recepciones, Devoluciones | igual que el Jefe | Órdenes de salida | Preparar pedidos (picking), **Dar conformidad** | Alertas, Kardex, Calidad, Documentos regulatorios, Expedientes, Reportes, Propietarios |
| **Dirección Técnica** (Katia) | Recepciones, Devoluciones | igual que el Jefe | Pedidos por despachar, Órdenes de salida, Rutas (lectura) | no ve colas de piso | Alertas, Kardex, Calidad, Documentos regulatorios, Expedientes, Reportes, Propietarios, Auditoría, Carga inicial |
| **Autoriza salidas sin venta** | no | Mapa del almacén, Productos | **Nueva salida** | no | Alertas, Kardex, Reportes |
| **Auditoría** (solo lectura) | Recepciones | igual que el Jefe | Pedidos por despachar, Órdenes de salida, Rutas | no | Alertas, Kardex, Calidad, Documentos regulatorios, Expedientes, Reportes, Propietarios, Auditoría |
| **Administración** | Recepciones | igual que el Jefe | Pedidos por despachar, Órdenes de salida, Rutas | no | Alertas, Kardex, Calidad, Documentos regulatorios, Expedientes, Reportes, Propietarios, Auditoría, Carga inicial |
| Conductor, usuario de cliente | solo Inicio | | | | |

Cantidad de enlaces, antes → después: Jefe de Transporte 22 → 23 (suma Nueva salida), Jefe de Almacén 22 → 23, Auxiliar 18 → 15, Sandra 21 → 19, Katia 23 → 21, Auditoría 21 → 19, Administración 22 → 20, Autoriza salidas sin venta 15 → 7. Aunque algunos suban en cantidad, ahora van agrupados y los bloques poco usados arrancan cerrados.

## 4. Qué comprueban las pruebas

- `tests/components/menu-lateral.test.ts` (dominio del menú): qué ve cada rol, orden de las secciones, nombres exactos del grupo Salidas, nadie ve un grupo vacío, barra inferior por rol, enlace activo más específico, que cada enlace apunte a una pantalla existente (salvo `/salidas/nueva`) y cuáles secciones arrancan cerradas.
- `e2e/menu-lateral.spec.ts` (4 viewports): navegar por el grupo Salidas, encabezados en la barra ancha, rayas en la tablet, barra inferior y hoja «Más» con secciones en el teléfono, cambio de rol con «Probar como», secciones que se abren y cierran. **«Nueva salida» se comprueba como enlace** (`/wms/salidas/nueva`), no como página: la pantalla la crea SA-2.

## 5. Pendientes e integración

- `/salidas/nueva` **no existe en esta rama** (da 404 al tocarla): el enlace queda listo para la pantalla de SA-2. Quién puede crear cada tipo de salida lo decide esa pantalla; `puedeCrearSalida` en `domain/menu.ts` es el único punto a alinear si cambia.
- El título de `/salidas` dice «Salidas por pedido»: conviene «Órdenes de salida» para coincidir con el menú (lo toca el agente que hace el vacío de Salidas).
- Se agregó la persona demo «Autoriza salidas sin venta» (`lib/sesion-demo.ts`) para poder probar y capturar ese rol.
