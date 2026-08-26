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

**Login real desde el día uno.** No hay modo de prueba ni variable de
bypass: si una pantalla no muestra datos, se revisa el área del perfil de
esa sesión — nunca se desactiva RLS ni se saltea el login.

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
| `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` | navegador + servidor | opcional; ver "sesión compartida" |

### Sesión compartida entre apps

Que alguien logueado en Cobranzas entre a Compras sin volver a loguearse
requiere que las dos apps compartan el dominio de la cookie de sesión. Con
los dominios `*.vercel.app` **no se puede**: son hosts distintos y
`.vercel.app` está en la Public Suffix List, así que el navegador rechaza
una cookie de dominio padre.

Para tener sesión única hay que poner las apps bajo un dominio propio
(ej. `cobranzas.logisalud.com` y `compras.logisalud.com`) y setear en las
dos `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.logisalud.com`. Hasta entonces, cada
app pide su propio login.

### Configuración en Supabase Authentication

En el dashboard del proyecto consolidado → Authentication → URL
Configuration:

- **Site URL**: la URL de producción de la app principal.
- **Redirect URLs**: agregar `/aceptar-invitacion` de cada app, más los
  dominios de preview de Vercel si se quiere probar invitaciones ahí.

El link de invitación que manda Supabase trae el token en el fragmento de
la URL (`#access_token=...&type=invite`), y la pantalla
`/aceptar-invitacion` es la que lo lee para dejar crear la contraseña.
