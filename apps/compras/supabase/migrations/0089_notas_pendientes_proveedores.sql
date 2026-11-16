-- ===================================================================
-- 0089 — Reporte "Notas pendientes de proveedores"
--
-- Pedido de Contabilidad (Sebas, 2026-11-16): ver en una tabla qué notas
-- le debe cada proveedor por diferencias de la recepción, y poder seguirlas
-- hasta que llegan. Lo ven Contabilidad, Gerencia y Tesorería.
--
-- La diferencia ya la registra Almacén en la recepción de tres columnas
-- (0062) — no hace falta un clic aparte:
--   · llegó MENOS de lo facturado → nota de crédito pendiente. La deuda ya
--     queda frenada con `espera_nota_credito` y se libera al registrar la NC.
--   · llegó MÁS de lo facturado → el proveedor tiene que regularizar con una
--     factura por la diferencia o una nota de débito. Hasta hoy eso quedaba
--     anotado (`excedente_sin_facturar`) sin forma de cerrarlo: eso es la
--     tabla nueva.
--
-- Re-ejecutable.
-- ===================================================================

-- ── 1. El documento que regulariza un excedente ──────────────────────────
-- Una fila por LÍNEA de recepción: un mismo documento del proveedor suele
-- cubrir varias líneas de la misma entrega, y entonces se registra una vez
-- en pantalla y queda en cada línea que cubre.
create table if not exists compras.documentos_excedente (
  id uuid primary key default gen_random_uuid(),
  recepcion_item_id uuid not null unique references almacen.recepciones_items(id) on delete cascade,
  tipo text not null check (tipo in ('factura', 'nota_debito')),
  numero text not null check (nullif(btrim(numero), '') is not null),
  fecha_emision date not null,
  storage_path text not null,
  registrado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table compras.documentos_excedente is
  'Factura o nota de débito con la que el proveedor regulariza lo que llegó de más (excedente_sin_facturar de la recepción). Una fila por línea cubierta. Migración 0089.';

alter table compras.documentos_excedente enable row level security;

drop policy if exists documentos_excedente_lectura on compras.documentos_excedente;
create policy documentos_excedente_lectura on compras.documentos_excedente
  for select to authenticated
  using (public.area_en('contabilidad', 'tesoreria', 'gerencia', 'admin'));

-- Lo registra Contabilidad, igual que la nota de crédito: es un documento
-- tributario del proveedor y quien lo registra es quien lo declara.
drop policy if exists documentos_excedente_escritura on compras.documentos_excedente;
create policy documentos_excedente_escritura on compras.documentos_excedente
  for insert to authenticated
  with check (public.area_en('contabilidad', 'admin'));

-- ── 2. Todas las diferencias factura ↔ físico, en una vista ──────────────
-- Cruza cuatro schemas (almacén, compras, catálogo, cuentas por pagar): en
-- SQL es un join; desde PostgREST serían cinco consultas y Maps a mano.
-- `security_invoker`: cada tabla aplica su propia RLS a quien consulta.
create or replace view compras.v_diferencias_recepcion
with (security_invoker = true) as
select
  ri.id                    as linea_id,
  r.id                     as recepcion_id,
  r.fecha_recepcion::date  as fecha_recepcion,
  pf.nombre                as recibido_por,
  oc.id                    as oc_id,
  oc.codigo                as oc_codigo,
  oc.moneda,
  p.id                     as proveedor_id,
  p.razon_social           as proveedor,
  p.ruc,
  r.numero_factura,
  prod.codigo              as producto_codigo,
  prod.descripcion         as producto,
  ri.cantidad_factura,
  ri.cantidad_fisica,
  oci.precio_unitario,
  coalesce(oci.exonerado_igv, false) as exonerado_igv,
  ri.observaciones,
  ob.id                    as obligacion_id,
  ob.codigo                as obligacion_codigo,
  coalesce(ob.espera_nota_credito, false) as espera_nota_credito
from almacen.recepciones_items ri
join almacen.recepciones r          on r.id = ri.recepcion_id
join compras.ordenes_compra_items oci on oci.id = ri.oc_item_id
join compras.ordenes_compra oc      on oc.id = r.oc_id
join compras.proveedores p          on p.id = oc.proveedor_id
left join catalogo.productos prod   on prod.id = oci.producto_id
left join public.perfiles pf        on pf.id = r.recibido_por
left join cuentas_x_pagar.obligaciones ob on ob.recepcion_id = r.id
where ri.cantidad_factura is not null
  and ri.cantidad_fisica <> ri.cantidad_factura;

comment on view compras.v_diferencias_recepcion is
  'Una fila por línea de recepción donde lo que llegó no coincide con lo facturado. Base del reporte Notas pendientes de proveedores (0089).';

grant select on compras.v_diferencias_recepcion to authenticated;

select public.aplicar_grants_del_modulo();
