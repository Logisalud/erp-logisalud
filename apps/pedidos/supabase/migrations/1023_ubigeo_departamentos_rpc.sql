-- 1023 — Los 25 departamentos, sin depender del tope de filas de PostgREST.
--
-- `listDepartamentos()` traía `select departamento from ubigeos order by
-- departamento` y deduplicaba en TypeScript. PostgREST no hace DISTINCT,
-- así que esa consulta pide 1.884 filas para quedarse con 25 — y las
-- respuestas están topeadas en 1.000 filas. El corte cae dentro de JUNIN:
-- el selector mostraba 11 departamentos y se comía los 14 siguientes por
-- orden alfabético, LIMA incluido.
--
-- El DISTINCT lo hace ahora la base y viajan 25 filas.
create or replace function pedidos.ubigeo_departamentos()
returns setof text
language sql
stable
as $$
  select distinct departamento from pedidos.ubigeos order by 1;
$$;

-- Mismo problema en potencia con las provincias: el departamento de LIMA
-- tiene 171 distritos, hoy lejos del tope, pero pedir 171 filas para
-- devolver 10 nombres es la misma forma de error esperando a crecer.
create or replace function pedidos.ubigeo_provincias(p_departamento text)
returns setof text
language sql
stable
as $$
  select distinct provincia from pedidos.ubigeos
  where departamento = p_departamento
  order by 1;
$$;

grant execute on function pedidos.ubigeo_departamentos() to authenticated;
grant execute on function pedidos.ubigeo_provincias(text) to authenticated;
