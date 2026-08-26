# Seguridad — erp-logisalud-pedidos

## Variables de entorno

| Variable | Dónde se usa | Expuesta al navegador |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente y servidor | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente y servidor | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor | **No, nunca** |

Cualquier variable con prefijo `NEXT_PUBLIC_` termina en el bundle de
JavaScript que llega al navegador. Por eso `SUPABASE_SERVICE_ROLE_KEY`
**no** lleva ese prefijo: solo debe estar disponible en runtime de
servidor (Server Components, Server Actions, Route Handlers).

## La service role key nunca se expone al frontend

- El único lugar del código que puede leer `SUPABASE_SERVICE_ROLE_KEY`
  es [`lib/supabase/admin.ts`](../lib/supabase/admin.ts).
- Ese archivo importa `server-only` en la primera línea. Si algún
  componente cliente (`"use client"`) intenta importarlo, el build de
  Next.js falla en tiempo de compilación en lugar de filtrar la key en
  producción.
- `services/` (que sí puede usar el cliente admin) solo debe ser
  importado desde Server Actions o Route Handlers, nunca desde
  componentes cliente.
- La anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) es segura para exponer:
  su alcance está limitado por las políticas RLS de cada tabla, no por
  mantenerla en secreto.

## `.env.local` nunca se sube a git

`.gitignore` excluye explícitamente `.env`, `.env*.local` y `.vercel/`.
`.env.example` documenta qué variables existen, sin valores reales.
Antes de hacer commit de cualquier archivo `.env*`, confirmar que no
está siendo trackeado: `git status` no debería mostrarlo.

## RLS como defensa principal, no la única

Todas las tablas del schema `pedidos` tienen RLS activado desde su
creación (ver docs/architecture.md). Aun así:

- El cliente admin (`service role`) **bypassa RLS por diseño** — es
  responsabilidad de cada función en `services/` validar lo que
  corresponda antes de escribir.
- Las políticas de `roles`/`user_roles` dependen de
  `pedidos.is_admin()`; si esa función cambia de definición, revisar
  que no introduzca una vía para que un usuario no-administrador se
  autoasigne el rol `administrador`.

## Pendiente para fases posteriores

- Credenciales de NubeFact (aún no integrado): deberán tratarse con el
  mismo criterio que `SUPABASE_SERVICE_ROLE_KEY` — solo servidor, nunca
  en el bundle de cliente.
- Rotación de la service role key y de credenciales de integraciones:
  a definir junto con el equipo de infraestructura cuando exista un
  proceso de despliegue a producción.
