-- ===================================================================
-- 0066 — Todo perfil puede leer los nombres de los demás
--
-- El bug: Milagritos (tesoreria) veía "Beneficiario: —" en una obligación
-- de reembolso donde Mariela (contabilidad) sí veía "Sebastian Gonzales".
-- La policy `perfiles_lectura` dejaba leer solo el perfil PROPIO, más todo
-- para `es_admin()` y `contabilidad`. Tesorería no estaba, así que
-- `mapaBeneficiarios` le devolvía un mapa vacío.
--
-- No era cosmético: Tesorería es QUIEN EJECUTA EL PAGO, y estaba viendo un
-- guion en lugar del nombre de la persona a la que le transfiere.
--
-- Se abre a cualquiera con perfil (`mi_area() is not null`), que es el mismo
-- criterio de todas las policies `*_lectura` del módulo. Alternativa
-- descartada: agregar 'tesoreria' y 'gerencia' a la lista. Habría arreglado
-- este caso y dejado el siguiente — un jefe de área aprobando el gasto de
-- alguien de su equipo tiene el mismo problema.
--
-- Qué se expone: `id`, `nombre`, `area`, `rol`. Nada más — la tabla no tiene
-- otras columnas. Los datos bancarios del empleado NO viven acá, así que
-- esto no amplía el acceso a ningún dato sensible: son los nombres y las
-- áreas de los compañeros de trabajo.
-- ===================================================================

drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select to authenticated
  using (public.mi_area() is not null);
