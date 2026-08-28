# Estado actual de apps/pedidos en el monorepo

Inventario verificado contra el código en `main` (`15195c4`), no contra lo
que "debería ser". Cada punto está marcado **OK**, **PENDIENTE** o
**ATENCIÓN**.

> **Tres premisas del pedido original ya no son ciertas.** La migración no
> es reciente: `main` avanzó **57 commits** desde entonces. La base de datos
> **ya se unificó** (Pedidos vive en el proyecto Supabase de Cobranzas).
> `packages/design-system` **ya no es un placeholder**. Detalle abajo.

---

## 1. Estructura actual

### Árbol real

```
erp-logisalud/
├── apps/
│   ├── cobranzas/     ERP de Cuentas por Cobrar
│   ├── compras/       ← NUEVO: Compras y Pagos (no existía en la migración)
│   └── pedidos/       ERP de Pedidos / Operaciones
├── packages/
│   ├── auth/          ← NUEVO: login y sesión compartidos (@logisalud/auth)
│   └── design-system/ ← YA NO es placeholder (@logisalud/design-system)
├── docs/              autorizacion-cobranzas.md
├── scripts/           migrar-datos-pedidos.ts, seed-usuarios.ts, usuarios-erp.csv
├── .github/workflows/ backup.yml, ci.yml, marcar-migraciones.yml
├── package.json       npm workspaces
└── package-lock.json  único, en la raíz
```

**ATENCIÓN — el monorepo tiene tres apps, no dos.** `apps/compras` entró
entre los PRs #17 y #53 y hoy es el módulo con más movimiento reciente.
Cualquier plan que asuma "Cobranzas + Pedidos" está desactualizado.

### Qué vive en apps/pedidos

`app/`, `components/`, `domain/`, `features/`, `lib/`, `services/`,
`supabase/`, `tests/`, `docs/`, más `middleware.ts`, `next.config.mjs`,
`tailwind.config.ts`, `vitest.config.ts`, `tsconfig.json`, `.eslintrc.json`,
`.env.example`, y los documentos `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`,
`README.md`.

### Tooling "impeccable" — PENDIENTE (sin cambios)

`apps/pedidos/.github/` sigue conteniendo `agents/`, `hooks/` y `skills/`.
GitHub solo lee `.github/` de la raíz del repo, así que **esa tooling sigue
sin levantarse**. Lo único que se movió a la raíz en su momento fue
`workflows/ci.yml`. Sigue exactamente como se documentó: pendiente de
decidir si se sube a la `.github/` raíz o se descarta.

### package.json raíz — OK

Workspaces `apps/*` + `packages/*`, `engines.node >= 22`, y scripts por app
para las tres (`dev:`, `build:`, `lint:` de cobranzas/pedidos/compras, más
`test:pedidos`). Un solo `package-lock.json` en la raíz.

**Hueco menor:** no hay `test:compras` en los scripts raíz, aunque
`apps/compras` sí tiene suite (146 tests) y el CI la corre por workspace.

### Compilación independiente — OK

Verificado en esta sesión, desde cero (`npm ci` en la raíz):

| App | lint | tests | build |
|---|---|---|---|
| `apps/pedidos` | ✅ sin warnings | ✅ 18 archivos / **223 tests** | ✅ |
| `apps/cobranzas` | — (sin ESLint) | — (sin suite) | ✅ |
| `apps/compras` | — (sin ESLint) | ✅ 11 archivos / **146 tests** | ✅ |

Las tres compilan de forma independiente. Salida global exit code 0.

---

## 2. CI/CD

### GitHub Actions — OK, con huecos conocidos

`.github/workflows/ci.yml` corre en `push` y `pull_request` sobre `main`,
con tres jobs paralelos:

| Job | Qué corre | Qué NO corre |
|---|---|---|
| `pedidos` | lint + test + build | — |
| `cobranzas` | build | lint, tests |
| `compras` | test + build | lint |

Los huecos son deliberados y están comentados en el propio workflow:
Cobranzas y Compras no tienen configuración de ESLint (`next lint` abriría
el asistente interactivo), y Cobranzas no tiene suite de tests. El build sí
hace type-check completo de TypeScript en las tres.

**Sin cubrir:** `packages/auth` y `packages/design-system` no tienen job
propio. Se validan solo indirectamente, a través del build de las apps que
los consumen — y hoy `@logisalud/design-system` lo consume **solo**
`apps/compras`, así que una regresión ahí no la ve nadie más.

Otros workflows en la raíz: `backup.yml` (pg_dump diario del proyecto
Supabase) y `marcar-migraciones.yml`.

### Vercel "Ignored Build Step" — PENDIENTE / no verificable del todo

Lo que sí pude confirmar por la API de Vercel: en el team **LOGISALUD**
(`logisalud1`, plan hobby) existe **un solo proyecto**,
`erp-logisalud-pedidos`, enlazado a `Logisalud/erp-logisalud`, con el último
deployment de producción en estado READY.

Consecuencias:

- **No hay Ignored Build Step configurado que yo pueda confirmar**, y con un
  único proyecto en este team el problema del redeploy cruzado no se
  manifiesta acá.
- **Los proyectos de Cobranzas y Compras no están en este team.** Viven en
  otra cuenta de Vercel (la de Sebastián, en el caso de Cobranzas), fuera de
  mi alcance. Esto explica por qué los deployments disparados desde este repo
  no le aparecían a él: no es un problema del repo ni del trigger.
- En cuanto Cobranzas o Compras se conecten a este mismo repo, **el Ignored
  Build Step pasa a ser necesario**, o cada push va a redeployar las tres
  apps. Para el proyecto de Pedidos sería:
  `git diff --quiet HEAD^ HEAD -- apps/pedidos packages package-lock.json`

**ATENCIÓN menor:** el proyecto de Vercel corre **Node 24.x**, mientras el
CI usa Node 22 y `engines` declara `>=22`. Hoy no rompe nada, pero es una
divergencia real entre lo que valida CI y lo que ejecuta producción.

---

## 3. Base de datos y variables de entorno

### ATENCIÓN — la unificación de base de datos YA OCURRIÓ

**La premisa "apps/pedidos sigue apuntando a SU PROPIO proyecto Supabase" es
falsa a hoy.** No fue un cambio accidental: fue una fase deliberada
(PRs #22–#30), pero cambia por completo el panorama.

Evidencia, de `apps/pedidos/supabase/migrations/README.md`:

> `1000_pedidos_unificado_base.sql` es el punto de partida real del schema
> `pedidos` en el **proyecto Supabase consolidado** (`qpkigzniatidsvnxikox`).

Ese ref, `qpkigzniatidsvnxikox`, es **el mismo** que aparece en
`.github/workflows/backup.yml`, el backup de Cobranzas. Es decir: Pedidos y
Cobranzas comparten hoy un único proyecto Supabase.

Lo que Pedidos dejó de tener como propio:

| Antes en `pedidos` | Ahora |
|---|---|
| `customers` | `public.clientes` + extensión `pedidos.cliente_config` |
| `sellers` | `public.vendedores` + `pedidos.vendedor_usuario` |
| `zones` | `public.digemid_zona_vendedor`, por `codigo_zona` |
| `suppliers` | `compras.proveedores` |
| `products` | `catalogo.productos` |
| `profiles`, `roles`, `user_roles` | `public.perfiles` (`area` + `rol`) |

Las migraciones `0001`–`0052` quedaron como **referencia histórica, no
correr**: son del proyecto Supabase separado anterior y nunca se aplicaron
al consolidado. El esquema vigente es `1000`–`1006`.

**Lo que sí sigue OK:** los tres clientes Supabase de la app
(`lib/supabase/client.ts`, `server.ts`, `admin.ts`) siguen declarando
`db: { schema: "pedidos" }`. La app sigue leyendo y escribiendo en su propio
schema; lo que cambió es que ese schema ahora vive en la base compartida.

**Documentación desactualizada por este cambio** (vale corregirla antes de
que confunda a alguien):
- `docs/architecture.md:7` — dice que Pedidos es "independiente del ERP de
  Cuentas por Cobrar: repos separados".
- `docs/data-model.md:5` — dice "Todo vive en el schema `pedidos`".

### Aislamiento de código — OK

`apps/pedidos` **no importa** `@logisalud/auth` ni
`@logisalud/design-system`. Sigue con su propio `lib/auth/` y su propio
Tailwind. Es la única de las tres apps que sigue 100% autocontenida a nivel
de código.

### Variables de entorno que espera apps/pedidos

De `.env.example`:

| Variable | Para qué | Estado |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto consolidado | requerida |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente navegador (RLS) | requerida |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor | requerida |
| `RESEND_API_KEY` | correo al enviar pedido | opcional |
| `RESEND_FROM_EMAIL` | remitente, dominio verificado | opcional |
| `NUBEFACT_API_URL` | declarada, sin uso todavía | inactiva |
| `NUBEFACT_API_TOKEN` | declarada, sin uso todavía | inactiva |

**No pude confirmar qué variables están efectivamente cargadas en Vercel**:
las herramientas disponibles no exponen las env vars del proyecto. Lo único
que puedo afirmar es indirecto: el último deployment de producción está
READY, y la app no arranca sin las tres de Supabase, así que **esas tres
están cargadas y son válidas**. Sobre `RESEND_API_KEY` y `RESEND_FROM_EMAIL`
no tengo evidencia técnica de que se hayan agregado — la app funciona igual
sin ellas (el pedido se envía y el intento queda registrado como fallido en
`pedidos.notification_logs`). **La verificación real es la pantalla
`/admin/configuracion/notificaciones`, que avisa cuando faltan.**

---

## 4. Estado funcional de Pedidos

### Tests — OK, y crecieron

**223 tests en 18 archivos, todos pasando.** Eran 216 en 17 archivos al
momento de la migración: +7 tests, +1 archivo. Lint limpio, build OK.

Cobertura por archivo: `combobox`, `draft-viewer`, `customer-import`,
`customer-search`, `customers`, `fechas`, `fulfillment`, `nubefact-draft`,
`order-email`, `order-header`, `order-status`, `orders`, `price-list-import`,
`products`, `versioning`, `zones`, `env`, `order-excel`.

### Código previo a la migración — OK, íntegro

| Feature | Dónde vive hoy | Estado |
|---|---|---|
| IGV corregido (no se duplica) | `0051_igv_incluido_en_precio.sql` + `domain/orders.ts` | ✅ |
| Catálogo reconciliado con NubeFact | `0052_reconciliar_catalogo_nubefact.sql` | ✅ |
| Rediseño de toma de pedido | `app/pedidos/nuevo/` | ✅ |
| "Mis pedidos" (pestañas + paginado) | `app/pedidos/page.tsx` + `domain/order-status.ts` | ✅ |
| Descarga de Excel | `app/pedidos/[id]/excel/route.ts` | ✅ |
| Descarga de JSON (borradores) | `app/control-pedidos/documentos/` | ✅ |
| Auditoría de IGV inflado | `docs/consultas/auditoria-igv-inflado.sql` | ✅ |

Nada se perdió ni se degradó en el traslado.

---

## 5. Pendientes consolidados

### Datos de negocio

| # | Pendiente | Estado | Notas |
|---|---|---|---|
| 1 | **Canal de venta real** | PENDIENTE — **el más urgente** | Los **3.399** clientes migrados (no 3.402) entran con canal `Horizontal`, supuesto explícito. El precio se busca por canal: si el canal real era otro, **el vendedor ve el precio equivocado**. `business-rules.md:514` |
| 2 | **Condición de pago habitual** | PENDIENTE | `condicion_pago_habitual_id = null` en los 3.399. Consecuencia resuelta en `0043`: sin habitual, cualquier condición se acepta sin excepción administrativa. El costo es que el sistema no puede detectar una condición inusual. |
| 3 | **UBIGEO / dirección de entrega** | PENDIENTE | El origen no trae ninguno de los dos (**0 de 3.399**). Se captura en demanda: `orders.customer_address_id` es `not null`, y "Nuevo pedido" bloquea al elegir cliente sin dirección. No es bloqueante para operar, sí lo es por cliente la primera vez. |
| 4 | **Peso de productos** | PENDIENTE — bloquea GRE | `peso_unitario` null. `buildGuiaBorrador` calcula igual pero **advierte** qué productos faltan y que `peso_bruto_total` está incompleto. SUNAT exige el peso real. |
| 5 | **`es_agente_retencion`** | PENDIENTE | Queda en `false` por default. Atado a los supuestos de retenciones de Fase 6. |
| 6 | **Asteriscos en razón social** | PENDIENTE (menor) | 21 de 3.399 traen `*` al inicio, tipeados a mano en el CSV del piloto. Se limpian solo para mostrar (`displayRazonSocial`); el dato original queda intacto. Falta decidir si significaban algo. |

### Reglas a confirmar con Contabilidad

| # | Pendiente | Estado |
|---|---|---|
| 7 | **Tratamiento tributario de bonificaciones** | PENDIENTE. Supuesto: siguen el tratamiento estándar del comprobante. De 207 códigos `BO` en NubeFact solo 2 figuran inafectos (`BODHP109`, `BODHP110`), sin patrón. Decisión 2026-08-14: se tratan como **error de carga, no como regla**. **No implementar lógica tributaria sin esta confirmación.** |
| 8 | **Umbral de retención por comprobante vs. por pedido** | PENDIENTE. Supuesto: se calcula por comprobante emitido. Afecta el diseño de NubeFact/retenciones. |

### Integraciones y catálogo

| # | Pendiente | Estado |
|---|---|---|
| 9 | **FACTURA vs BOLETA** | ✅ **OK — sigue implementado como se decidió.** `resolverTipoComprobante` (`domain/nubefact-draft.ts:146`): si el cliente admite uno solo, ese es; si admite ambos, **no adivina en silencio** — usa FACTURA como placeholder y emite la advertencia "confirmar antes de emitir". La decisión real la toma la facturadora. `orders` no guarda la elección, y eso está documentado como hueco consciente del modelo. |
| 10 | **16 productos desactivados** | ✅ **OK — siguen inactivos.** Verificado: exactamente 16 filas `'inactivo'` en `1002_catalogo_productos_datos.sql`, todas con la nota "no está en el catálogo de NubeFact, no se puede facturar". Sobrevivieron intactos a la unificación del catálogo. |
| 11 | **API real de NubeFact** | PENDIENTE — sigue en modo borrador. TODOs explícitos en `services/electronic-documents.ts:19`, `services/fulfillments.ts:349`, `0046:216` y `0048:4`. `NUBEFACT_API_URL`/`_TOKEN` declaradas y vacías. Al despachar solo se generan borradores JSON locales para revisión humana. |

### Plataforma y arquitectura

| # | Pendiente | Estado |
|---|---|---|
| 12 | **`packages/design-system`** | PARCIAL — **ya no es placeholder.** Tiene tokens de marca como preset de Tailwind, `BrandMark` y los assets del logo. Pero **solo `apps/compras` lo consume**: Pedidos y Cobranzas siguen con su propio Tailwind. La extracción está hecha; falta la adopción en las otras dos apps. |
| 13 | **`apps/pedidos/.github/`** | PENDIENTE — sin cambios. `agents/`, `hooks/` y `skills/` siguen dentro de la app, donde GitHub no los lee. |
| 14 | **Ignored Build Step en Vercel** | PENDIENTE — ver sección 2. Hoy no muerde porque hay un solo proyecto en el team; muerde apenas se conecte una segunda app al mismo repo. |
| 15 | **Docs desactualizados por la unificación** | ATENCIÓN — `architecture.md:7` y `data-model.md:5` describen a Pedidos como repo y base separados. Ya no es cierto. |
| 16 | **Node 22 (CI) vs Node 24 (Vercel)** | ATENCIÓN menor — divergencia entre lo que valida CI y lo que ejecuta producción. |
| 17 | **Sin infra de test para RLS** | PENDIENTE — `tests/domain/orders.test.ts` es un proxy; la garantía real vive en las policies de `0033` y en que `submit_order()` no acepta precios como parámetro. No hay pgTAP ni Supabase local. TODO post-Fase-4. |
| 18 | **Nunca implementado (por fase, no por olvido)** | Stock (ninguna reserva antes del despacho), promociones / bonificaciones / escalas de precio, GRE real, despacho real. `READY_FOR_OPERATIONS` es el punto de enganche de todos — ver `workflows.md`. |
| 19 | **`zone_assignments.vendedor`** | PENDIENTE — es `uuid not null` y no puede sincronizarse con `sellers.user_id` mientras ese campo sea `NULL`, que hoy es el caso de toda la cartera. `data-model.md:33`. |

---

## Lo primero que yo haría

1. **Canal de venta de los 3.399 clientes** (#1). Es el único pendiente que
   hoy produce un resultado **incorrecto y silencioso** — un precio mal
   calculado que nadie detecta. Todos los demás o bloquean con un mensaje
   claro, o advierten, o simplemente no existen todavía.
2. **Corregir `architecture.md` y `data-model.md`** (#15). Son diez minutos
   y evitan que alguien diseñe sobre una arquitectura que ya no existe.
3. **Decidir el destino de `apps/pedidos/.github/`** (#13). Lleva abierto
   desde la migración y no cuesta nada cerrarlo en un sentido u otro.
