Última actualización: 2026-09-14. Léeme completo antes de tocar código. Actualízame cuando algo cambie de verdad (arquitectura, reglas, estado de módulo) — no en cada sesión.

---

# 🚨 PENDIENTE PRIORITARIO — Hueco de control de acceso (abierto desde 2026-09-10)

**Esto NO es deuda técnica menor ni prolijidad de código: hoy el módulo de
Compras y Pagos no tiene control de acceso real.** Sebas pidió explícitamente
retomarlo como conversación propia en la próxima sesión — no dejarlo pasar.

Encontrado al diseñar "Pendientes de aprobar". Son tres problemas
independientes y hay que cerrar los tres:

### (a) El flag `acceso_abierto_temporal` anula toda la RLS del módulo

`cuentas_x_pagar.obligaciones`, `gastos.solicitudes_gasto`,
`caja_chica.reposiciones` y `servicios.ordenes_servicio` tienen cada una una
policy `*_acceso_temporal` con `cmd=ALL` y condición `compras_acceso_abierto()`,
que lee `compras.flags.acceso_abierto_temporal` — **hoy en `true` en
producción**. Las policies de Postgres se combinan con OR, así que mientras ese
flag esté prendido cualquier persona logueada con perfil tiene lectura y
escritura completa sobre las cuatro tablas. Las policies "buenas"
(`_actualiza`, `_escritura`) están escritas y son correctas, pero **no se
aplican**. Apagar el flag es un cambio de blast radius grande: hay pantallas
que hoy funcionan de prestado gracias a él, así que requiere su propio PR con
prueba pantalla por pantalla.

### (b) Tres de las cuatro Server Actions de aprobación no chequean permiso

| Acción | Gate en la app |
|---|---|
| `darConformidad` / `rechazarPagoDirecto` | solo en la UI (`app/cuentas-por-pagar/[id]/page.tsx`), la Server Action no valida |
| `aprobarPorContabilidad` (Gastos) | **ninguno** |
| `aprobarPorJefe` / `aprobarPorContabilidad` (Caja Chica) | **ninguno** |
| `aprobarOS` / `rechazarOS` | **ninguno** |

Los servicios solo validan el ESTADO, nunca quién llama. Con el flag prendido,
RLS tampoco los frena.

### (c) Auto-aprobación permitida por las policies nominales

Aun apagando el flag, las policies de UPDATE dejan que alguien se apruebe a sí
mismo: `gastos.solicitudes_gasto` y `servicios.ordenes_servicio` incluyen
`solicitante_id = auth.uid()`, y `caja_chica.reposiciones` incluye
`custodio_id = auth.uid()`. O sea: quien pide un anticipo puede aprobárselo, y
el custodio de un fondo puede aprobar su propia reposición.

### Consecuencia mientras esto siga abierto

**"Pendientes de aprobar" es una ayuda de priorización, NO un control de
acceso.** Muestra a cada quien lo que le toca decidir, pero quien no debería
aprobar algo lo sigue pudiendo hacer entrando por URL directa al detalle. El
gate de esa pantalla está replicado en JS (`domain/pendientes-aprobar.ts`)
justo porque no se puede confiar en RLS hoy. Lo mismo vale para el gate de
Beatriz en Pago Directo: es cosmético hasta que se cierre (a) y (b).

---

## ⏳ TEMPORAL — Categoría "Regularización de pagos antiguos (pre-ERP)"

**Hay que desactivarla cuando Sebas termine el backlog.** Agregada el
2026-09-14 (migración 0053) al catálogo de Pago Directo
(`cuentas_x_pagar.categorias_pago_directo`).

Para qué es: Sebas (Gerencia General) tiene que regularizar un conjunto
CERRADO de pagos anteriores al ERP — facturas de mercadería viejas y
letras/retiros viejos. Es un número limitado y se termina. Nadie más del
equipo la usa; el resto sigue con el flujo normal (OC para mercadería nueva).

Por qué es temporal y no una categoría más: **"mercadería" no es un caso de
Pago Directo.** Pago Directo existe para lo que NO tiene OC ni OS (luz, agua,
peajes, notaría…). Esta categoría es una excepción de migración de datos, no
una puerta nueva. Dejarla activa para siempre sería ofrecer un camino
permanente para saltarse la Orden de Compra, que es la regla de oro del
módulo — y el primero que la encuentre buscando "cómo pago esta factura sin
armar la OC" la va a usar para eso.

Cómo se apaga (mismo mecanismo de 0034 y 0049 — desactivar, nunca borrar, así
las obligaciones ya registradas siguen mostrando su nombre):

```sql
update cuentas_x_pagar.categorias_pago_directo
set activo = false
where nombre = 'Regularización de pagos antiguos (pre-ERP)';
```

**Y con ella muere el proveedor comodín** (migración 0056, del 2026-09-15):
`compras.proveedores` con RUC `00000000000` y razón social
`SIN IDENTIFICAR — Backlog pre-ERP`. Existe porque de algunos retiros viejos
Sebas no sabe a qué proveedor correspondían, y el formulario de Pago Directo
exige elegir uno con RUC. Las dos cosas se apagan juntas:

```sql
update compras.proveedores set activo = false where ruc = '00000000000';
```

Once ceros porque es el único valor que pasa `validarRUC` (11 dígitos, sin
checksum — ver domain/proveedor.ts) y a la vez es **imposible** que sea un
RUC real: los peruanos empiezan en 10, 15, 17 o 20. Es uno solo garantizado
por el esquema (`UNIQUE (ruc)`), no por disciplina.

El riesgo conocido: el comodín aparece en el buscador de CUALQUIER pago
directo, no solo del backlog. Lo vigila
**`/reportes/sin-identificar`**, que marca en ámbar toda obligación cargada
contra él con una categoría distinta a la del backlog — señal de que alguien
lo eligió en vez de cargar el proveedor de verdad, y hay que corregirlo
mientras se sepa cuál era.

**Esta categoría acumula TRES excepciones al circuito normal**, y todas
dicen lo mismo — "esto ya pasó":

| # | Excepción | Dónde vive |
|---|---|---|
| 1 | Sin tope de S/5,000 | `CATEGORIAS_EXENTAS_DEL_TOPE` en domain/obligacion.ts |
| 2 | Sin conformidad de Contabilidad | `puedeRegistrarsePagoHistorico` |
| 3 | Sin propuesta de pago | `services/pago-historico.ts` |

Las tres se resuelven por NOMBRE de categoría, resuelto contra la base y
nunca desde el formulario. **Desactivar la categoría cierra las tres de una
vez**, sin tocar código: si nadie puede elegirla, ninguna excepción se
dispara. Por eso apagarla al terminar el backlog importa más que antes.

Detalle del #3: `registrarPagoHistorico` es una función APARTE y no un flag
en `ejecutarPago`. Esa última no significa "registrar un pago" sino
"Tesorería ejecuta un desembolso hoy" — cierra el ciclo de otros cinco
módulos y exige propuesta aprobada. Un flag que rompiera esas guardas sería
una forma de saltarse la aprobación para CUALQUIER obligación. La transición
`registrada → pagada` tampoco se agregó a `TRANSICIONES`: vive como
excepción nombrada, para que no se lea como regla general.

**Ojo con el tope de S/5,000** (`TOPE_PAGO_DIRECTO_PEN` en
`domain/obligacion.ts`): `validarPagoDirecto` rechaza en soles todo total
mayor o igual a ese número, y una factura de mercadería vieja o una letra lo
supera fácil. No se tocó — es una regla de negocio acordada con Sebas
(2026-08-28) y cambiarla por un backlog sería usar la excepción para mover la
regla. Decisión pendiente si el backlog lo necesita (ver "Pendientes de
Sebas").

---

## Al crear un schema nuevo: dos pasos, ninguno automático

Aprendido en producción el 2026-09-15, con `/planilla` caída dos días. Un
schema nuevo necesita **dos** habilitaciones, y cada una falla con un error
distinto que parece un bug de código:

1. **Exponerlo en el Data API** — Project Settings → Data API → Exposed
   schemas. Esto **no se puede hacer por SQL** (existe
   `ALTER ROLE authenticator SET pgrst.db_schemas`, pero a partir de ahí el
   dashboard deja de administrar la lista para siempre; se decidió NO usarlo).
   Lo hace Sebas a mano.
   - Si falta: PostgREST responde **HTTP 406** y el mensaje es
     `Invalid schema: <nombre>`.
2. **Los grants a `authenticated`** — `select public.aplicar_grants_del_modulo();`
   al final de la migración, después de agregar el schema a
   `public.schemas_compras_y_pagos()`.
   - Si falta: **HTTP 403**, `permission denied for schema <nombre>`.

Los dos errores llegan a la pantalla como el mismo
"Application error: a server-side exception has occurred" con un digest, así
que **el digest hay que buscarlo en los logs de runtime de Vercel** — el
mensaje real nunca llega al navegador. El de `planilla` fueron los dos, uno
detrás del otro: se arregló (1) y apareció (2).

Por qué la lista de schemas del módulo sigue siendo explícita y no un
`select` sobre `pg_namespace`: en esta base hay schemas propios (owner
`postgres`) que **no** son del módulo y a los que `authenticated` no debe
tener nada — `pedidos` (otra app del monorepo) y
`backup_limpieza_20260903` (un respaldo). Un loop "todo lo que sea de
postgres" se los habría abierto a cualquier usuario logueado de Compras.
`public.verificar_schemas_sin_grants()` los lista para revisión.

**Pendiente menor**: `backup_limpieza_20260903` (28 objetos) sigue en la base
sin grants. Si ya no hace falta, borrarlo.

---

## Fechas: siempre en hora de Lima, nunca en UTC

Bug real (2026-09-11): Mariela registró un pago a las 22:50 de Lima y quedó
guardado con fecha **12/09**. La causa estaba repetida en 40 lugares del
módulo:

```ts
new Date().toISOString().slice(0, 10)   // ❌ devuelve el día en UTC
```

Lima es UTC-5, así que entre las **19:00 y la medianoche** esa expresión
devuelve siempre el día siguiente — un quinto de cada día, y justo el tramo
en que se carga lo que quedó pendiente. Falla por los dos lados y por
razones distintas: en el cliente `new Date()` sí da hora de Lima pero
`toISOString()` la corre a UTC; en el servidor el lambda de Vercel corre en
UTC, así que ahí ni `getFullYear()`/`getMonth()` sirven.

Usar siempre `domain/fecha.ts`: `hoyLima()`, `mesActualLima()`,
`anioActualLima()`, `anioMesStorageLima()`. Sirven en cliente y servidor, así
que nadie tiene que pensar en dónde corre su código.

**La excepción**: las columnas `timestamptz` de auditoría (`editado_en`,
`anulado_en`, `updated_at`, `conformidad_fecha`, …) siguen con
`new Date().toISOString()`, y está bien — ahí se guarda un **instante**, no
un día de calendario, y Postgres ya lo almacena con zona.

---

## Corregir un pago ya registrado: dos mecanismos, a propósito separados

| qué | función | toca plata | permiso |
|---|---|---|---|
| el archivo de la constancia | `reemplazarConstanciaPago` | no | solo admin |
| la fecha del pago | `corregirFechaDePago` | **sí** | solo admin |

Están separadas y **no hay que unificarlas**. `reemplazarConstanciaPago` no
tiene ni un campo financiero en su firma, y eso es una garantía legible de
que no puede mover plata. `fecha_pago` sí la mueve: la leen `dashboard.ts`
("Pagado este mes"), los reportes de detalle y sábana, y
`historial-orden.ts`. Corregir un pago del 01/10 al 30/09 **cambia dos
cierres mensuales de forma retroactiva** — de ahí la advertencia con el
monto adentro antes de confirmar.

`fecha_pago_corregida_de` guarda la fecha con la que **nació** el pago y
**nunca se sobrescribe**. En una segunda corrección se conserva la original y
se pierden el quién/cuándo/por qué de la primera: costo aceptado
explícitamente (2026-09-15) para no crear la primera tabla de historial del
módulo por un caso que esperamos raro. Si Contabilidad pide el trail completo
para sustentar algo ante SUNAT, se evalúa entonces con ese caso en mano.

---

## Aprobación en lote: qué la hace segura ahora que mezcla tipos

Desde 2026-09-15 un lote puede mezclar tipos. Lo que lo sostiene NO es la
pantalla — son tres cosas del servidor, y ninguna se puede quitar sin
reabrir el riesgo:

1. **El orden de ejecución, con las propuestas al final**
   (`ORDEN_DE_EJECUCION`). Sin transacciones, el orden es lo que decide qué
   queda a medias si el lote se corta. Una propuesta libera el desembolso de
   su lote entero: conviene que sea lo último, no lo primero.
2. **Reusar la función individual de cada tipo** (`aprobarUna`). Es lo único
   que hace que cada fila la evalúe quien de verdad decide sobre ella, y que
   la que no le toque falle sola con su motivo. Cero escrituras directas en
   `services/aprobar-en-lote.ts`.
3. **El resumen parcial honesto** (`resumirLote`), que nombra tipo + código
   de lo que no entró.

`aprobarEnLote(ids)` **ya no recibe el tipo**: sale de la relectura de la
bandeja en el servidor. Antes venía del formulario, así que el navegador
podía afirmar de qué tipo era cada id.

El total por moneda se destaca si la selección tiene **al menos una**
propuesta (no "si el tipo es propuesta"): el caso peligroso del lote mezclado
es una propuesta perdida entre filas chicas.

---

## Deuda técnica conocida (menor, revisar aparte)

- **Impuestos — estado `en_propuesta` muerto**: las filas de impuestos pueden
  quedar en un estado que ningún flujo alcanza de verdad.
- **`confirmarObligacionTributaria` sin transacción**: si falla a mitad puede
  dejar una obligación huérfana. El módulo entero no usa transacciones (no hay
  un solo `supabase.rpc`), así que esto es un caso particular de un patrón
  general, no un bug aislado.
- **Comprobantes huérfanos en Storage (aportes de accionista)**: desde la
  carga múltiple (2026-09-14), cada comprobante se sube al ELEGIRLO, en su
  propio request, a `legajos-gastos/YYYY/MM/borradores-<uuid>/`. **El formato
  del path no es decorativo**: la policy `legajos_gastos_escritura` exige
  `path_legajo_valido(name)`, o sea `^[0-9]{4}/(0[1-9]|1[0-2])/[^/]+/.+$`. Un
  `borradores/<uuid>/...` lo rechaza RLS — fue el primer intento y falló en
  producción. Eso es lo que evita
  que N archivos juntos pasen del límite de body del submit — con 4 fotos de
  celular serían ~10 MB y el envío se rechazaría sin dejar ni un error que
  mostrar (el mismo fallo silencioso del "botón que no hacía nada"). El costo
  aceptado: si alguien sube comprobantes y abandona el formulario, esos
  archivos quedan sin fila. Son chicos, están en un bucket privado, no se
  muestran en ninguna pantalla y no rompen nada. Limpiarlos requeriría un
  cron, que el módulo todavía no tiene — cuando exista, es una tarea de dos
  líneas (borrar lo que tenga `borradores-` en el tercer segmento y no esté
  referenciado en `storage_path_comprobante`).
- **Estado `cerrada` muerto en `cuentas_x_pagar.obligaciones`** (encontrado
  2026-09-11 al agrupar los estados del listado): está en `ESTADOS_OBLIGACION`,
  en el CHECK de la base, en `ETIQUETA_ESTADO` y en las transiciones
  (`pagada → cerrada`), pero **ningún código lo escribe** — `ejecutarPago`
  deja la obligación en `pagada` y ahí termina. `obligacionPagada()` ya trata
  a los dos igual, y en producción hay 0 filas en cada uno. Ojo: `cerrada` SÍ
  es un estado real y usado en `ordenes_compra`, `ordenes_servicio`,
  `caja_chica.reposiciones` y `solicitudes_gasto` — la misma palabra hace
  trabajo real en cuatro tablas y decorativo en la quinta, que es de donde
  viene la confusión. **Decisión pendiente: implementarlo de verdad (¿qué
  significaría cerrar una obligación ya pagada?) o eliminarlo del modelo.**
  Mientras siga así, el filtro del listado los agrupa bajo "Pagada", porque
  separarlos ofrecería una categoría que nunca tendría filas.

---

## Quién soy y cómo trabajamos

Sebastián Gonzales, Gerente General de Logisalud SAC (marca Logisalud + marca Estrella, ambas bajo RUC de Logissa SAC). Construyo el ERP con Andrés Romero (co-programador). Sebas no programa directamente — dirige decisiones de negocio/diseño vía Claude (chat), que traduce esas decisiones en prompts para Claude Code (este agente).

## Reglas fijas — no cambiar sin que Sebas lo pida explícitamente

- **Antes de mergear cualquier PR a `main`, preguntar a Sebas y esperar "sí, mergea" explícito. Sin excepción.**
- **NUNCA** tocar un dato real de Cobranzas (clientes, documentos, pagos) sin aprobación explícita previa — ni "de paso" arreglando otra cosa.
- Cuando algo se "guarda" en una interfaz (Vercel, GitHub, Supabase), no asumir que persistió — pedir verificación recargando. Ya pasó 3 veces que algo parecía guardado y no lo estaba.
- Español de Perú (tuteo), nunca voseo argentino.
- Área `ventas` / vendedores (15) acceden a Cobranzas por `/v/[token]` sin login — sistema aparte, **NUNCA** tocar ni mezclar con el resto.

## Arquitectura técnica

- Monorepo: `github.com/Logisalud/erp-logisalud`.
- Supabase consolidado, proyecto único `qpkigzniatidsvnxikox` (Pro), schemas por Bounded Context: `compras`, `servicios`, `almacen`, `cuentas_x_pagar`, `gastos`, `caja_chica`, `financiamiento`, `impuestos`, `planilla`, `catalogo`, `pedidos`, más `public` (perfiles, area_responsables, tablas de Cobranzas).

  **`planilla` es el noveno schema del módulo de Compras y Pagos** (agregado
  2026-09-14, migración 0055). Existe aparte de `impuestos` por una
  corrección explícita de Sebas: Pago de Planilla comparte con los impuestos
  el ORIGEN DEL DATO (BUK le arroja el total a Arlette, que lo transcribe) y
  nada más — no se declara ante SUNAT, no tiene tipo de impuesto, y el
  beneficiario son los trabajadores, no el Estado. Ponerlo como un tipo
  dentro de `impuestos.tipos_impuesto` habría hecho que todo reporte
  tributario sumara la planilla como si fuera un tributo. El documento
  maestro del módulo todavía habla de 8 Bounded Contexts: son 9. Un solo Supabase con schemas, NO bases aisladas — decisión explícita.
- Vercel, patrón Multi-Zones: `erp-logisalud` (Cobranzas, raíz de erp.logisalud.com), `erp-logisalud-compras`, `erp-logisalud-pedidos`. Raíz del dominio = selección de módulos; `/cobranzas`, `/compras`, `/pedidos` son rewrites a cada proyecto. Solo `apps/compras` usa `basePath` de Next de verdad; Cobranzas logra su prefijo `/cobranzas` con carpetas reales bajo `app/`, no con basePath.
- Auth: magic link (Supabase + Resend SMTP, dominio logisalud.com verificado) + código de 6 dígitos de respaldo (problema de PKCE cruzando dispositivos). Trigger crea `public.perfiles` desde `usuarios_esperados` en el primer login.
- Diseño: marca Logisalud (verde #4BB168, teal #4ABCC2, Oswald/Poppins, tokens). Regla de emojis: NUNCA en logisalud.com externo, SÍ permitido en el ERP interno (tono cercano).
- Principios: Domain-Driven Design (Bounded Contexts, Lenguaje Ubicuo) + "Don't Make Me Think" (Krug) — navegación por tarea/rol, nunca por arquitectura interna. Navegación "Atrás" SIEMPRE con pila en memoria (useState array de pasos), NUNCA router.back() ni rutas estáticas.

## Estado por módulo

### Cobranzas — EN VIVO, datos reales

3,447 clientes, ~S/640K en saldo. Auditoría de seguridad completa: se corrigieron 48-54 rutas API que usaban `service role` sin validar sesión/área, con guards por rol + RLS real. Beatriz (asistente contable) NO debe poder "dar conformidad" — exclusivo de Mariela (jefa Contabilidad).

### Compras y Pagos — 9 piezas completas, en refinamiento de UX

Piezas en producción: Compras/OC, Almacén con discrepancias (matriz de resolución, lote/vencimiento), Cuentas por Pagar (conciliación 3 vías, notas de crédito, propuestas de pago por lote aprobadas por Gerencia), Gastos/Anticipos (liquidación automática), Caja Chica, Financiamiento/Impuestos (préstamos, fraccionamiento SUNAT con IGV Justo, letras, impuestos vía BUK), Dashboard (prioriza "loops abiertos", **hoy es una ruta huérfana, ningún botón del menú la linkea todavía**), Servicios.

Regla de oro: todo dinero que sale de la empresa termina como fila en `cuentas_x_pagar.obligaciones` antes de pagarse, sin importar origen (compra, gasto_directo, reembolso, anticipo, reposicion_caja_chica, prestamo, fraccionamiento_sunat, letra_por_pagar, impuesto, servicio).

Catálogo unificado con Pedidos: `catalogo.productos` (162 productos). Precio de venta en `pedidos.price_lists`; precio de compra sin definir todavía (Sebas prepara CSV).

Menú actual (rediseñado por tarea, no por Bounded Context):

1. Crear orden de compra de mercadería (usa catálogo)
2. Crear orden de compra de un bien (NO revender, descripción libre, `compras.proveedores.tipo` = mercaderia/bien/ambos)
3. Contratar un servicio
4. Pedir un pago → "¿Cómo es tu situación?":
   - "Ya pagué yo mismo" → Quiero que me devuelvan el dinero (Reembolso)
   - "Necesito el dinero antes de pagar" → Anticipo (viaje, evento, adelanto a un proveedor)
   - "Que la empresa pague directo (menos de S/5,000)" → Pago directo (boletos, útiles, peajes, movilidad, marketing menor). Wording confirmado y aprobado 2026-08-28. Construido en `/pago-directo/nueva` — 21 categorías de excepción, tope de S/5,000 validado en `domain/obligacion.ts` (solo en soles, sin tipo de cambio de referencia para USD todavía).
5. Ver reportes (solo lectura)

Otras gestiones: Registrar impuesto, Caja chica, Mi cuenta bancaria. Registrar financiamiento vive en el menú principal.

Cuenta bancaria por empleado (`empleado_cuentas_bancarias`) para pagar reembolsos/anticipos — ya construida en `/mi-cuenta-bancaria`. **Cuenta(s) bancaria(s) del proveedor** (`compras.proveedor_cuentas_bancarias`, ya existía la tabla) ahora se agregan desde la ficha del proveedor (`/proveedores/[id]`), mismo patrón que la de empleado.

Principio: subir el voucher de pago = acción que marca la obligación como pagada (un solo paso).

Condición de pago del proveedor: default 90 días; **no editable por el proveedor** — la fija Compras al registrarlo. Prades varía 75/90/105 según el caso.

Fase 2 (deliberadamente al final): OCR/lectura automática de documentos para autocompletar RUC/monto/fecha — nunca bloqueante, el flujo manual siempre debe seguir funcionando como respaldo.

#### Bugs de navegación — historial

1. ✅ Resuelto: "Atrás" tras crear una OC → 404. Causa raíz real (confirmada leyendo código, no la teoría original de rewrite/RSC): `packages/auth/src/callback.ts` armaba el redirect post-login con `${origin}${destino}` en string plano, que **nunca antepone el basePath** de Next — mandaba a la persona a la raíz de `erp.logisalud.com` (Cobranzas) en vez de `/compras/...`. Mismo bug en `formulario-login.tsx` (el link del correo del magic link, y el redirect tras verificar el código de 6 dígitos). Los tres puntos ahora usan el patrón de `request.nextUrl.clone()` (que sí antepone basePath solo) o `NEXT_PUBLIC_BASE_PATH` explícito. Esto es un bug de `packages/auth`, compartido — no de la navegación "Atrás" de `apps/compras` en sí, que ya usaba la pila en memoria correctamente.
2. ✅ Resuelto: loop entre "Órdenes de compra" y "Nueva orden de compra de un bien" — la portada del módulo tenía su propio header y nunca se registraba en la pila de navegación; se agregó `<RegistrarPaso>`.
3. ✅ Resuelto: ícono de imagen rota arriba del título — `next/image` no antepone basePath con `images.unoptimized: true`; se arma el `src` a mano con `NEXT_PUBLIC_BASE_PATH`.
4. ✅ Resuelto: "Pago directo" construido (ver menú "Pedir un pago" arriba).
5. ✅ Hecha la auditoría completa de rutas del módulo (ver sesión 2026-08-28) — Dashboard sigue huérfano (ver arriba), pendiente decidir si engancharlo al menú.

Acceso temporal (decisión 2026-08-28, PR #70): todos los usuarios internos autenticados por magic link, sin importar área, ven TODOS los botones y flujos de Compras y Pagos. Reversible con un `UPDATE compras.flags SET valor = false WHERE clave = 'acceso_abierto_temporal'`, sin re-mergear nada. Después se define qué ocultar a quién. NO afecta el flujo `/v/[token]` de vendedores.

### Pedidos — datos migrados, sin pantallas construidas

162 productos, 3,399 clientes reales migrados desde proyecto de Andrés. Mapeo de roles: administrador→admin, control_pedidos→ventas, aprobador_comercial→gerencia, operaciones→almacen, vendedor→ventas. Diseñado no construido: `facturas_emitidas`, función `emitir_factura()` (security definer) para Pedido→Factura→Cobranza, reutilizando el flujo existente de Andrés hacia `documentos` de Cobranzas (nunca un camino paralelo). Tarjeta "Próximamente" hasta tener el ciclo completo (crear → aprobar → despachar → facturar → cuenta por cobrar).

## Pendientes de Sebas

- CSV de 162 productos con precio de compra. (falta)
- ~~Confirmar condición de pago real por proveedor~~ — confirmado: default 90 días, Prades varía 75/90/105, no editable por el proveedor.
- ~~Definir monto fijo del fondo de caja chica de Roberto~~ — confirmado: S/600.
- Completar apellido/teléfono de Jose Carlos y Christian (almacén, sin correo — login por SMS pendiente).
- ~~**Tope de S/5,000 y el backlog pre-ERP**~~ — RESUELTO el 2026-09-15 con
  la opción (b): se exime del tope SOLO a la categoría "Regularización de
  pagos antiguos (pre-ERP)" (`CATEGORIAS_EXENTAS_DEL_TOPE` en
  domain/obligacion.ts). El tope sigue rigiendo para todas las demás. La
  excepción muere sola: al desactivar la categoría, nadie puede volver a
  elegirla y el tope vuelve a aplicar sin tocar código. El nombre de la
  categoría lo resuelve la Server Action CONTRA LA BASE, nunca desde el
  formulario — un campo del cliente sería una forma de saltarse el tope
  escribiendo el nombre correcto en el HTML.

## Próximos pasos acordados

1. ~~Auditoría de rutas reales de Compras y Pagos~~ — hecha, ver arriba.
2. ~~Abrir acceso temporal a todos los roles~~ — hecho (PR #70).
3. ~~Reemplazar toda navegación "Atrás" por pila en memoria en TODOS los flujos~~ — hecho, y se encontró y arregló la causa raíz real del 404 (bug de `packages/auth`, no de la pila).
4. Correr checklist de pruebas end-to-end de cada flujo — pendiente de que Sebas navegue producción real.

## Aprendizajes operativos

- Los archivos que Claude (chat) genera NO llegan solos a Claude Code — hay que pegar el contenido completo o adjuntar el archivo real.
- Claude Code corre en entorno de red restringida (no llega directo a *.supabase.co para Admin API) — por eso magic link en vez de scripts con contraseña.
- Meses de trabajo documentados en 40+ PRs numerados en el repo.
- Un bug que "se ve" en una pantalla de `apps/compras` puede tener su causa real en `packages/auth` (compartido por las tres apps) — conviene mirar ahí antes de asumir que es la pantalla.
