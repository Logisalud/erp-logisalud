# Autorización de las rutas de Cobranzas — propuesta

Estado: **propuesta, sin implementar**. No cambia nada todavía.

## Qué pasa hoy

Cobranzas tiene **54 rutas de API**. Medido sobre el código, no de memoria:

- **53 de las 54 llegan a la service role key** y por lo tanto **bypassean RLS
  por completo**. 50 lo hacen directo con `supabaseAdmin()`; otras 3
  (`/api/cobranza`, `/api/vendedores-links/exportar-clientes`,
  `/api/cron/morosidad-diaria`) llegan indirecto, a través de `lib/cobranza.ts`,
  `lib/exportCarteraClientes.ts` y `lib/capturarMorosidad.ts`.
- La única que no llega es `/api/base-url`, que solo lee variables de entorno.
- **Ninguna valida la sesión.** Cero rutas llaman a `usuarioActual()`,
  `exigirUsuario()`, `perfilActual()` ni `auth.getUser()`.
- `public.pagos` tiene RLS activado y **cero policies**.

La consecuencia concreta: hoy el login controla **quién entra a la pantalla**,
no **qué puede hacer**. Cualquiera con sesión válida — cualquiera de las 32
personas de `usuarios_esperados`, incluidos los 16 vendedores — puede llamar a
`POST /api/pagos` o `DELETE /api/pagos/[id]` directamente y el servidor lo
ejecuta. No hay nada en el camino que lo impida.

## Por qué poner policies RLS no alcanza

Es el error que casi cometí: agregar policies a `public.pagos` **no tendría
ningún efecto**, porque la service role no las evalúa. RLS es la segunda
barrera, no la primera. La primera tiene que estar en la ruta.

## La propuesta: tres capas, en este orden

### 1. Un guard por ruta, explícito

Una función que cada ruta llama al empezar:

```ts
const perfil = await exigirArea('contabilidad', 'tesoreria', 'admin')
```

Devuelve el perfil o corta con 401/403. Explícito y no por convención: una
regla que se aplica "por estar en tal carpeta" se rompe la primera vez que
alguien mueve un archivo.

### 2. Dejar de usar la service role donde no hace falta

Las 30 rutas de solo lectura pueden usar la anon key con la sesión de la
persona. Ahí RLS **sí** se evalúa y pasa a ser una red real.

### 3. Policies RLS como defensa en profundidad

Recién con (2) hecho, las policies valen. Antes son decorativas.

## Las 54 rutas, clasificadas

### A — Acceso de vendedores: quedan públicas (4)

No llevan guard. Se autentican por token rotativo y **no hay que tocarlas** —
es lo que ya está excluido en `RUTAS_VENDEDOR`.

| Ruta | Métodos |
|---|---|
| `/api/acceso` | POST |
| `/api/base-url` | GET |
| `/api/v/exportar-clientes` | GET |
| `/api/whatsapp-enviado` | POST |

### B — Crons: siguen con `CRON_SECRET` (2)

No llevan guard de área: no hay persona detrás. Ya validan el header.

| Ruta | Métodos |
|---|---|
| `/api/cron/morosidad-diaria` | GET |
| `/api/cron/reporte-cobranza` | GET |

**Pero hay un agujero real acá**: `/api/cron/morosidad-diaria` deja pasar el
disparo si `CRON_SECRET` no está definida — está comentado en el código como
"para primera captura". Si esa variable falta en Vercel, la ruta queda abierta.
Hay que hacerla fallar cerrada.

### C — Lectura de cartera (30)

Guard propuesto: **`admin`, `contabilidad`, `tesoreria`, `gerencia`** — las
mismas cuatro áreas que ya ven el módulo en `modulo_areas_permitidas`.

Son las mejores candidatas para migrar a anon key + RLS, porque no escriben.

| Ruta | Métodos |
|---|---|
| `/api/accesos-vendedor` | GET |
| `/api/clientes` | GET |
| `/api/clientes/buscar` | GET |
| `/api/clientes/exportar` | GET |
| `/api/clientes/resumen` | GET |
| `/api/cobranza` | GET |
| `/api/cobranza/exportar` | GET |
| `/api/concentracion-cartera` | GET |
| `/api/conciliacion/estado` | POST |
| `/api/conciliacion/movimientos` | GET |
| `/api/conciliacion/sugerencias` | GET |
| `/api/contados-pendientes` | GET |
| `/api/digemid-zonas` | GET |
| `/api/efectivo-por-depositar` | GET |
| `/api/estado-cuenta/cliente/[ruc]` | GET |
| `/api/estado-cuenta/resumen` | GET |
| `/api/estado-cuenta/vendedor/[vendedorId]` | GET |
| `/api/exportar/clientes` | GET |
| `/api/exportar/documentos` | GET |
| `/api/exportar/estado-cuenta` | GET |
| `/api/exportar/resumen-vendedor` | GET |
| `/api/facturas/[id]` | GET |
| `/api/facturas/[id]/nc-nd` | GET |
| `/api/facturas/buscar` | GET |
| `/api/letras/por-cliente/[ruc]` | GET |
| `/api/pagos-sin-confirmar` | GET |
| `/api/pagos/voucher-url` | GET |
| `/api/vendedores` | GET |
| `/api/vendedores-links/exportar-clientes` | GET |
| `/api/vendedores-links/exportar-cobranza-mes` | GET |

### D — Escriben dinero (10)

Guard propuesto: **`admin`, `contabilidad`, `tesoreria`**. Sin `gerencia`:
gerencia mira, no registra.

Son las más urgentes. Un `DELETE /api/pagos/[id]` mal llamado borra un pago
cobrado.

| Ruta | Métodos |
|---|---|
| `/api/conciliacion/auto` | POST |
| `/api/conciliacion/confirmar` | POST |
| `/api/documentos/[id]/contado-pendiente` | PATCH |
| `/api/efectivo-por-depositar/depositar` | POST |
| `/api/letras` | GET,POST |
| `/api/letras/[id]` | PATCH,DELETE |
| `/api/pagos` | GET,POST |
| `/api/pagos-sin-confirmar/investigar` | POST |
| `/api/pagos/[id]` | PATCH,DELETE |
| `/api/pagos/upload` | POST |

### E — Importación masiva (5)

Guard propuesto: **`admin`, `contabilidad`**. Un import mal hecho mueve miles
de filas de una vez: es la operación de mayor daño potencial del módulo.

| Ruta | Métodos |
|---|---|
| `/api/conciliacion/importar` | POST |
| `/api/importar-cartera/confirmar` | POST |
| `/api/importar-cartera/preview` | POST |
| `/api/importar/confirmar` | POST |
| `/api/importar/preview` | POST |

### F — Asignación de cartera y links (3)

Guard propuesto: **`admin`, `gerencia`**. Reasignar la cartera de un vendedor
es una decisión comercial, no contable. `vendedores-links` además **rota
tokens de acceso**: quien pueda llamarlo puede dejar a un vendedor afuera.

| Ruta | Métodos |
|---|---|
| `/api/clientes/[ruc]/asignar` | PATCH |
| `/api/clientes/[ruc]/zona` | PATCH |
| `/api/vendedores-links` | GET,PATCH |

## Orden de implementación

1. **D y E primero** (10 + 5 rutas). Son las que
   escriben y las que más daño hacen. Un PR chico, verificable a mano.
2. **Cerrar el agujero del cron** (que `CRON_SECRET` ausente falle cerrado).
3. **F** (3 rutas).
4. **C** (30 rutas), en dos PRs: primero el guard, después el paso
   a anon key + RLS. Separados a propósito: si algo se rompe, se sabe cuál de
   los dos cambios fue.
5. **Policies RLS** sobre `pagos`, `documentos`, `letras`.

## Cómo no romper nada al hacerlo

- **A y B no se tocan.** El acceso de vendedores y los crons quedan igual, y
  hay que verificarlo en cada PR: un `/v/[token]` real sin sesión, y un cron
  disparado a mano.
- **El guard se agrega ruta por ruta**, no con un middleware que cubra
  `/api/*`: eso último rompería A y B de una.
- **Ninguna persona debería perder acceso a lo que hoy usa.** Con el mapeo
  propuesto, Milagritos (`tesoreria`) conserva C y D, que es lo que necesita
  para registrar pagos. Antes de mergear conviene confirmar que las áreas de
  las 32 filas de `usuarios_esperados` cubren a todos los que hoy trabajan en
  el módulo.

## Lo que esto NO resuelve

- **No hay auditoría de quién hizo qué.** `pagos.registrado_por` es texto
  libre y se llena a mano. Con sesión real se puede empezar a llenar con el
  `auth.uid()`, pero eso es un cambio aparte.
- **Un vendedor con cuenta sigue viendo la cartera de todos** en las rutas de
  grupo C si su área lo habilita. Filtrar por vendedor es otro trabajo.
- **No cambia nada de Pedidos ni de Compras**, que nacieron con RLS y sin
  service role en la capa de servicios.
