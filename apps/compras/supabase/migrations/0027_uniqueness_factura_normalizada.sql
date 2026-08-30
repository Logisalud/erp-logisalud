-- Corrige la unicidad de factura en cuentas_x_pagar.obligaciones.
--
-- Bug real, verificado, de dos partes:
--
-- 1. `unique (proveedor_id, numero_factura)` (0001) solo cubre obligaciones
--    de origen 'compra' (que sí llenan proveedor_id). Una obligación de
--    origen 'servicio' llena `proveedor_servicio_id` en cambio y deja
--    `proveedor_id` en NULL — y en SQL, NULL nunca es igual a NULL para un
--    UNIQUE constraint, así que esa fila NUNCA choca con nada. El mensaje
--    de error ya escrito para el código 23505 en
--    services/servicios.ts:registrarObligacionDesdeOS ("Ya existe una
--    obligación con ese número de factura para este proveedor") es
--    aspiracional: hoy es imposible que ese constraint lo dispare para una
--    obligación de servicio. Confirmado leyendo el insert (solo setea
--    proveedor_servicio_id) y el constraint (solo indexa proveedor_id).
--
-- 2. No hay normalización: "F001-123" y "f001-123 " (con espacio) cuentan
--    como facturas distintas para el constraint, cuando en la práctica son
--    la misma.
--
-- Nota sobre el modelo de datos (limitación real, no resuelta acá): este
-- schema NO separa tipo_comprobante/serie/numero en columnas propias —
-- `numero_factura` es un solo campo de texto libre donde Contabilidad tipea
-- el comprobante completo tal como aparece impreso (ej. "F001-00000123").
-- Separar tipo_comprobante/serie/numero en columnas propias, con su propio
-- formulario, es un cambio de modelo de datos más grande que el de esta
-- migración (afecta el formulario de registro de factura en
-- app/cuentas-por-pagar/nueva/[recepcionId] y app/servicios/[id]/registrar-
-- obligacion, y requiere decidir qué hacer con los datos ya cargados) — se
-- deja fuera de este PR a propósito y queda documentado como pendiente. Lo
-- que esta migración sí puede garantizar con lo que existe hoy es:
-- proveedor + comprobante-tal-como-se-tipeó, normalizado en mayúsculas y
-- sin espacios al borde, no se puede repetir.
--
-- Verificación pre-deploy: se corrió (2026-08-30, read-only, contra el
-- proyecto Supabase consolidado real) un SELECT agrupando por
-- (proveedor_id, upper(trim(numero_factura))) y por (proveedor_servicio_id,
-- upper(trim(numero_factura))) buscando duplicados — cero encontrados (la
-- tabla tiene una sola fila real en este momento). Igual, por las dudas de
-- que haya más datos para cuando esto se aplique, este script valida de
-- nuevo antes de crear el índice y aborta con un mensaje claro si encuentra
-- un duplicado real, en vez de fallar con el error crudo de Postgres.
do $$
declare
  duplicados_compra int;
  duplicados_servicio int;
begin
  select count(*) into duplicados_compra from (
    select proveedor_id, upper(trim(numero_factura)) as norm
    from cuentas_x_pagar.obligaciones
    where proveedor_id is not null and numero_factura is not null
    group by 1, 2
    having count(*) > 1
  ) d;

  select count(*) into duplicados_servicio from (
    select proveedor_servicio_id, upper(trim(numero_factura)) as norm
    from cuentas_x_pagar.obligaciones
    where proveedor_servicio_id is not null and numero_factura is not null
    group by 1, 2
    having count(*) > 1
  ) d;

  if duplicados_compra > 0 or duplicados_servicio > 0 then
    raise exception 'Hay % obligación(es) de compra y % de servicio con la misma factura (proveedor + número, normalizado) — resolver a mano antes de aplicar esta migración.', duplicados_compra, duplicados_servicio;
  end if;
end $$;

-- El unique constraint viejo solo protegía origen 'compra' y no normalizaba
-- — se reemplaza por los dos índices funcionales de abajo, uno por cada
-- referencia de proveedor posible (compras.proveedores /
-- servicios.proveedores_servicio son tablas distintas, así que van en
-- índices separados en vez de un solo constraint combinado).
alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_proveedor_id_numero_factura_key;

create unique index if not exists obligaciones_factura_unica_compra
  on cuentas_x_pagar.obligaciones (proveedor_id, upper(trim(numero_factura)))
  where proveedor_id is not null and numero_factura is not null;

create unique index if not exists obligaciones_factura_unica_servicio
  on cuentas_x_pagar.obligaciones (proveedor_servicio_id, upper(trim(numero_factura)))
  where proveedor_servicio_id is not null and numero_factura is not null;
