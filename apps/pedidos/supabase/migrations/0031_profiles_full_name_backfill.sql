-- Completa full_name (columna existente desde 0002_profiles.sql, nunca
-- poblada porque el signup manual de los primeros admins no pasó
-- raw_user_meta_data.full_name) para los administradores actuales, ya
-- que el nuevo header muestra nombre + iniciales en vez del email.
-- Idempotente: solo toca filas con full_name null.

begin;

update pedidos.profiles
set full_name = 'Andrés Romero'
where email = 'aromero@logisalud.com' and full_name is null;

update pedidos.profiles
set full_name = 'Sebastián Gonzales'
where email = 'sgonzales@logisalud.com' and full_name is null;

commit;
