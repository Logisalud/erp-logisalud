# Cuenta maestra nsubauste@logisalud.com — 2026-10-06

Creada a pedido de aromero@logisalud.com en el proyecto de **pedidos**
(`dfqhxwkdflnkcjnysbwu`).

| Correo | Roles | Contraseña |
|---|---|---|
| nsubauste@logisalud.com | administrador + operaciones | `Logisalud2026` (la compartida) |

"Cuenta maestra" acá significa el par `administrador` + `operaciones`, que
es el que tienen las otras siete cuentas `@logisalud.com`. Con eso entra a
la gestión de usuarios y roles y a la confirmación de despacho.

## Qué se insertó

1. `auth.users` — con `email_confirmed_at` seteado (no hay que confirmar
   por correo) y **las ocho columnas de token en cadena vacía**: es la
   trampa de GoTrue documentada en el `CLAUDE.md` de la app y en la
   migración `1035`; con un NULL ahí, la cuenta queda creada y el login
   falla con "Database error querying schema". Ya pasó con las dos cuentas
   del 29/09 y costó tres días.
2. `auth.identities` — la identidad `email`, con `provider_id = user_id` y
   `identity_data.sub`, igual que el resto de las cuentas.
3. `pedidos.user_roles` — las dos filas, con `assigned_by` apuntando a
   aromero.

El hash entró con `gen_salt('bf', 10)`, el mismo coste que usa el resto de
las cuentas (el default de `gen_salt('bf')` es 6 y deja la cuenta más
débil).

## Verificación

Sobre la cuenta ya creada: correo confirmado, hash `$2a$10$`, la contraseña
valida contra su propio hash, una identidad `email`, los dos roles, y las
ocho columnas de token no sólo no-NULL sino en cadena vacía.

## Sobre la contraseña

Es la compartida, la misma que usan 23 de las 26 cuentas del módulo — el
usuario la aceptó a sabiendas de que es menos segura. Cambiarla por una
propia es un `update` de una línea cuando se decida.

## Cómo revertirlo

```sql
delete from pedidos.user_roles
 where user_id = (select id from auth.users where email = 'nsubauste@logisalud.com');
delete from auth.users where email = 'nsubauste@logisalud.com';
```

(La fila de `auth.identities` se va sola por la FK en cascada.)
