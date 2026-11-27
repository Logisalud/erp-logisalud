# Consolidar `apps/pedidos` en el proyecto Supabase compartido

Estado: **plan, no ejecutado.** Escrito el 18/11/2026.

Hoy `apps/cobranzas` y `apps/compras` comparten un proyecto Supabase
(`qpkigzniatidsvnxikox`) y `apps/pedidos` tiene el suyo
(`dfqhxwkdflnkcjnysbwu`). Consolidar es mover el schema `pedidos` al
proyecto compartido y apagar el puente REST entre los dos.

## Por qué

Mientras sean dos proyectos, el cliente vive duplicado y los dos lados se
separan solos. Eso ya costó: los celulares que no coincidían entre los dos
ERP (noviembre 2026) y las 3.330 direcciones que hubo que copiar a mano el
18/11. Hay un puente que tapa el agujero —
`services/contactos-cobranzas.ts` y `services/cartera-desde-cobranzas.ts`,
en el cron diario — pero es una copia que corre una vez por día, no una
fuente única.

Consolidado, los dos ERP leen la misma fila y el puente se borra.

## Lo que ya se midió

| | pedidos | compartido |
|---|---|---|
| Tablas del schema propio | 66 (`pedidos`) | 66 (`public`) + 113 (`wms`) + 8 (`compras`) + otros |
| Usuarios en `auth.users` | 29 (19 activos en 30 días) | 32 (12 activos) |
| Políticas RLS en el schema | 113, sobre 56 tablas | — |
| FK desde `pedidos` a `auth.users` | **0** | — |
| Clientes | 3.568 (`pedidos.customers`, PK uuid) | 6.621 (`public.clientes`, PK ruc) |

Tres cosas que esto dice, y que cambian el tamaño del trabajo:

1. **Pedidos ya vive en su propio schema**, no en `public`. Mover un schema
   entero es mucho más simple que desenredar tablas de `public`.
2. **No hay ninguna FK a `auth.users`.** Los ids de usuario se guardan como
   uuid suelto (por ejemplo `pedidos.audit_logs.actor`). No hay constraints
   que impidan la mudanza; sí queda el trabajo de mapear los ids.
3. **El nombre `pedidos` ya está ocupado en el proyecto compartido**: hay un
   schema `pedidos` con 13 tablas y datos adentro (3.575 filas en
   `audit_logs`, 3.399 en `cliente_config`, 909 en `price_list_items`).
   **Ningún archivo del monorepo lo referencia** — es un intento anterior
   que quedó abandonado. Hay que sacarlo del camino antes de mover nada.

## Las dos decisiones que no son técnicas

**1. Qué hacer con el schema `pedidos` abandonado del proyecto compartido.**
La propuesta es renombrarlo a `pedidos_abandonado_20261118` (reversible, no
borra nada) y revisarlo después con calma. Borrarlo requiere confirmar que
de verdad nadie lo usa fuera del monorepo.

**2. Qué pasa con las cuentas.** Son 29 usuarios de un lado y 32 del otro,
con personas repetidas que tienen ids distintos en cada proyecto. Dos
caminos:

- **Una cuenta por persona** (recomendado): se mapea cada usuario de
  pedidos a su cuenta del proyecto compartido por correo, y se reescriben
  los uuid guardados en las tablas de pedidos. Es el que deja el sistema
  limpio, y es el que tiene el trabajo de mapeo.
- **Migrar `auth.users` tal cual**: más rápido, pero deja a la misma
  persona con dos cuentas y dos contraseñas en el mismo proyecto.

Las contraseñas no se pueden copiar entre proyectos de forma confiable, así
que **en cualquiera de los dos casos hay que avisar a los vendedores** que
van a tener que volver a entrar.

## Fases

Ninguna fase posterior empieza sin que la anterior esté verificada.

**Fase 0 — Ensayo.** Restaurar un volcado del proyecto de pedidos en una
base de prueba (o en una branch de Supabase) y correr ahí la mudanza
completa. Es la fase que dice cuánto dura la ventana real y qué se rompe.
Sin ensayo no hay fecha.

**Fase 1 — Despejar el nombre.** Renombrar el schema `pedidos` abandonado.
Reversible.

**Fase 2 — Cuentas.** Armar la tabla de equivalencias correo → uuid viejo →
uuid nuevo, y revisarla a ojo: son 29 filas, se leen.

**Fase 3 — Mudanza.** Con los dos ERP detenidos: volcar el schema
`pedidos` con sus datos, restaurarlo en el proyecto compartido, reescribir
los uuid de usuario según la tabla de la fase 2, recrear las 113 políticas
RLS y verificar que las 56 tablas quedaron con RLS activo.

**Fase 4 — Repuntar las apps.** Cambiar en Vercel las variables de
`apps/pedidos` al proyecto compartido y desplegar. Dejar las viejas
anotadas hasta confirmar que todo anda.

**Fase 5 — Apagar el puente.** Borrar `services/contactos-cobranzas.ts`,
`services/cartera-desde-cobranzas.ts`, sus rutas de cron y las variables
`COBRANZAS_SUPABASE_URL` / `COBRANZAS_SERVICE_ROLE_KEY`. Recién acá se gana
lo que se buscaba: una sola fila por cliente.

**Fase 6 — Una sola tabla de clientes.** `public.clientes` (6.621, por RUC)
y `pedidos.customers` (3.568, por uuid) siguen siendo dos tablas aunque
vivan en la misma base. Unificarlas es un cambio aparte, con su propio
análisis: son universos distintos (cobranzas tiene todo lo que alguna vez
se facturó; pedidos tiene la cartera que se vende hoy).

## Qué NO hay que hacer

- **No mover el proyecto compartido hacia el de pedidos.** El compartido
  tiene 113 tablas de WMS y los módulos de compras; es el que no se mueve.
- **No hacer la mudanza sin ventana.** Durante la fase 3 los dos ERP tienen
  que estar detenidos: si entra un pedido a mitad de camino, se pierde.
- **No borrar el proyecto viejo** hasta que pase al menos un cierre de mes
  completo sobre el consolidado.
