-- Dos pedidos de Arlette (2026-09-23): separar AFP por administradora, y
-- completar las categorías de gasto que usa Caja Chica.
--
-- Re-ejecutable: cada insert se guarda contra el nombre exacto.

-- ===================================================================
-- 1. AFP: una por administradora
-- ===================================================================
-- Hasta ahora había un solo tipo "AFP" y la administradora se anotaba en el
-- `beneficiario` de cada obligación (migración 0049, que se hizo justamente
-- porque la empresa tiene gente en varias). Eso alcanzaba para no mentir en
-- el beneficiario, pero no para lo que Arlette necesita: ver cuánto va a
-- cada AFP sin abrir obligación por obligación, y que el desplegable ya
-- traiga la respuesta en vez de pedir que la escriba a mano cada mes.
--
-- El `beneficiario` por obligación NO se toca: lo sigue usando Seguro Vida
-- Ley, donde la aseguradora sí cambia y no son cuatro opciones fijas.
insert into impuestos.tipos_impuesto (nombre, beneficiario)
select v.nombre, v.beneficiario from (
  values
    ('AFP Integra',   'AFP Integra'),
    ('AFP Prima',     'AFP Prima'),
    ('AFP Profuturo', 'AFP Profuturo'),
    ('AFP Habitat',   'AFP Habitat')
) as v(nombre, beneficiario)
where not exists (
  select 1 from impuestos.tipos_impuesto t where t.nombre = v.nombre
);

-- El "AFP" genérico se desactiva, no se borra: desactivar lo saca del
-- desplegable sin romper nada, y borrar sí rompería si mañana apareciera una
-- obligación vieja apuntándole. Hoy tiene 0 obligaciones, así que nadie
-- pierde historia. Mismo criterio con el que ya se había desactivado "Renta"
-- al abrirlo en 4ta y 5ta categoría.
update impuestos.tipos_impuesto set activo = false
 where nombre = 'AFP' and activo;

-- ===================================================================
-- 2. Categorías de gasto que faltaban
-- ===================================================================
-- De la lista que pasó Arlette, ocho ya existían con el mismo nombre
-- (Cocheras y estacionamientos, Combustible, Mantenimiento de flota,
-- Peajes, Útiles de oficina, Viáticos, Digemid, Trámites y tasas
-- notariales). Estas tres son las que faltaban de verdad.
--
-- OJO: `gastos.categorias_gasto` es UNA sola lista, sin columna de alcance
-- — la comparten Caja Chica, Gastos/Anticipos y Aportes de accionista. Lo
-- que se agregue acá aparece en los tres desplegables, no solo en Caja
-- Chica.
insert into gastos.categorias_gasto (nombre)
select v.nombre from (
  values
    ('Movilidad'),
    ('Útiles de aseo'),
    ('Varios')
) as v(nombre)
where not exists (
  select 1 from gastos.categorias_gasto c where c.nombre = v.nombre
);
