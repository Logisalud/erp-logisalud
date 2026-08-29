Última actualización: 2026-08-28. Léeme completo antes de tocar código. Actualízame cuando algo cambie de verdad (arquitectura, reglas, estado de módulo) — no en cada sesión.

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
- Supabase consolidado, proyecto único `qpkigzniatidsvnxikox` (Pro), schemas por Bounded Context: `compras`, `servicios`, `almacen`, `cuentas_x_pagar`, `gastos`, `caja_chica`, `financiamiento`, `impuestos`, `catalogo`, `pedidos`, más `public` (perfiles, area_responsables, tablas de Cobranzas). Un solo Supabase con schemas, NO bases aisladas — decisión explícita.
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
