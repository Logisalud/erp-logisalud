-- Arregla el login de las cuentas creadas por SQL: tokens en NULL.
--
-- Síntoma: la cuenta existe, la contraseña es correcta y el correo está
-- confirmado, pero al ingresar sale "Database error querying schema" y no
-- deja pasar. Le pasó a NAYDU ESPINOZA el 2026-09-18, y antes —sin que
-- nadie lo reportara— a BRYAN PALOMINO y a SANDRA LÓPEZ: las tres cuentas
-- creadas con el bloque SQL de la migración 1033 en adelante.
--
-- Causa: GoTrue (el servicio de Auth de Supabase) lee esas columnas como
-- texto, no como texto nullable. Un NULL revienta la consulta entera y el
-- error llega a la pantalla como un problema de "schema", que no dice nada
-- de lo que realmente pasa. El panel de Supabase las escribe como cadena
-- vacía; un INSERT a mano las deja en NULL, que es el default de la tabla.
--
-- Por eso las cuentas viejas funcionaban y las nuevas no: mismo INSERT,
-- distinta suerte.

update auth.users
   set confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change = coalesce(email_change, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change = coalesce(phone_change, ''),
       phone_change_token = coalesce(phone_change_token, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
