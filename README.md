# erp-logisalud

Monorepo de los sistemas internos de Logisalud.

```
erp-logisalud/
├── apps/
│   ├── cobranzas/      # ERP de Cuentas por Cobrar (Next.js 14 + Supabase)
│   └── pedidos/        # ERP de Pedidos / Operaciones (Next.js 14 + Supabase)
└── packages/
    └── design-system/  # Placeholder — UI compartida (todavía vacío)
```

Las dos apps son **independientes**: cada una tiene su propio proyecto
Supabase, sus propias variables de entorno y su propio deploy. El monorepo
solo comparte el repositorio y el árbol de dependencias de npm.

## Requisitos

Node >= 22 (lo pide `apps/pedidos`; `apps/cobranzas` funciona igual).

## Instalación

```bash
npm install        # una sola vez, en la raíz — instala ambas apps
```

Se usan **npm workspaces**: hay un único `package-lock.json` en la raíz y un
único `node_modules` hoisteado. No corras `npm install` dentro de
`apps/*`.

## Comandos

Desde la raíz:

```bash
npm run dev:cobranzas     npm run dev:pedidos
npm run build:cobranzas   npm run build:pedidos
npm run lint:cobranzas    npm run lint:pedidos
                          npm run test:pedidos
```

O directamente por workspace:

```bash
npm run <script> --workspace erp-logisalud-cobranzas
npm run <script> --workspace erp-logisalud-pedidos
```

## Variables de entorno

Cada app carga su propio `.env.local`, **dentro de su carpeta** (Next lee el
`.env.local` del directorio desde el que se ejecuta, no el de la raíz):

- `apps/cobranzas/.env.local` — ver `apps/cobranzas/.env.local.example`
- `apps/pedidos/.env.local` — ver `apps/pedidos/.env.example`

Apuntan a **proyectos Supabase distintos**. Unificarlos es una fase
posterior y separada; no mezclar.

## Deploy (Vercel)

Un proyecto de Vercel por app, cada uno con su **Root Directory**:

| App       | Root Directory    | Notas                                        |
|-----------|-------------------|----------------------------------------------|
| Cobranzas | `apps/cobranzas`  | Los crons viven en `apps/cobranzas/vercel.json` |
| Pedidos   | `apps/pedidos`    | —                                            |

Vercel detecta npm workspaces solo: instala desde la raíz del repo y
buildea el Root Directory indicado. Conviene activar en cada proyecto
"Include files outside the Root Directory" (viene activo por defecto en
monorepos) y, opcionalmente, *Ignored Build Step* para no redeployar una app
cuando el cambio fue en la otra.

## Autenticación

El login del ERP es **uno solo para todas las apps**, vive en
`packages/auth` y se apoya en Supabase Auth del proyecto consolidado. Las
tablas de perfiles y permisos son `public.perfiles` y
`public.area_responsables`.

### `NEXT_PUBLIC_REQUIRE_LOGIN` — el interruptor del login

Esta variable **empieza y se mantiene en `'false'`**.

Con `'false'` (el estado actual del proyecto):

- La app se abre directo. El middleware **no** redirige a nadie a
  `/login`.
- En el servidor, la app inicia sesión automáticamente con la cuenta
  designada en `TEST_MODE_USER_EMAIL` / `TEST_MODE_USER_PASSWORD`. Esa
  sesión es la que satisface las políticas RLS.
- Todo lo que se cree queda atribuido al `user_id` real de esa cuenta
  (`created_by`, `conformidad_por`, `decidido_por`, …). No hay datos
  huérfanos ni un usuario ficticio que haya que limpiar después.

Con `'true'`:

- El middleware exige sesión: cada persona entra con su propia cuenta.
- Se deja de usar la cuenta de prueba, y cada acción queda asociada a
  quien realmente la hizo.

**Activarlo es decisión exclusiva de Sebas o Andrés**, el día que
decidan lanzar el sistema a todo el equipo. No se activa "de paso" en
otro cambio, ni porque una tarea parezca necesitarlo: el modo existe
para que Sebas pueda seguir probando funcionalidad libremente sin
loguearse, y apagarlo cambia la experiencia de todo el equipo de golpe.

Cambiarlo es un solo cambio de variable de entorno en Vercel más un
redeploy. No hay que reprogramar nada ese día.

### Las políticas RLS no se desactivan nunca

En los dos modos, **RLS está activo en todas las tablas de todos los
schemas**. Lo único que cambia es de quién es la sesión que satisface
las políticas: la cuenta de prueba, o la persona real. Si alguna
pantalla no muestra datos, la respuesta nunca es desactivar RLS — es
revisar qué área tiene el perfil de esa sesión.

### Variables de entorno

Estas van en Vercel (Settings → Environment Variables), nunca
hardcodeadas ni commiteadas:

| Variable | Ámbito | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador + servidor | proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador + servidor | key sujeta a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | tareas administrativas; bypassa RLS |
| `NEXT_PUBLIC_REQUIRE_LOGIN` | navegador + servidor | `'false'` por ahora — ver arriba |
| `TEST_MODE_USER_EMAIL` | **solo servidor** | cuenta de la sesión de prueba |
| `TEST_MODE_USER_PASSWORD` | **solo servidor** | contraseña de esa cuenta |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | navegador + servidor | opcional; ver "sesión compartida" |

Las dos `TEST_MODE_*` **no llevan** el prefijo `NEXT_PUBLIC_` a
propósito: así Next nunca las manda al navegador.

### Sesión compartida entre apps

Que alguien logueado en Cobranzas entre a Compras sin volver a
loguearse requiere que las dos apps compartan el dominio de la cookie
de sesión. Con los dominios `*.vercel.app` **no se puede**: son hosts
distintos y `.vercel.app` está en la Public Suffix List, así que el
navegador rechaza una cookie de dominio padre.

Para tener sesión única hay que poner las apps bajo un dominio propio
(ej. `cobranzas.logisalud.com` y `compras.logisalud.com`) y setear en
las dos `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.logisalud.com`. Hasta
entonces, cada app pide su propio login.

### Configuración en Supabase Authentication

En el dashboard del proyecto consolidado → Authentication → URL
Configuration:

- **Site URL**: la URL de producción de la app principal.
- **Redirect URLs**: agregar `/aceptar-invitacion` de cada app, más los
  dominios de preview de Vercel si se quiere probar invitaciones ahí.

El link de invitación que manda Supabase trae el token en el fragmento
de la URL (`#access_token=...&type=invite`), y la pantalla
`/aceptar-invitacion` es la que lo lee para dejar crear la contraseña.
