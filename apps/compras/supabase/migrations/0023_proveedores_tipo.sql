-- Bug confirmado por Sebas en producción: "Crear orden de compra de un
-- bien" (equipos, muebles — NO para revender) mostraba el mismo listado
-- que "Crear orden de compra de mercadería" (Biosana, Prades, Diphasac,
-- Dare Nutrition — proveedores de mercadería real). Las dos pantallas
-- llamaban a la misma listarProveedores() sin ningún filtro, porque
-- compras.proveedores nunca tuvo un campo que distinguiera para qué se usa
-- cada proveedor.
--
-- `ambos` existe para el caso real de un proveedor que vende tanto
-- mercadería como bienes — no se fuerza a elegir uno solo.

alter table compras.proveedores
  add column if not exists tipo text not null default 'mercaderia'
    check (tipo in ('mercaderia', 'bien', 'ambos'));
