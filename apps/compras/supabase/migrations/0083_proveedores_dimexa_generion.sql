-- 0083 — Dimexa y Generion, y de qué proveedor viene cada producto.
--
-- La lista de la 0082 es de GENERION (el laboratorio) pero la compra se le
-- hace a DIMEXA (el distribuidor), y el Excel trae un código distinto para
-- cada uno: CÓDIGO GENERION (EN-xxxxx) en las 40 filas, CÓDIGO DIMEXA
-- (1850xx) en 30. Los dos hay que guardarlos: hoy se pide a Dimexa, pero
-- también se puede terminar comprando directo a Generion.
--
-- `catalogo.productos.codigo_proveedor` es UNA columna y no alcanza para
-- dos. En vez de elegir cuál se pierde —o de pisar uno con otro en cada
-- carga— el vínculo pasa a su propia tabla: un producto puede venir de
-- varios proveedores, y cada proveedor tiene su propio código para él. Eso
-- es lo que el negocio acaba de decir que pasa, así que es lo que modela la
-- tabla.
--
-- `productos.proveedor_id` se mantiene y apunta a DIMEXA: es el proveedor
-- por defecto, a quien se le emite la OC, y es lo que leen las pantallas de
-- hoy. La tabla nueva es el registro completo; `proveedor_id` es el atajo
-- al habitual.
--
-- Los 40 bonificados heredan los dos vínculos de su producto base: es el
-- mismo artículo del mismo proveedor, sólo que llega sin costo.
--
-- RLS calcada de `catalogo.productos`: lee cualquiera con área, escribe
-- Compras, Dirección Técnica y admin.
--
-- Re-ejecutable.

-- ===================================================================
-- 1. Los dos proveedores
-- ===================================================================
insert into compras.proveedores (ruc, razon_social, nombre_comercial)
values
  ('20100220700', 'DIMEXA S.A.', 'DIMEXA'),
  ('20612823538', 'GENERION', 'GENERION')
on conflict (ruc) do nothing;

-- ===================================================================
-- 2. Quién provee cada producto, y con qué código
-- ===================================================================
create table if not exists catalogo.producto_proveedores (
  producto_id uuid not null references catalogo.productos (id) on delete cascade,
  proveedor_id uuid not null references compras.proveedores (id) on delete restrict,
  -- El código que usa ESE proveedor para ESE producto. Nullable: Dimexa no
  -- publicó código para 10 de los 40.
  codigo_proveedor text,
  created_at timestamptz not null default now(),
  primary key (producto_id, proveedor_id)
);

alter table catalogo.producto_proveedores enable row level security;

grant select, insert, update, delete on catalogo.producto_proveedores to authenticated;

drop policy if exists "producto_proveedores_lectura" on catalogo.producto_proveedores;
create policy "producto_proveedores_lectura"
  on catalogo.producto_proveedores for select
  using (mi_area() is not null);

drop policy if exists "producto_proveedores_escritura" on catalogo.producto_proveedores;
create policy "producto_proveedores_escritura"
  on catalogo.producto_proveedores for all
  using (area_en(variadic array['compras','direccion_tecnica','admin']))
  with check (area_en(variadic array['compras','direccion_tecnica','admin']));

-- ===================================================================
-- 3. Generion: su código ya está en productos.codigo_proveedor (0082)
-- ===================================================================
insert into catalogo.producto_proveedores (producto_id, proveedor_id, codigo_proveedor)
select p.id, (select id from compras.proveedores where ruc = '20612823538'), p.codigo_proveedor
from catalogo.productos p
where p.codigo like 'GNR%'
on conflict (producto_id, proveedor_id) do nothing;

-- ===================================================================
-- 4. Dimexa: los 30 códigos del Excel; los otros 10 quedan sin código
-- ===================================================================
insert into catalogo.producto_proveedores (producto_id, proveedor_id, codigo_proveedor)
select p.id, (select id from compras.proveedores where ruc = '20100220700'), v.dimexa
from (values
  ('GNR101','185034'),('GNR102','185047'),('GNR103','185064'),('GNR104','185035'),
  ('GNR107','185043'),('GNR108','185052'),('GNR110','185027'),('GNR112','185051'),
  ('GNR113','185050'),('GNR114','185048'),('GNR116','185044'),('GNR117','185030'),
  ('GNR118','185031'),('GNR201','185019'),('GNR203','185065'),('GNR205','185013'),
  ('GNR208','185046'),('GNR209','185054'),('GNR210','185007'),('GNR211','185008'),
  ('GNR212','185049'),('GNR213','185018'),('GNR214','185028'),('GNR216','185040'),
  ('GNR217','185062'),('GNR218','185063'),('GNR219','185061'),('GNR220','185060'),
  ('GNR221','185058'),('GNR222','185059'),
  ('GNR105',null),('GNR106',null),('GNR109',null),('GNR111',null),('GNR115',null),
  ('GNR202',null),('GNR204',null),('GNR206',null),('GNR207',null),('GNR215',null)
) as v(codigo, dimexa)
join catalogo.productos p on p.codigo = v.codigo
on conflict (producto_id, proveedor_id) do nothing;

-- ===================================================================
-- 5. Los bonificados heredan los dos vínculos de su base
-- ===================================================================
insert into catalogo.producto_proveedores (producto_id, proveedor_id, codigo_proveedor)
select bo.id, pp.proveedor_id, pp.codigo_proveedor
from catalogo.productos base
join catalogo.productos bo on bo.codigo = base.codigo_bonificacion
join catalogo.producto_proveedores pp on pp.producto_id = base.id
where base.codigo like 'GNR%'
on conflict (producto_id, proveedor_id) do nothing;

-- ===================================================================
-- 6. Proveedor habitual y laboratorio
-- ===================================================================
update catalogo.productos p
set proveedor_id = (select id from compras.proveedores where ruc = '20100220700'),
    marca = coalesce(marca, 'GENERION'),
    updated_at = now()
where (p.codigo like 'GNR%' or p.codigo like 'BOGNR%')
  and (p.proveedor_id is distinct from (select id from compras.proveedores where ruc = '20100220700')
       or p.marca is null);
