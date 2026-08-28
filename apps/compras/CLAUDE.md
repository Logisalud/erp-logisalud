# CLAUDE.md

Guía para trabajar en `erp-logisalud-compras` con Claude Code.

## Antes de tocar cualquier pantalla o tabla de este módulo

**Leer primero [docs/modulo-compras-pagos.md](docs/modulo-compras-pagos.md)
completo.** Es el documento único y obligatorio del módulo — no hace falta
ningún otro archivo aparte. Contiene, sin que nada de esto sea opcional:

- El modelo de datos completo de los 8 schemas (Bounded Contexts).
- Los principios de diseño que gobiernan toda pantalla nueva: **Bounded
  Contexts** (sección 1), **Lenguaje Ubicuo** (sección 2, los términos de
  negocio que hay que usar tal cual, sin traducir a jerga técnica) y la
  **Carta de Simplicidad UX** (sección 3, ocho reglas concretas — un botón
  primario por pantalla, lenguaje del negocio nunca el estado interno de la
  base, cada rol ve solo lo que le toca decidir ahora, etc.).
- La regla de oro del módulo (sección 4), el mapa de flujo (sección 5), los
  roles/RLS (sección 6) y las reglas de negocio que van en Server Actions,
  no en SQL (sección 8).

Si una pantalla nueva no respeta el Lenguaje Ubicuo o la Carta de
Simplicidad UX, está mal aunque el código funcione. No se reinterpretan
estas reglas por PR — se leen del documento cada vez.

## Qué es este módulo

Compras y Pagos: desde que Compras emite una Orden de Compra hasta que
Tesorería paga, pasando por Almacén (recepción, discrepancias), Servicios
(Órdenes de Servicio con conformidad del área usuaria), Cuentas por Pagar
(el embudo único de toda obligación), Gastos/Anticipos, Caja Chica,
Financiamiento e Impuestos. **Una sola app, ocho Bounded Contexts en
carpetas separadas** — nunca ocho apps ni servicios sueltos (ver sección
"Arquitectura de la app" del documento maestro).

Estado (ver sección 9 del documento, "Alcance por Pull Request"):

1. ✅ Migración SQL de los 8 schemas + RLS + Storage.
2. ✅ Compras + Órdenes de Compra (proveedores, productos, OC con líneas).
3. ✅ Almacén + Discrepancias (recepción contra OC, clasificación
   automática, resolución del responsable de Almacén).
4. ✅ Cuentas por Pagar core (obligaciones desde una recepción conforme,
   conciliación de 3 vías, conformidad, propuestas de pago, aprobación de
   Gerencia, pago). Soporta origen `compra`, `gasto_directo`, `reembolso`
   y `anticipo` — los seis restantes (servicio, reposicion_caja_chica,
   préstamo, fraccionamiento, letra, impuesto) dependen de módulos que
   todavía no son pantalla.
5. ⏳ Servicios.
6. ✅ Gastos / Anticipos (solicitud → jefe de área → Contabilidad genera
   la obligación sola → sigue el embudo normal de Cuentas por Pagar → al
   pagarse, un anticipo queda pendiente de rendir; rendición con
   comprobantes, liquidación, reembolso adicional si gastó de más).
7. ✅ Caja Chica (movimientos del fondo con base/IGV real del comprobante —
   nunca inventado, mismo criterio que Gastos — reposición que junta los
   movimientos sin reponer, jefe de Almacén → Contabilidad genera la
   obligación sumando la base/IGV real de cada movimiento, sigue el embudo
   normal de Cuentas por Pagar, al pagarse el fondo queda repuesto y el
   ciclo se cierra directo — sin rendición posterior, a diferencia de un
   anticipo de Gastos, porque los comprobantes ya existían antes de pedir
   la reposición).
8. ✅ Financiamiento + Impuestos (préstamos y fraccionamiento SUNAT con
   cronograma de cuotas transcrito a mano — el sistema nunca calcula una
   amortización —, alerta de cuota vencida en riesgo de perder el
   beneficio, canje de una obligación de compra por letras desde su
   propia pantalla en Cuentas por Pagar, bandeja de vencimientos próximos
   donde Contabilidad genera en lote la obligación de cada cuota/letra por
   vencer — sustituye el "proceso programado" de la regla 6 porque esta
   app todavía no tiene infraestructura de cron —, e Impuestos: Gestión
   Humana carga la planilla desde BUK, Contabilidad confirma y genera la
   obligación).
9. ✅ Dashboard general (Carta de Simplicidad UX, regla 5: prioriza
   visualmente los "loops abiertos" — cuotas de fraccionamiento SUNAT
   vencidas, obligaciones observadas, discrepancias de Almacén sin
   resolver, anticipos sin rendir, facturas de servicio sin conformidad —
   nunca métricas totales; cada loop lleva directo a la pantalla donde se
   resuelve).

## Entorno

- **Proyecto Supabase consolidado**, compartido con `apps/cobranzas` (NO
  uno propio) — ver `.env.example`. `public.perfiles` y
  `public.area_responsables` son la base de auth compartida por todo el
  ERP; `apps/pedidos` todavía tiene su proyecto Supabase aparte hasta que
  se consolide (ver sección 11 del documento maestro, "Nota sobre
  autenticación").
- Se sirve bajo `erp.logisalud.com/compras` vía rewrite desde
  `apps/cobranzas` — mismo host, así que la cookie de sesión de
  `@logisalud/auth` se comparte sola, sin `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`.
- Login real desde el día uno (`@logisalud/auth`) — mismo mecanismo que
  `apps/cobranzas`, sin bypass ni modo de prueba.

## Stack y convenciones

- Next.js 14 (App Router), React 18 (`useFormState`/`useFormStatus`, NO
  `useActionState` — eso es React 19), TypeScript, Tailwind CSS 3.
- **Toda escritura financiera pasa por Server Actions** (`'use server'`),
  nunca inserts directos desde el cliente — regla explícita del documento
  maestro, sección 9.
- `domain/` — reglas de negocio puras, sin Next ni Supabase, testeables
  solo (`tests/domain/*.test.ts`, Vitest). `services/` — a la base, usa
  `crearClienteServidor()` de `@logisalud/auth/server` (anon key, sujeto a
  RLS), nunca la service role para servir una request de negocio.
- RLS por área en los 8 schemas, ya aplicada en las migraciones — ver
  sección 6 del documento maestro para qué área escribe cada Bounded
  Context. Un schema nuevo sin policies deja todo bloqueado salvo admin: no
  es un bug, hay que agregar la policy.
- Cross-schema: PostgREST no embebe relaciones entre schemas distintos en
  un mismo `.select()` (ej. `almacen.recepciones` → `compras.ordenes_compra`,
  o `compras.ordenes_compra_items` → `catalogo.productos`). Se resuelve con
  una segunda consulta y un `Map` en JS — ver `mapaProductos()` en
  `services/ordenes-compra.ts` o `mapaOCsConId()` en
  `services/recepciones.ts` como referencia.
- Catálogo de productos compartido con `apps/pedidos` en `catalogo.productos`
  (no `compras.productos`, que ya no existe). No guarda precios: el de
  compra es de este módulo, el de venta es de Pedidos.

## Identidad de marca

Mismo criterio que `apps/cobranzas` y `apps/pedidos`: `logisalud.green`
(#4BB168) / `logisalud.teal` (#4ABCC2), Oswald (`font-heading`) / Poppins
(cuerpo), `.card`/`.btn-primary`/`.btn-secondary` con `min-h-12`, mobile-first
para los roles operativos (Charlie, Roberto, Jose Carlos, Sandra Chau) —
Contabilidad/Tesorería/Gerencia pueden ser desktop-first.

## Al agregar una migración nueva

`supabase/migrations/`, numeradas secuencialmente, **re-ejecutables**
(`if not exists`, `drop policy if exists`) — un reintento tras un fallo es
lo normal. Mismas dos trampas que en `apps/pedidos`: un `CHECK` nuevo se
valida contra la tabla entera al crearse (normalizar antes si hace falta),
y una FK hacia una tabla que el script todavía no creó va con
`ALTER TABLE ... ADD CONSTRAINT` más abajo, no inline (ver el comentario de
`compras.notas_credito.obligacion_id` en `0001_compras_pagos_schemas.sql`).
