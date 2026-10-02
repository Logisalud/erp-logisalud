# Dos cuentas maestras — 2026-09-29 (corregidas el 2026-10-02)

Creadas a pedido de aromero@logisalud.com:

| Correo | Nombre | Roles |
|---|---|---|
| mcasano@logisalud.com | Mariela Casiano | administrador + operaciones |
| bzavala@logisalud.com | Beatriz Zavala | administrador + operaciones |

El par `administrador` + `operaciones` es el que tienen las otras cinco
cuentas `@logisalud.com`; eso es lo que acá significa "cuenta maestra".

## El error que tuvieron durante tres días

Se crearon con un `insert` directo en `auth.users` **sin poner en cadena
vacía** `confirmation_token`, `recovery_token`, `email_change` y
`email_change_token_new`. Quedaron en NULL.

GoTrue lee esas columnas como texto no nullable: con un NULL, el login falla
entero con **"Database error querying schema"**, un mensaje que no nombra ni
la columna ni al usuario. La cuenta queda creada, con la contraseña correcta
y el correo confirmado, **y aun así no deja entrar**.

Está documentado en el `CLAUDE.md` de esta app y en la migración `1035`, de
un caso idéntico anterior. No se leyó antes de crear las cuentas; se detectó
el 2026-10-02 al releerlo por otro motivo, y se corrigió el mismo día:

```sql
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email in ('mcasano@logisalud.com','bzavala@logisalud.com');
```

Verificado después: las ocho columnas en cadena vacía y cada contraseña
validando sólo contra su propia cuenta.

## Para la próxima

Crear una cuenta con SQL directo es frágil por esto mismo. Si se puede, usar
la API de administración de Supabase (`auth.admin.createUser`), que llena
todas esas columnas sola. Si se hace por SQL, copiar las ocho columnas de la
lista de arriba — y **releer el `CLAUDE.md` antes**, no después.

## Hash

Las contraseñas entraron con `gen_salt('bf')`, que usa coste 6 por defecto,
mientras el resto de las cuentas usa coste 10. Se rehicieron con
`gen_salt('bf', 10)` el mismo día para no dejar dos cuentas más débiles.
