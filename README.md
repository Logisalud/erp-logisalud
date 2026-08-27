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
npm run dev:cobranzas     npm run dev:compras     npm run dev:pedidos
npm run build:cobranzas   npm run build:compras   npm run build:pedidos
npm run lint:cobranzas    npm run lint:compras    npm run lint:pedidos
                                                  npm run test:pedidos
```

O directamente por workspace:

```bash
npm run <script> --workspace erp-logisalud-cobranzas
npm run <script> --workspace erp-logisalud-compras
npm run <script> --workspace erp-logisalud-pedidos
```

## Variables de entorno

Cada app carga su propio `.env.local`, **dentro de su carpeta** (Next lee el
`.env.local` del directorio desde el que se ejecuta, no el de la raíz):

- `apps/cobranzas/.env.local` — ver `apps/cobranzas/.env.local.example`
- `apps/compras/.env.local` — ver `apps/compras/.env.example`
- `apps/pedidos/.env.local` — ver `apps/pedidos/.env.example`

`cobranzas` y `compras` apuntan al **mismo** proyecto Supabase (el
consolidado): cobranzas usa el schema `public`, compras usa sus 8 schemas
(`compras`, `servicios`, `almacen`, `cuentas_x_pagar`, `gastos`,
`caja_chica`, `financiamiento`, `impuestos`). `pedidos` todavía apunta a un
proyecto aparte; consolidarlo es una fase separada.

## Cómo entra un cambio a producción

Una rama y un PR por cambio, siempre desde `main` actualizado. **Rama nueva
después de cada merge**: si se sigue pusheando a una rama cuyo PR ya se
mergeó, el commit queda huérfano — no hay PR que lo lleve a `main`, el CI
no lo mira, y la app en producción sigue mostrando lo viejo sin que nada
falle. Pasó con el #18/#20.

El merge lo hace **auto-merge**: se activa al abrir el PR y GitHub lo
mergea solo cuando el CI queda en verde. Si el CI falla, el PR se queda
esperando; no entra nada roto.

El CI (`.github/workflows/ci.yml`) corre en cada PR contra `main`:

| Job | Qué corre |
|---|---|
| `apps/pedidos` | lint, test, build |
| `apps/cobranzas` | build (type-check completo; no tiene ESLint ni tests) |
| `apps/compras` | build (ídem) |

### Las migraciones se mergean a mano

Los PRs que tocan `supabase/migrations/` **quedan fuera del auto-merge**.
Mergear a `main` deploya a producción y, con la integración de Supabase con
GitHub, aplica las migraciones contra la base real — y eso no se deshace
con un revert del código: la base ya cambió. Un `CHECK` nuevo se valida
contra la tabla entera al crearse, y una migración que no sea
re-ejecutable deja el esquema a medias si hay que reintentar.

`.github/workflows/marcar-migraciones.yml` le pone la etiqueta `migracion`
al PR y deja un comentario. Marca y avisa, no bloquea: un check requerido
que bloqueara también impediría el merge manual, que es justamente lo que
hay que poder hacer ahí.

La red de seguridad es el backup diario (`.github/workflows/backup.yml`,
5:00 UTC, retención 90 días), más un snapshot manual por
`workflow_dispatch` antes de cualquier migración grande.

## Deploy (Vercel)

Un proyecto de Vercel por app, cada uno con su **Root Directory**:

| App       | Root Directory    | Notas                                        |
|-----------|-------------------|----------------------------------------------|
| Cobranzas | `apps/cobranzas`  | Tiene el dominio `erp.logisalud.com`. Los crons viven en `apps/cobranzas/vercel.json` |
| Compras   | `apps/compras`    | `basePath: '/compras'`; se sirve por rewrite desde cobranzas |
| Pedidos   | `apps/pedidos`    | —                                            |

Vercel detecta npm workspaces solo: instala desde la raíz del repo y
buildea el Root Directory indicado. Conviene activar en cada proyecto
"Include files outside the Root Directory" (viene activo por defecto en
monorepos) y, opcionalmente, *Ignored Build Step* para no redeployar una app
cuando el cambio fue en la otra.

## Dominio y ruteo entre apps

El ERP se sirve todo bajo **`https://erp.logisalud.com`**, que apunta al
proyecto de Vercel de **cobranzas**. Las demás apps entran por path:

| URL | Qué responde |
|---|---|
| `erp.logisalud.com/` | `apps/cobranzas` (Cuentas por Cobrar) |
| `erp.logisalud.com/v/[token]` | vista del vendedor, sin login |
| `erp.logisalud.com/compras` | `apps/compras`, vía rewrite |

`apps/compras` tiene `basePath: '/compras'`, así que sus rutas y sus assets
de `_next/` ya salen prefijados y el rewrite de cobranzas es un pasamanos
directo, sin reescrituras extra.

**Esto es lo que hace que la sesión se comparta entre apps**: el navegador
solo habla con `erp.logisalud.com`, así que la cookie de Supabase queda
scopeada a ese host y vale para las dos. No hace falta
`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` mientras las apps se sirvan por path desde
el mismo dominio.

Dos cuidados con este armado:

- El middleware de Next corre **antes** de los rewrites de `next.config`, así
  que cobranzas tiene que excluir `/compras` de su middleware — si no, el
  `/compras/login` de la otra app cae en el `/login` de cobranzas y queda
  inalcanzable. Cada app autentica lo suyo.
- `COMPRAS_APP_URL` tiene que apuntar a la URL de producción del proyecto de
  compras. Si falta, el rewrite no se registra y `/compras` devuelve 404 — a
  propósito, para que un deploy de cobranzas nunca quede proxeando a un
  destino inexistente.

### Protección de deployments y links de vendedor

En el proyecto de cobranzas la protección de deployments está en **"all
except custom domains"**: `erp.logisalud.com` queda accesible, y los dominios
`*.vercel.app` quedan protegidos.

Por eso los links de vendedor **tienen que armarse contra el dominio propio**.
`app/api/base-url/route.ts` devuelve `NEXT_PUBLIC_APP_URL` si está definida, y
solo cae a `VERCEL_PROJECT_PRODUCTION_URL` si no — porque esa variable de
Vercel devuelve el `*.vercel.app`, que está protegido, y un link armado contra
él le pide login de Vercel a un vendedor que no tiene cuenta.

**`NEXT_PUBLIC_APP_URL=https://erp.logisalud.com` es obligatoria** en el
proyecto de cobranzas.

## Autenticación

El login del ERP es **uno solo para todas las apps**, vive en
`packages/auth` y se apoya en Supabase Auth del proyecto consolidado. Las
tablas de perfiles y permisos son `public.perfiles` y
`public.area_responsables`.

**Login real desde el día uno.** No hay modo de prueba ni variable de
bypass: si una pantalla no muestra datos, se revisa el área del perfil de
esa sesión — nunca se desactiva RLS ni se saltea el login.

**Sin contraseñas.** No hay contraseña que crear, recordar ni cambiar, así
que tampoco existen pantallas de invitación o de cambio de clave. Se entra
poniendo el correo en `/login`; Supabase manda un mensaje y hay dos formas
de entrar con él:

1. **El link del correo** → cae en `/auth/callback?code=...`, que canjea el
   código por sesión en el servidor y recién ahí redirige. Tiene que ser en
   el servidor: si el canje lo hiciera el navegador, la primera request ya
   habría pasado por el middleware sin sesión y habría rebotado a `/login`.
2. **El código de 6 dígitos** del mismo correo, escrito en la pantalla.

Las dos, no una. El flujo es PKCE, y PKCE guarda el verificador en el
navegador que pidió el link — pedirlo en la computadora y abrir el correo en
el celular hace fallar el canje. El código de 6 dígitos es la salida de ese
caso, y el mensaje de error lo dice explícitamente.

Por eso `crearClienteNavegador()` fija `detectSessionInUrl: false`: el
código es de un solo uso, y si el cliente y `/auth/callback` lo canjean los
dos, el segundo falla.

### Alta de personas

No se invita a nadie a mano. `public.usuarios_esperados` lista quién puede
tener cuenta (nombre, área, rol, de qué áreas es responsable). En el primer
ingreso, un trigger sobre `auth.users` lee esa fila y crea el
`public.perfiles` correspondiente, más las filas de
`public.area_responsables`. Quien no esté en esa tabla igual puede crear
cuenta, pero queda **sin perfil**, y sin perfil las políticas RLS le niegan
todo. Dar de baja a alguien es poner `activo = false` en esa fila; para
cortarle el acceso ya existente, borrar su usuario de `auth.users`.

### A quién aplica

Solo al **personal administrativo** (16 personas). Los **vendedores no
tienen cuenta ni sesión**: siguen entrando por su link con token rotativo,
que es un mecanismo aparte y anterior a esto.

### Acceso de vendedores — no romperlo

Los vendedores entran a `/v/[token]`, donde el token es
`vendedores.token_acceso` y rota. La página y sus endpoints resuelven el
vendedor por ese token y verifican `activo`, cada uno por su cuenta, sin
pasar por Supabase Auth.

Estas rutas están **explícitamente excluidas** del middleware de login, en
`RUTAS_VENDEDOR` (`packages/auth/src/config.ts`):

| Ruta | Qué hace | Dónde viaja el token |
|---|---|---|
| `/v/[token]` | la vista de cobranzas del vendedor | en la ruta |
| `/api/acceso` | registra que entró | en el body |
| `/api/whatsapp-enviado` | registra un envío (piloto) | en el body |
| `/api/v/exportar-clientes` | exporta su cartera | en el query |
| `/api/base-url` | da la URL de producción con la que se arman los links | — |

Si se agrega una ruta nueva que sirva al vendedor, hay que sumarla a esa
lista. Si no, el vendedor cae en `/login` y el link deja de servir.

Por la misma razón, **no activar Vercel Deployment Protection** en el
proyecto de cobranzas: los vendedores no tienen cuenta de Vercel y la
protección les cerraría el link. `app/api/base-url/route.ts` existe
justamente para que los links se generen contra la URL de producción y no
contra una URL de deployment protegida.

Los **crons de Vercel** también quedan fuera del middleware
(`RUTAS_CRON`): se autentican con `CRON_SECRET` en el header, no con una
sesión, y si los redirigiera a `/login` los jobs diarios se romperían en
silencio.

### Variables de entorno

Van en Vercel (Settings → Environment Variables), nunca hardcodeadas ni
commiteadas:

| Variable | Ámbito | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador + servidor | proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador + servidor | key sujeta a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | tareas administrativas; bypassa RLS |
| `NEXT_PUBLIC_APP_URL` | navegador + servidor | **obligatoria en cobranzas**: dominio propio con el que se arman los links de vendedor |
| `COMPRAS_APP_URL` | solo servidor | en cobranzas: destino del rewrite `/compras` |
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | navegador + servidor | opcional, y **no hace falta** con el ruteo por path; ver "sesión compartida" |

### Sesión compartida entre apps

Ya resuelta por el ruteo por path: cobranzas y compras se sirven las dos
desde `erp.logisalud.com`, así que la cookie de sesión es la misma y quien
inicia sesión en una entra a la otra sin volver a loguearse.

`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` existe para el caso en que alguna app pase a
vivir en un subdominio propio (ej. `compras.logisalud.com`): ahí las dos
tienen que setearla en `.logisalud.com`. Con dominios `*.vercel.app` no
funciona — están en la Public Suffix List y el navegador rechaza una cookie
de dominio padre.

### Configuración en Supabase Authentication

En el dashboard del proyecto consolidado → Authentication → URL
Configuration:

- **Site URL**: `https://erp.logisalud.com`.
- **Redirect URLs**: `https://erp.logisalud.com/**` (cubre el
  `/auth/callback` de las dos apps), más los dominios de preview de Vercel
  si se quiere probar ahí.
- **Email provider** habilitado, con el SMTP propio configurado — si no, los
  correos salen por el servidor compartido de Supabase, que tiene un tope
  muy bajo de envíos por hora.

En Authentication → Emails, la plantilla **Magic Link** tiene que incluir
`{{ .Token }}` además de `{{ .ConfirmationURL }}`. Sin eso el correo trae
solo el link, y quien lo abra en otro dispositivo queda trabado: el canje
del link falla por PKCE y no tiene código que escribir.
