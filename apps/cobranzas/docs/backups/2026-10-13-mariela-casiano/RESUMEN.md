# Mariela Casiano: correo corregido y admin en cobranzas — 2026-10-13

Dos cambios pedidos por aromero@logisalud.com, en los dos proyectos.

## 1. Pedidos: el correo estaba mal escrito

La cuenta maestra que se creó el 29/09 quedó como **`mcasano@logisalud.com`**
—sin la "i"— y su correo real es **`mcasiano@logisalud.com`**, el mismo con
el que entra a cobranzas. Nunca pudo entrar a pedidos: primero por el bug de
GoTrue (arreglado el 2/10) y después porque la dirección no era la suya.

Se corrigió la cuenta existente en vez de crear otra, así conserva sus roles
y su historial:

- `auth.users.email` → `mcasiano@logisalud.com`
- `auth.identities.identity_data->>'email'` → lo mismo (si se cambia sólo
  `auth.users`, GoTrue sigue buscando por la identidad vieja)
- Las tres columnas de `email_change*` quedaron en cadena vacía, nunca NULL
  (ver la trampa documentada en el `CLAUDE.md` de pedidos).

Verificado: correo confirmado, identidad `email` al día y sus roles
`administrador + operaciones` intactos.

**Pendiente**: su contraseña NO es la compartida (es una propia de la
creación del 29/09) y nunca inició sesión, así que probablemente no la
tenga. Hay que pasársela o resetearla.

## 2. Cobranzas: ahora es admin de verdad

Tenía **`rol = 'admin'` pero `area = 'contabilidad'`**, y en esta app el
permiso lo da el **área**: `exigirArea()` mira `perfil.area` y la columna
`rol` no se usa en ningún guard. O sea que parecía admin y no lo era.

Se cambió su área de `contabilidad` a `admin`. Con eso pasa a tener:

- dar de baja facturas por incobrable (`AREAS_INCOBRABLE`, solo admin);
- borrar pagos (`AREAS_BORRADO`, solo admin);
- asignación de cartera y links de vendedor (`AREAS_ASIGNACION`);
- y todo lo que ya tenía, porque `exigirArea()` deja pasar a admin siempre.

Los admin de cobranzas pasan de dos a tres: Andrés Romero, Sebastián
Gonzales y Mariela Casiano.

**No pierde nada en compras.** Los dos proyectos comparten `public.perfiles`,
así que el cambio vale para las dos apps; en compras cada chequeo es
`area === 'contabilidad' || area === 'admin'`, así que conserva lo mismo que
tenía (caja chica, categorías de gasto, tipos de impuesto).

**Siguen con `rol = 'admin'` sin serlo**: Katia Zapata (dirección técnica) y
Ana Lucía Taboada (legal). Si alguna tiene que ser admin, es cambiarle el
área; si no, convendría limpiar esa columna `rol` para que no confunda.

## Cómo revertirlo

```sql
-- Cobranzas
update public.perfiles p set area = b.area
  from perfiles_backup_20261013 b where b.id = p.id;

-- Pedidos
update auth.users set email = 'mcasano@logisalud.com'
 where email = 'mcasiano@logisalud.com';
update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}', to_jsonb('mcasano@logisalud.com'::text))
 where provider = 'email'
   and user_id = (select id from auth.users where email = 'mcasano@logisalud.com');
```

El respaldo de los 15 perfiles, tal como estaban, quedó en
`perfiles_backup_20261013`.
