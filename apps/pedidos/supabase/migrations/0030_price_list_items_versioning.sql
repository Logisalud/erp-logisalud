-- Versiona price_list_items por (product_id, sales_channel_id), no
-- solo por price_list_id. Necesario para:
--  - "Corrección puntual" de un precio desde el detalle de producto
--    sin reimportar todo el Excel del proveedor ni afectar los demás
--    productos de esa lista.
--  - Historial de versiones de precio por producto+canal.
--
-- price_list_id pasa a ser nullable: una corrección puntual no
-- pertenece a ningún lote de importación real (price_lists sigue
-- siendo "evento de reimportación de un proveedor", sin cambios en su
-- semántica).
--
-- Mismo patrón de versionado que product_tax_profiles/price_lists/
-- zone_assignments: un trigger BEFORE INSERT cierra la fila vigente
-- anterior para ese product_id+sales_channel_id (greatest() para el
-- caso mismo-día, ver 0029).

begin;

alter table pedidos.price_list_items alter column price_list_id drop not null;
alter table pedidos.price_list_items add column vigente_desde date not null default current_date;
alter table pedidos.price_list_items add column vigente_hasta date;
alter table pedidos.price_list_items add constraint price_list_items_vigencia_check
  check (vigente_hasta is null or vigente_hasta >= vigente_desde);

-- Backfill: si ya existían reimportaciones antes de esta migración
-- (ej. una prueba de reimport), puede haber más de una fila por
-- product_id+sales_channel_id, todas con vigente_hasta null (porque la
-- columna recién se agrega). Se cierra todas menos la más reciente
-- (por price_lists.publicado_en; una corrección sin price_list_id
-- cuenta como la más reciente) antes de poder crear el índice único.
with ranked as (
  select
    pli.id,
    row_number() over (
      partition by pli.product_id, pli.sales_channel_id
      order by pl.publicado_en desc nulls first, pli.id desc
    ) as rn
  from pedidos.price_list_items pli
  left join pedidos.price_lists pl on pl.id = pli.price_list_id
)
update pedidos.price_list_items
set vigente_hasta = current_date
where id in (select id from ranked where rn > 1);

create unique index price_list_items_current_per_channel
  on pedidos.price_list_items (product_id, sales_channel_id)
  where vigente_hasta is null;

create function pedidos.close_previous_price_list_item()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.price_list_items
  set vigente_hasta = greatest(vigente_desde, new.vigente_desde - 1)
  where product_id = new.product_id
    and sales_channel_id = new.sales_channel_id
    and vigente_hasta is null;
  return new;
end;
$$;

create trigger price_list_items_close_previous
  before insert on pedidos.price_list_items
  for each row execute function pedidos.close_previous_price_list_item();

commit;
