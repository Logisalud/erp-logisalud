# erp-logisalud

ERP de Cuentas por Cobrar para un distribuidor farmacéutico peruano (Logisalud).
Next.js 14 (App Router) + Supabase (Postgres). Sin backend separado: las API
routes de Next hablan directo con Supabase usando `supabaseAdmin()` (service
role key, bypassa RLS).

## Entorno

- Proyecto Supabase: `qpkigzniatidsvnxikox` ("erp-cobranzas", org
  `uumzwpffwikkajdpktsf`, región us-east-2). Hay un segundo proyecto
  `pynksandipcubxfavipf` ("logisalud-ritmo") en la misma cuenta — no es el que
  usa esta app; confirmar antes de correr SQL si algo no cuadra.
- `.env.local.example` documenta las env vars (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). No hay
  `.env.local` en este sandbox — no se puede levantar `next dev` contra la
  BD real acá, solo `npm run build` (type-check + compile) y verificación
  directa por SQL vía MCP de Supabase.
- **No existe ningún sistema de login/sesión/auth en toda la app.** No hay
  `usuario`, `actor`, `created_by`, ni Supabase Auth. El único "token" es el
  link público de vendedores (`/v/[token]`), de solo lectura, no identifica
  a nadie del staff. Si una feature necesita saber "quién hizo esto", hay que
  resolverlo con un campo de texto libre (ver `pagos.registrado_por`) o
  construir auth real — no asumas que existe un `auth.uid()` en ningún lado.
- RLS está activado en varias tablas pero **sin policies** — todo el acceso
  real pasa por el service role vía `supabaseAdmin()`, así que RLS es inerte
  desde la app.

## Convenciones de código

- Cada feature = una página `app/<nombre>/page.tsx` (`'use client'`, sin
  server components) + rutas API en `app/api/<nombre>/...` con
  `export const dynamic = 'force-dynamic'` y `supabaseAdmin()`.
- Estilo visual repetido en cada página: header con gradiente
  `linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)`, `LOGISALUD` +
  subtítulo, link "&larr; Menú" a `/`. Tiles de resumen en
  `grid grid-cols-N gap-2.5` con tarjetas blancas bordeadas.
- Flujos de importación pesada (Nubefact, cartera) siguen el patrón
  preview→confirm: `lib/<algo>-parser.ts` (usa `xlsx`, detecta fila de
  headers, matching difuso de columnas) + `app/api/<algo>/preview` +
  `app/api/<algo>/confirmar`.
- Cliente = tabla `clientes`, PK `ruc` (char(11), `^[0-9]{11}$`). Es la
  clave de matching en TODO el sistema (nunca DNI ni id interno).
- Import scripts de una sola vez (como el de WhatsApp) no se hacen con
  scripts en `scripts/` — este repo no tiene esa carpeta. Se resuelven con
  consultas SQL directas vía Supabase MCP (`execute_sql`/`apply_migration`),
  documentando el antes/después.

## Modelo de datos clave

- `documentos`: facturas/boletas/NC/ND (tipo `01`/`03`/`07`/`08`), con
  `forma_pago` (`CONTADO`|`CREDITO`), `contado_pendiente` (override manual
  para marcar un CONTADO como no cobrado).
- `pagos`: pagos reales contra un `documento_id`. Campo `tipo`
  (`pago`|`retencion`, para la retención de IGV 3%). Desde ago-2026 también
  tiene `estado_verificacion` (`pendiente_confirmar`|`confirmado`),
  `confirmado_en`, `registrado_por` (texto libre), `investigado` +
  `investigado_comentario` + `investigado_en` — ver sección de historial.
- `v_cobros` / `v_saldos`: vistas que calculan saldo pendiente y aging. Son
  la fuente de verdad de "cuánto debe cada factura" — cualquier cambio de
  regla de negocio sobre saldos pasa por acá. `v_saldos` depende de
  `v_cobros` (vía CTE `cobros_agg`), así que un cambio en `v_cobros` se
  propaga solo.
- `movimientos_banco_import` + conciliación bancaria: importa el extracto,
  clasifica movimientos (`cobro`/`no_cobranza`), y linkea `pago_id` cuando
  hay match. Auto-match es SOLO por `operacion_numero` exacto == `referencia`
  del pago (`app/api/conciliacion/auto/route.ts`). Confirmación manual de
  sugerencias en `app/api/conciliacion/confirmar/route.ts`.
- `clientes.vendedor_actual_id` / `vendedor_anterior_id` / `vendedor_manual_id`
  / `fecha_reasignacion`: asignación de vendedor. Trigger
  `trg_vendedor_efectivo` (BEFORE INSERT/UPDATE OF `codigo_zona`,
  `vendedor_manual_id` ON `clientes`) recalcula `vendedor_actual_id`:
  prioridad `vendedor_manual_id` > zona (`digemid_zona_vendedor.codigo_zona
  → vendedor_id`) > deja el actual. Reasignaciones masivas por vendedor
  saliente se hacen actualizando `vendedor_actual_id` DIRECTO (no dispara el
  trigger, que solo escucha `codigo_zona`/`vendedor_manual_id`) — así se hizo
  con Karina (CRP1006→CRP1008, precedente que ya no está en la tabla, ver
  más abajo) y con Karem (CRP1004→Romina CRP1013, ago-2026).
- `digemid_zona_vendedor`: PK `codigo_zona`, tabla de una sola fila por zona
  → vendedor. Es la que hay que actualizar para que clientes NUEVOS o
  reasignados de esa zona caigan en el vendedor correcto vía el trigger.
- `letras`: letras de cambio, independientes de `pagos` (estado propio:
  `en_cartera`/`en_banco`/`pagada`/`protestada`). No pasan por
  `estado_verificacion`.

## Convenciones de negocio importantes

- **RUC es la clave universal** para matchear clientes contra cualquier
  Excel externo (WhatsApp, incentivos, etc.) — nunca nombre ni DNI.
- **CONTADO vs CRÉDITO**: hasta ago-2026, CONTADO se asumía pagado por
  default salvo `contado_pendiente=true`. Desde el **2026-08-11**, esa regla
  solo aplica a facturas con `fecha_emision < 2026-08-11` (histórico, sin
  tocar). Las CONTADO emitidas desde esa fecha en adelante requieren un pago
  real registrado, igual que crédito — la fecha de corte está *hardcodeada
  como literal* en `v_cobros`/`v_saldos` (no es `CURRENT_DATE`, a propósito:
  si fuera dinámica el corte se movería todos los días). Ver
  `supabase/migrations/20260811_pagos_estado_verificacion_bancaria.sql`.
- **Verificación bancaria de pagos** (mismo cambio, ago-2026): un pago con
  voucher entra como `pendiente_confirmar`; pasa a `confirmado` solo cuando
  la conciliación bancaria (auto o manual) lo matchea contra el extracto
  real. Esto es *puramente informativo* — el saldo de la factura baja igual
  de inmediato con cualquier pago, sin importar su estado de verificación
  (`v_cobros`/`v_saldos` suman TODOS los pagos sin filtrar por
  `estado_verificacion`; no cambiar eso sin querer). Pantalla
  `/pagos-sin-confirmar` alerta pagos viejos sin confirmar (umbral en
  `lib/config-pagos.ts`: 2 días CONTADO / 5 días CRÉDITO, días calendario no
  hábiles, solo alerta desde `ALERTAS_DESDE` para no inundar con histórico).
- **`registrado_por`** es texto libre (no hay login) — cuidado con
  computadoras compartidas; es editable después si quedó mal atribuido
  (`PATCH /api/pagos/[id]`).
- **Casos especiales de cliente** viven en `vendedor_manual_id` (override
  sobre la regla de zona). Ejemplo real: M&M (RUC `20370715107`) va a
  "Distribuidoras" (`CODI01`) para cobranza en este ERP, aunque para
  reportes de ventas/comerciales se trata aparte como "Oficina Logissa"
  (regla que vive fuera de este ERP, no tocar). Cuando busques un cliente
  por nombre parcial tipo "M & M", esperá varios resultados — confirmá por
  `vendedor_manual_id` ya seteado o pedile al usuario el RUC exacto antes de
  tocar nada.
- **Ex-vendedores**: se marcan `activo=false`, nunca se borran (aunque el
  precedente de Karina/CRP1006 sugiere que en algún punto sí se borró en vez
  de desactivar — inconsistencia histórica conocida, no la repliques).
- Vendedores "categoría" (no personas reales) son legítimos en la tabla
  `vendedores` — ej. `CODI01` "Distribuidoras". No necesitan tratamiento
  especial, son un vendedor más.

## Hábitos de trabajo esperados en este repo (pedidos explícitamente por el usuario, repetidos en varias tareas)

1. Antes de cualquier cambio de esquema/vista/reasignación masiva: reportar
   el impacto primero (conteos, montos, antes/después) y esperar
   confirmación explícita.
2. Snapshot (`create table X_backup_YYYYMMDD as select * from X`) antes de
   cualquier UPDATE/ALTER masivo.
3. Cambios de código: **una rama y un PR por cambio**, siempre desde
   `main` actualizado, con `npm run build` en verde antes de pushear.
   Rama nueva después de cada merge: nunca seguir pusheando a una rama
   cuyo PR ya se mergeó — el commit queda huérfano, sin PR que lo lleve a
   `main`, y la app sigue mostrando lo viejo (pasó con #18/#20).
   El merge lo hace **auto-merge**: entra solo cuando el CI queda en
   verde. Excepción: los PRs que tocan `supabase/migrations/` los mergea
   una persona a mano — ver el README de la raíz.
4. Verificación de "no rompiste nada": para cualquier cambio que toque
   saldos/cartera, `SUM(saldo_pendiente)` de `v_saldos` debe ser idéntico
   antes y después salvo que el cambio esté explícitamente diseñado para
   modificarlo (y en ese caso, mostrar el impacto exacto antes de aplicar).
5. Al pegar UUIDs a mano en SQL: preferir subconsultas por `codigo`/clave
   natural (`(select id from vendedores where codigo = 'CRP1013')`) en vez
   de copiar el UUID literal — ya hubo un error de transcripción de UUID en
   una sesión anterior (mezclar el prefijo de un id con el sufijo de otro).
