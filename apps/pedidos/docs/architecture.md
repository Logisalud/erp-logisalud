# Arquitectura — erp-logisalud-pedidos

## Alcance de este documento

Este repo es el **módulo de toma, validación, despacho y documentación
electrónica de pedidos** de LOGISALUD. Es un proyecto separado e
independiente del ERP de Cuentas por Cobrar (`erp-logisalud`): repos
distintos, despliegues distintos en Vercel, y — como se explica abajo —
un schema propio dentro de un proyecto Supabase que podría compartirse
con otros sistemas a futuro.

Este documento cubre solo la **Fase 1 (base técnica)**. No describe
modelos de producto, pedido, precios, stock ni integración con NubeFact:
esos llegan en fases posteriores.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS 3** con la identidad visual de marca LOGISALUD
- **Supabase**: Postgres + Auth + RLS
- **Vercel**: hosting y despliegue continuo desde `main`

## Estructura de carpetas

```
app/                  rutas (App Router), layouts, páginas
components/           componentes de UI reutilizables, sin lógica de negocio
features/             módulos de negocio (cada feature agrupa su UI + hooks)
lib/                  utilidades transversales (clientes Supabase, helpers)
services/             lógica de servidor: acceso a datos, integraciones, side effects
domain/               tipos y reglas de dominio puras (sin dependencias de framework)
supabase/migrations/  migraciones SQL versionadas del schema "pedidos"
tests/                pruebas
docs/                 este documento y el resto de la documentación
```

`lib` vs `services`: `lib` son utilidades sin efectos de negocio (p.ej.
el cliente de Supabase); `services` es donde vive la lógica que sí tiene
efectos (escribir un pedido, registrar auditoría, llamar a una API
externa). `domain` no debe importar nada de Next.js/Supabase — son
tipos y funciones puras.

## Decisión: schema Postgres dedicado (`pedidos`)

El proyecto Supabase **ya existe** y podría, a futuro, ser compartido
con otro sistema. Para no asumir nada sobre lo que hay o habrá en ese
proyecto:

- Todas las tablas de este módulo viven en el schema `pedidos`
  (`create schema pedidos`), nunca en `public`.
- Las migraciones de este repo solo crean/alteran objetos dentro de
  `pedidos` (o triggers sobre `auth.users`, que es schema gestionado por
  Supabase Auth y compartido por diseño).
- El cliente de Supabase (`lib/supabase/client.ts`, `server.ts`,
  `admin.ts`) fija `db: { schema: 'pedidos' }`, así que las consultas no
  necesitan prefijar el schema en cada llamada.
- Si en el futuro otro sistema usa el mismo proyecto Supabase con su
  propio schema, este módulo no debería verse afectado ni requerir
  cambios.

## Modelo de autenticación y roles

- Supabase Auth (email/password) gestiona `auth.users`.
- `pedidos.profiles` guarda datos de perfil por usuario; se crea
  automáticamente vía trigger `on_auth_user_created` al registrarse.
- `pedidos.roles` es el catálogo de roles; `pedidos.user_roles` asigna
  roles a usuarios (relación muchos-a-muchos, un usuario puede tener
  más de un rol).
- Roles iniciales: `vendedor`, `control_pedidos`, `aprobador_comercial`,
  `operaciones`, `administrador`. Ver docs/business-rules.md.
- `pedidos.is_admin()` es una función `security definer` que resuelve
  si el usuario autenticado tiene rol `administrador`. Se usa dentro de
  las políticas RLS de `roles` y `user_roles` para evitar el problema
  de que una política sobre `user_roles` necesite consultar
  `user_roles` para saber si el caller es admin (recursión).

## RLS: qué está activo desde el día uno

- `profiles`: cada usuario lee/actualiza solo su propio registro
  (`id = auth.uid()`).
- `roles`: lectura abierta a cualquier usuario autenticado (para
  mostrar nombres de rol en UI); escritura solo `administrador`.
- `user_roles`: cada usuario ve sus propias asignaciones;
  `administrador` ve y gestiona todas.
- `audit_logs`: solo `administrador` puede leer desde el cliente; no
  hay políticas de insert/update/delete para `anon`/`authenticated` (ver
  siguiente sección).

## Decisión: mecanismo de escritura de `audit_logs`

Se evaluaron dos mecanismos:

1. **Trigger genérico** sobre cada tabla de negocio, capturando
   automáticamente cualquier insert/update/delete.
2. **Capa de servicio**: cada acción de negocio (Server Action / Route
   Handler) llama explícitamente a `services/audit-log.ts` para dejar
   constancia.

**Se eligió la capa de servicio como mecanismo principal**, por:

- Las acciones de este módulo (validar pedido, aprobar condiciones
  comerciales, confirmar despacho, emitir documento electrónico) son
  eventos de negocio con nombre propio, no solo "un row cambió". Un
  trigger genérico solo ve el diff de columnas, sin el significado de
  la acción (`accion` en `audit_logs` debe poder ser
  `"pedido.aprobado"`, no `"UPDATE"`).
- Varias acciones futuras (integración con NubeFact, ajustes de stock)
  se ejecutarán con la service role key desde el backend, fuera de una
  sesión de usuario autenticado. Un trigger que dependa de `auth.uid()`
  registraría `actor = null` en esos casos; la capa de servicio puede
  recibir el actor explícitamente (p.ej. el usuario que disparó el job).
- Mantener la lógica de auditoría en un único punto (`logAudit()`)
  permite testearla y evolucionar el formato de `accion`/`entidad` sin
  tocar SQL.

**Excepción, defensa en profundidad:** `pedidos.user_roles` sí tiene un
trigger (`user_roles_audit`) además de lo anterior. Las escaladas de
privilegio son lo bastante sensibles como para no depender de que un
desarrollador recuerde llamar a `logAudit()` si en algún momento se
edita esa tabla directamente (SQL editor, script puntual, migración
manual). El trigger es `security definer` para poder insertar en
`audit_logs` pese a que esa tabla no tiene policy de insert para
`authenticated`.

Cuando en fases posteriores existan tablas de pedidos, la expectativa
es seguir el mismo patrón: capa de servicio como regla, trigger puntual
solo donde la sensibilidad de la tabla lo justifique.

## Notificación por correo al enviar un pedido

Cuando un pedido pasa de `DRAFT` a `SUBMITTED`, se manda un correo con el
detalle completo a todos los destinatarios activos de
`pedidos.order_notification_recipients`. Reemplaza la idea previa de un
PDF descargable dentro de la app.

**Proveedor: Resend.** Elegido por encaje con Next.js sobre Vercel — no
hay que abrir SMTP desde una función serverless — y porque enviar es un
solo `POST`. Por eso `services/email.ts` llama a la API con `fetch`
directo en vez de agregar el SDK: una dependencia menos para un endpoint
que no va a cambiar.

Variables de entorno (ver `.env.example`):

- `RESEND_API_KEY` — key del proyecto en Resend. Solo servidor.
- `RESEND_FROM_EMAIL` — remitente, sobre un dominio **verificado** en
  Resend; sin verificar, Resend rechaza el envío.

Si falta cualquiera de las dos, la app sigue funcionando: el intento
queda como `fallido` en `notification_logs` y
`/admin/configuracion/notificaciones` muestra un aviso. No hay
`throw` en el arranque por una variable de correo ausente.

### El correo nunca bloquea el pedido

`notifyOrderSubmitted` (`services/order-notifications.ts`) **no lanza
nunca**. Corre después del RPC `submit_order` y de la auditoría, cuando
el pedido ya está guardado: un proveedor de correo caído no puede
revertir un pedido válido ni mostrarle un error al vendedor por algo que
no hizo mal. Hay un timeout de 10 s en el `fetch` para que un proveedor
colgado no deje al vendedor esperando.

Los tres desenlaces quedan en `pedidos.notification_logs` con estado
`enviado` / `fallido` / `sin_destinatarios`, para poder reintentar a mano.
El resultado también viaja en `SubmitOrderResult.notificacion`, pero **a
propósito no se le muestra al vendedor**: es una notificación interna a
Operaciones/Facturación, y que falle no es asunto suyo.

### Por qué `notification_logs` y no solo `audit_logs`

`audit_logs` registra acciones de negocio de un actor humano.
`notification_logs` registra el resultado de un efecto externo que puede
fallar sin que nadie se haya equivocado. Tenerlo aparte permite listar
"qué correos fallaron" con un índice sobre `estado` en vez de filtrar
texto dentro de un `jsonb`. El caso `sin_destinatarios` sí se registra
además en `audit_logs`, porque ahí la causa es una decisión de
configuración pendiente.

### Contenido y RLS

El armado del correo es puro y vive en `domain/order-email.ts` — HTML con
estilos **en línea** (los clientes de correo ignoran `<style>` y no
cargan Tailwind), colores de marca, y versión en texto plano para no
quedar HTML-only. Todo dato de la BD pasa por `escapeHtml`.

`order_notification_recipients` tiene policy solo para `administrador`,
sin lectura para otros roles: quién recibe copia de los pedidos es
configuración administrativa. El envío lee la lista con la service role
key, porque quien dispara el correo es un vendedor. `notification_logs`
es de solo lectura para `administrador`; la escritura va también por
service role, porque si registrar un fallo dependiera de una policy, el
registro del fallo podría fallar.

## Despliegue

- Repo y proyecto de Vercel **separados** de `erp-logisalud`.
- Deploy automático configurado desde `main`, sin despliegue a
  producción en esta fase (ver README para el estado exacto del link).

### Migraciones: las aplica la integración de Supabase con GitHub

Las migraciones de `supabase/migrations/` **ya no se aplican a mano**: la
integración de Supabase con GitHub las corre al mergear a `main`. Con
branching activado, además cada pull request recibe su propia base de
preview.

Consecuencia práctica: una migración mergeada se aplica sola, así que
tiene que estar probada **antes** del merge. Se puede correr toda la
cadena contra un Postgres local — el contenedor de desarrollo trae
`postgresql-16` — stubbeando lo que provee Supabase (`auth.users`,
`auth.uid()`, los roles `anon`/`authenticated`/`service_role`, el schema
`storage`).

Dos cosas que se aprendieron aplicándolo por primera vez:

- **La integración lleva su propio historial** en
  `supabase_migrations.schema_migrations`. Las migraciones aplicadas a
  mano antes de activar la integración no están ahí, así que hay que
  registrarlas como aplicadas una única vez (equivalente a
  `supabase migration repair --status applied`) o la integración intenta
  correr todo desde `0001` y falla con "already exists".
- **Conviene que cada migración sea re-ejecutable** (`add column if not
  exists`, `create table if not exists`, `drop policy if exists` antes de
  cada `create policy`, y los constraints guardados por una consulta a
  `pg_constraint`). Un reintento tras un fallo parcial es el caso normal,
  no la excepción.
