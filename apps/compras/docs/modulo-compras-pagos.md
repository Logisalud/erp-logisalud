# ERP Logisalud — Módulo Compras y Pagos

## DOCUMENTO ÚNICO Y COMPLETO PARA CLAUDE CODE

Este es el documento completo — contiene el modelo de datos (SQL de los 8
schemas), las reglas de negocio, el mapa de flujo, los principios de
Domain-Driven Design y UX, y la lista de tareas. No hace falta ningún otro
archivo adicional.

## Arquitectura de la app

Este módulo vive en **una sola app nueva dentro del monorepo:
`apps/compras`**, deployada aparte en Vercel (mismo patrón que
`apps/cobranzas` y `apps/pedidos`) — **no se separa en 8 apps distintas**
una por cada schema. Los 8 Bounded Contexts (sección 1) están fuertemente
interconectados en el flujo real de negocio (una recepción de Almacén
genera una obligación de Cuentas por Pagar, que entra en una propuesta de
Tesorería, etc.), así que la separación por contexto vive **dentro** del
código de esta única app — carpetas separadas por contexto, nunca en el
nivel de despliegue.

```
apps/compras/
  ├── compras/           (Bounded Context: proveedores, productos, OC)
  ├── servicios/         (Bounded Context: proveedores de servicio, OS)
  ├── almacen/           (Bounded Context: recepciones, discrepancias)
  ├── cuentas-x-pagar/   (Bounded Context: obligaciones, propuestas, pagos)
  ├── gastos/            (Bounded Context: solicitudes, anticipos)
  ├── caja-chica/        (Bounded Context: fondos, movimientos, reposiciones)
  ├── financiamiento/    (Bounded Context: préstamos, fraccionamientos, letras)
  └── impuestos/         (Bounded Context: obligaciones tributarias)
```

## 1. Bounded Contexts (Contextos Delimitados)

Cada uno de los 8 schemas de Supabase **es** un Bounded Context de
Domain-Driven Design — un mundo con sus propias reglas, que se comunica con
los demás solo a través de referencias explícitas (las foreign keys), nunca
mezclando su lógica interna con la de otro.

| Bounded Context (schema) | Aggregate Root(s) | Qué gobierna |
|---|---|---|
| `compras` | Proveedor · OrdenDeCompra | Qué se pide y a quién |
| `servicios` | ProveedorServicio · OrdenDeServicio | Qué servicio se contrata y quién lo confirma |
| `almacen` | Recepción | Qué llegó físicamente y si coincide con lo esperado |
| `cuentas_x_pagar` | Obligación · PropuestaDePago · Pago | Qué se debe y cómo se salda |
| `gastos` | SolicitudDeGasto | Adelantos y reembolsos a empleados |
| `caja_chica` | Fondo | Dinero fijo que administra un custodio |
| `financiamiento` | Préstamo · FraccionamientoSunat · LetraPorPagar | Deudas con cronograma pactado |
| `impuestos` | ObligaciónTributaria | Cargas tributarias recurrentes |

**Regla:** cada Aggregate Root es la única puerta de entrada a su
aggregate. Nadie edita `almacen.recepciones_items` directamente desde otro
módulo — todo pasa a través de acciones sobre `Recepción` (el root). En la
práctica: **una sola Server Action por operación de negocio, nunca updates
sueltos a una tabla hija desde otro contexto.**

## 2. Lenguaje Ubicuo (Ubiquitous Language)

Se usa el mismo término en la base de datos, en las pantallas y en las
conversaciones del equipo — sin excepción.

| Término | Significado exacto en Logisalud | Dónde vive en el sistema |
|---|---|---|
| **Obligación** | Cualquier deuda pendiente de pago, sin importar su origen | `cuentas_x_pagar.obligaciones` |
| **Conformidad** | Confirmación de que algo (mercadería, servicio, documento) está correcto y puede avanzar | Múltiples contextos, siempre el mismo verbo: "dar conformidad" |
| **Propuesta de pago** | Lote semanal de obligaciones agrupadas para una sola aprobación de Gerencia | `cuentas_x_pagar.propuestas_pago` |
| **Discrepancia** | Diferencia entre lo pedido/esperado y lo recibido en una recepción | `almacen.recepciones_items.tipo_discrepancia` |
| **Anticipo** | Dinero entregado a un empleado antes de un gasto, pendiente de rendir | `gastos.solicitudes_gasto` (tipo = anticipo) |
| **Rendir / Liquidar** | Sustentar con comprobantes reales cómo se usó un anticipo | `gastos.liquidaciones_anticipo` |
| **Área usuaria** | El área que solicita un servicio o gasto y es responsable de confirmar que se cumplió | `servicios.ordenes_servicio.area_solicitante` |
| **Reposición** | Solicitud para devolverle a un fondo de caja chica el dinero ya gastado | `caja_chica.reposiciones` |
| **Canje por letra** | Convertir una factura ya existente en uno o más pagos futuros pactados | `financiamiento.letras_por_pagar` |

**Regla:** los nombres de componentes React, funciones y mensajes de la
interfaz deben usar estos mismos términos en español, sin traducirlos a
jerga técnica en inglés ni inventar sinónimos (nunca "aprobación" cuando el
término correcto en este dominio es "conformidad").

## 3. Carta de Simplicidad UX (Don't Make Me Think, aplicado)

Reglas concretas obligatorias en **cada pantalla** de este módulo:

1. **Un botón primario visible por pantalla.** Charlie no elige entre 5
   acciones — ve "Registrar recepción" y ya. Las acciones secundarias
   (editar, cancelar) van visualmente más discretas.
2. **Lenguaje del negocio, nunca el estado interno de la base de datos.**
   La pantalla nunca muestra `estado: pendiente_recepcion` — muestra
   "Esperando que llegue la mercadería".
3. **Cada rol ve solo lo que le toca decidir ahora.** Charlie no ve campos
   de detracción o tipo de cambio — eso es de Contabilidad. Ocultar, no
   solo restringir por permisos.
4. **El sistema sugiere, la persona confirma — nunca una pantalla en
   blanco.** La matriz de resolución de discrepancias muestra la acción
   sugerida, no un formulario vacío.
5. **Todo proceso debe llegar a un estado final visible.** El dashboard
   general prioriza visualmente los "loops abiertos" (discrepancias sin
   resolver, viáticos sin rendir, facturas de servicio sin conformidad).
6. **Una sola fuente de verdad por dato.** Charlie sube la factura y la
   guía; Contabilidad las hereda automáticamente, nunca las vuelve a pedir.
7. **Las alertas dicen qué hacer, no solo que algo está mal.** "Contacta a
   Contabilidad antes del [fecha] para evitar perder el fraccionamiento".
8. **Mobile-first para los roles operativos.** Charlie, Roberto, Jose
   Carlos, Sandra Chau y los vendedores en ruta. Contabilidad, Tesorería y
   Gerencia pueden ser desktop-first.

## 4. La regla de oro

Sin importar el origen, **todo dinero que sale de la empresa termina como
una fila en `cuentas_x_pagar.obligaciones`** antes de pagarse. Un solo
embudo de aprobación y pago.

| Origen | Cómo nace | Beneficiario |
|---|---|---|
| `compra` | Factura de mercadería contra una Orden de Compra, recibida por Almacén | Proveedor (catálogo `compras`) |
| `servicio` | Factura contra una Orden de Servicio, con conformidad del área usuaria | Proveedor de servicio (catálogo `servicios`, aparte) |
| `gasto_directo` | Factura sin OC (útiles, pasajes, mantenimiento de camiones) | Proveedor |
| `reembolso` | Empleado pagó de su bolsillo y sube la factura | Empleado |
| `anticipo` | Adelanto antes de que el empleado pague a un tercero (viáticos, marketing, eventos) — se liquida después con boletas reales | Empleado |
| `reposicion_caja_chica` | Roberto gastó del fondo fijo (combustible, peajes de camiones) | Roberto (custodio) |
| `prestamo` | Cuota de un préstamo bancario | Entidad financiera |
| `fraccionamiento_sunat` | Cuota de deuda tributaria fraccionada (incluye IGV Justo) | SUNAT |
| `letra_por_pagar` | Una factura de compra ya existente, canjeada por letras con vencimiento futuro | Proveedor |
| `impuesto` | Monto tributario recurrente (planilla vía BUK: Essalud, ONP, AFP, Renta 4ta/5ta, Seguro Vida Ley) | SUNAT |

## 5. Mapa de flujo

```
6+ formas de originar un gasto -> Conformidad (Contabilidad, y en servicios
también el área usuaria) -> cuentas_x_pagar.obligaciones (conforme) ->
Tesorería arma propuesta de pago semanal -> Gerencia aprueba la propuesta
(una vez, por lote, nunca obligación por obligación) -> Tesorería ejecuta
el pago -> cerrado (o "pendiente de rendición" si es un anticipo).
```

**Caso compra de mercadería (el más elaborado):**

```
Compras emite OC (sin aprobación previa)
   -> Proveedor factura y emite guía, envía mercadería a Lurín
   -> Charlie recibe: cuenta físico vs. guía, registra lote y vencimiento
      por producto, sube la guía y la factura escaneadas
   -> El sistema clasifica discrepancias automáticamente (faltante,
      sobrante, dañado, vencido, producto erróneo, lote no informado)
      usando la matriz de resolución estándar
   -> Si hay discrepancia: Sebas (temporalmente responsable de Almacén)
      decide la acción, confirmando o ajustando la sugerencia del sistema
   -> Contabilidad registra la obligación (hereda automáticamente los
      documentos que Charlie ya subió), calcula IGV/detracción
   -> La fecha de vencimiento del PAGO se calcula desde la fecha de
      conformidad de la recepción + condición de pago del proveedor
      (NUNCA desde la fecha de la OC)
   -> Sigue el flujo normal de pago
```

**Caso Orden de Servicio:**

```
Área usuaria crea la OS -> jefe de área aprueba -> se contrata el servicio
-> (en cualquier orden) el área usuaria sube la factura Y da conformidad
del servicio -> Contabilidad NO puede marcar "conforme" sin que exista esa
conformidad -> sigue el flujo normal de pago
```

**Caso anticipo (viáticos, marketing, etc.):**

```
Empleado solicita anticipo -> jefe de área aprueba -> Contabilidad aprueba
-> Tesorería paga -> queda "pendiente de rendición" -> empleado sube
boletas reales -> liquidación automática: si gastó menos, debe devolver
saldo; si gastó más, se genera una obligación adicional por la diferencia
```

**Caso caja chica (Roberto):**

```
Fondo fijo -> va gastando y guardando boletas (combustible, peajes,
NUNCA mantenimiento) -> arma reposición cuando se agota -> jefe de Almacén
aprueba -> Contabilidad aprueba -> se convierte en obligación -> Tesorería
repone el fondo a su monto original
```

## 6. Roles (RLS)

| Rol/Área | Qué hace |
|---|---|
| `compras` | Proveedores de mercadería, productos, órdenes de compra |
| `almacen` | Charlie, Jose Carlos, Sandra Chau: reciben contra OC, registran discrepancias, suben factura/guía. Roberto además administra su caja chica. Sebas: responsable temporal (aprueba discrepancias y reposiciones) |
| `contabilidad` | Da conformidad a toda obligación, calcula detracción, revisa 3-way match, aplica notas de crédito |
| `tesoreria` | Arma propuestas de pago, ejecuta pagos, sube vouchers |
| `gerencia` | Aprueba propuestas de pago (una vez por lote) |
| `empleado` (todos) | Crea solicitudes de reembolso/anticipo, ve estado de las suyas |
| `jefe_area` | Vía `public.area_responsables`: aprueba solicitudes/OS/reposiciones de su área |
| `gestion_humana` | Arlette: carga impuestos de planilla desde BUK con anticipación |
| `area_usuaria` (cualquiera) | Crea Órdenes de Servicio, sube su factura, da conformidad del servicio |
| `admin` | Todo, incluida configuración |

## 7. SQL

El SQL completo de los 8 schemas vive, ya corregido y re-ejecutable, en
`apps/compras/supabase/migrations/`. La corrección aplicada respecto del
borrador original: `compras.notas_credito.obligacion_id` no puede declarar
su foreign key inline porque `cuentas_x_pagar.obligaciones` todavía no
existe en ese punto del script — la FK se agrega más abajo vía
`ALTER TABLE ... ADD CONSTRAINT fk_obligacion`, tal como ya hacía el
borrador para `fk_recepcion_item`.

## 8. Reglas de negocio (Server Actions — no todo va en SQL)

1. **Conciliación de 3 vías** (`origen = 'compra'`): comparar
   `cantidad_pedida` vs. `cantidad_recibida` vs. `cantidad_facturada`, y
   precio pactado vs. facturado (tolerancia 2%). Discrepancia → `observada`.
2. **Clasificación automática de discrepancias en recepción**: por línea,
   según calidad, vida útil restante (`fecha_vencimiento` <
   `fecha_recepcion` + `meses_vida_util_minima_recepcion` del producto →
   `por_vencer`), lote faltante, y comparación de cantidades. Usa
   `almacen.matriz_resolucion_discrepancias` para sugerir la acción; el
   responsable de Almacén confirma o ajusta en
   `almacen.resoluciones_discrepancia`.
3. **Cálculo de `fecha_vencimiento_real` de una obligación de compra**:
   `fecha_conformidad` de `almacen.recepciones` (NO la fecha de la OC, NI
   la fecha de la factura) **+** `condicion_pago_dias` del proveedor (o de
   la OC si la sobreescribe). Se recalcula automáticamente cuando
   `almacen.recepciones.conforme` pasa a `true`.
4. **Herencia de documentos**: al registrar una obligación con
   `recepcion_id`, el legajo hereda automáticamente
   `storage_path_guia_recibida` y `storage_path_factura_proveedor` que
   Charlie ya subió — Contabilidad no debe tener que volver a pedirlos.
5. **Bloqueo por falta de conformidad de servicio**: una obligación
   `origen = 'servicio'` no puede pasar a `conforme` sin una fila en
   `servicios.conformidad_servicio` con `conforme = true` para su `os_id`.
6. **Generación automática de obligación** cuando: una `solicitud_gasto`
   llega a `aprobada`, una `reposicion` de caja chica llega a `aprobada`, o
   vence una cuota de préstamo/fraccionamiento/letra (proceso programado,
   ej. 7 días antes del vencimiento).
7. **Liquidación de anticipos**: al subir comprobantes de rendición,
   calcular `monto_sustentado`/`diferencia`/`resultado`; si es
   `reembolso_adicional`, generar la obligación adicional automáticamente.
8. **Canje de factura por letras**: cambia el estado de la obligación
   original a `canjeada_por_letra` y crea las filas correspondientes en
   `financiamiento.letras_por_pagar`.
9. **Aplicación de notas de crédito**: al marcar `aplicada = true`, el
   monto a pagar de la obligación se reduce en ese valor al armar la
   propuesta de pago.
10. **Alerta de fraccionamiento SUNAT en riesgo**: cualquier cuota de
    `fraccionamientos_sunat_cuotas` que pase a `vencida` dispara una
    alerta visible en el dashboard.
11. **Carga anticipada de impuestos**: usuarios de área `gestion_humana`
    (Arlette) crean `impuestos.obligaciones_tributarias` con
    `fuente = 'BUK'` antes del vencimiento; Contabilidad confirma.
12. **Alerta de comprobante no sustentable**: aviso visual (no bloqueo)
    cuando `sustentable = false`.
13. **Reposición de caja chica**: al crear una reposición, arrastra los
    `movimientos` sin `reposicion_id` asignado y los marca para que no se
    dupliquen.
14. **Cada cambio de estado en `obligaciones` se registra en
    `historial_estados`** — este sí es un trigger de base de datos.

## 9. Alcance por Pull Request

Orden sugerido, cada PR deja el sistema funcionando sin romper lo anterior:

1. Migración SQL de los 8 schemas + RLS + buckets de Storage.
2. Compras + Almacén + Discrepancias.
3. Cuentas por Pagar core (obligaciones, propuestas, pagos).
4. Servicios.
5. Gastos / Anticipos.
6. Caja Chica.
7. Financiamiento + Impuestos.
8. Dashboard general.

Toda escritura financiera pasa por Server Actions — nunca inserts directos
desde el cliente.

## 10. Pendiente de confirmar

- Si los 12 meses de vencimiento mínimo aplican igual a todos los
  productos, o si hay excepciones por proveedor/categoría.
- Nombre y RUC de los primeros proveedores de servicio, para precargar el
  catálogo.
- Tasas de detracción reales del anexo SUNAT.
- Catálogo completo de `categorias_gasto`.
- Monto fijo del fondo de caja chica de Roberto.
- Otros proveedores de mercadería en dólares además de Megacentro.

## 11. Nota sobre autenticación

Todo el modelo de datos de este módulo depende de `auth.users` (perfiles,
roles, aprobaciones nominales). `apps/cobranzas` **no tiene ningún sistema
de login** — así que este módulo es el primero en implementar Supabase Auth
real en el proyecto consolidado, y `public.perfiles` /
`public.area_responsables` quedan como la base de auth compartida para el
resto del ERP (incluido `apps/pedidos` cuando se consolide).
