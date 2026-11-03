-- 1049 — El territorio del proveedor: dónde NO se puede vender su línea.
--
-- JAM Pharma nos dio una distribución acotada y hasta ahora el ERP no la
-- conocía: se le vendió a 41 pedidos en distritos de Lima que no están en el
-- acuerdo. La regla pasa a vivir en la base, y el pedido no sale si la rompe.
--
-- El acuerdo, tal como lo pasó Administración el 2026-11-03:
--
--   * Lima Metropolitana: SOLO Ate, Santa Anita, La Molina,
--     Lurigancho-Chosica, Chaclacayo, La Victoria, San Luis, San Borja,
--     Lince, Lurín y Pachacámac. El Callao queda afuera (decisión del
--     usuario: es Lima Metropolitana y no está en la lista).
--   * El resto del país, libre —Norte Chico y Sur Chico incluidos— salvo el
--     norte, "desde Chimbote hasta Piura": La Libertad, Lambayeque, Piura,
--     Tumbes, y dentro de Áncash solo Santa (donde está Chimbote) y las
--     provincias que quedan al norte de ella. El sur de Áncash —Huaraz,
--     Casma, Huarmey— sigue libre.
--
-- POR QUÉ UNA LISTA DE DISTRITOS Y NO UNA REGLA
--
-- Se materializa un distrito por fila en vez de guardar la condición. Son
-- 297 filas y se podrían haber escrito como cuatro `or`, pero entonces
-- "¿por qué se bloqueó este pedido?" se contesta leyendo código, y
-- corregir un distrito mal clasificado sería un deploy. Así se contesta con
-- un select y se corrige con un insert o un delete.
--
-- La parte de Áncash es la única que no pude verificar contra una fuente
-- oficial de límites provinciales: quedó SANTA, PALLASCA, CORONGO, SIHUAS,
-- POMABAMBA, MARISCAL LUZURIAGA y HUAYLAS. Hoy no cambia nada en la
-- práctica —los únicos clientes en Áncash están en Santa, que queda vetada
-- en cualquier lectura, y en Huaraz, que queda libre en todas—, pero si
-- alguien de la calle sabe que una provincia está mal, es una fila.

-- ---------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------
create table if not exists pedidos.territorio_vetado (
  supplier_id integer not null references pedidos.suppliers (id) on delete cascade,
  codigo_inei text not null references pedidos.ubigeos (codigo_inei),
  -- Viaja hasta el mensaje de error: el vendedor tiene que entender por qué
  -- no puede vender ahí sin llamar a nadie.
  motivo text not null,
  creado_en timestamptz not null default now(),
  primary key (supplier_id, codigo_inei)
);

comment on table pedidos.territorio_vetado is
  'Un distrito por fila donde la línea de ese proveedor NO se puede vender. '
  'Lo que no está acá se puede vender: un proveedor sin filas no tiene '
  'restricción territorial.';

create index if not exists territorio_vetado_ubigeo_idx
  on pedidos.territorio_vetado (codigo_inei);

alter table pedidos.territorio_vetado enable row level security;

-- La lee cualquier autenticado: el vendedor tiene que ver por qué no puede
-- agregar un producto. La escribe solo el administrador.
drop policy if exists "territorio_vetado_lectura" on pedidos.territorio_vetado;
create policy "territorio_vetado_lectura" on pedidos.territorio_vetado
  for select to authenticated using (true);

drop policy if exists "territorio_vetado_escritura" on pedidos.territorio_vetado;
create policy "territorio_vetado_escritura" on pedidos.territorio_vetado
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

-- ---------------------------------------------------------------------
-- 2. El territorio de JAM Pharma
-- ---------------------------------------------------------------------
-- Re-ejecutable: borra lo de este proveedor y lo vuelve a armar, así
-- corregir la lista es editar esta consulta y correrla de nuevo.
do $seed$
declare
  v_jam integer;
begin
  select id into v_jam from pedidos.suppliers where nombre = 'JAM Pharma';
  if v_jam is null then
    raise exception 'No existe el proveedor JAM Pharma';
  end if;

  delete from pedidos.territorio_vetado where supplier_id = v_jam;

  insert into pedidos.territorio_vetado (supplier_id, codigo_inei, motivo)
  select v_jam, u.codigo_inei,
    case
      when u.departamento = 'LIMA' and u.provincia = 'LIMA'
        then 'Lima Metropolitana: JAM Pharma solo se distribuye en Ate, Santa Anita, La Molina, Lurigancho-Chosica, Chaclacayo, La Victoria, San Luis, San Borja, Lince, Lurín y Pachacámac'
      when u.departamento = 'CALLAO'
        then 'El Callao queda fuera del territorio acordado con JAM Pharma'
      else 'Norte del Perú: JAM Pharma no distribuye desde Chimbote hasta Piura'
    end
  from pedidos.ubigeos u
  where
    -- Lima Metropolitana salvo los once distritos del acuerdo.
    (u.departamento = 'LIMA' and u.provincia = 'LIMA' and u.codigo_inei not in (
       '150103', -- ATE
       '150107', -- CHACLACAYO
       '150114', -- LA MOLINA
       '150115', -- LA VICTORIA
       '150116', -- LINCE
       '150118', -- LURIGANCHO (Chosica)
       '150119', -- LURIN
       '150123', -- PACHACAMAC
       '150130', -- SAN BORJA
       '150134', -- SAN LUIS
       '150137'  -- SANTA ANITA
     ))
    or u.departamento = 'CALLAO'
    or u.departamento in ('LA LIBERTAD', 'LAMBAYEQUE', 'PIURA', 'TUMBES')
    or (u.departamento = 'ANCASH' and u.provincia in (
         'SANTA', 'PALLASCA', 'CORONGO', 'SIHUAS',
         'POMABAMBA', 'MARISCAL LUZURIAGA', 'HUAYLAS'
       ));
end
$seed$;

-- ---------------------------------------------------------------------
-- 3. La pregunta, en un solo lugar
-- ---------------------------------------------------------------------
-- Devuelve el motivo del veto, o null si ese producto sí se puede entregar
-- ahí. Un pedido sin dirección todavía elegida no se veta: la pregunta no
-- se puede contestar, y frenar por falta de dato es frenar ventas de más.
create or replace function pedidos.producto_vetado_en(p_product_id uuid, p_ubigeo text)
returns text
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select z.motivo
  from pedidos.products p
  join pedidos.territorio_vetado z on z.supplier_id = p.supplier_id
  where p.id = p_product_id and z.codigo_inei = p_ubigeo
  limit 1;
$fn$;

comment on function pedidos.producto_vetado_en(uuid, text) is
  'El motivo por el que ese producto no se puede entregar en ese distrito, '
  'o null si se puede.';

-- ---------------------------------------------------------------------
-- 4. El freno dentro de submit_order
-- ---------------------------------------------------------------------
-- Va ANTES del control de crédito: que el proveedor no distribuya ahí no se
-- arregla pagando ni aprobando, así que es el primero que conviene decir.
--
-- Se chequea en el envío aunque la pantalla ya no deje agregar la línea,
-- porque la dirección de entrega se puede cambiar DESPUÉS de haber cargado
-- los productos: ahí el pedido pasa a un distrito vetado sin que nadie
-- toque una línea.
do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  -- Crédito del cliente, en dos escalones.
$viejo$;
  v_nuevo constant text :=
$nuevo$  -- Territorio del proveedor. Hay líneas que no se pueden entregar en el
  -- distrito del pedido porque el proveedor no distribuye ahí.
  if exists (
    select 1
      from pedidos.order_items oi
      join pedidos.products p on p.id = oi.product_id
      join pedidos.customer_addresses ca on ca.id = v_order.customer_address_id
      join pedidos.territorio_vetado z
        on z.supplier_id = p.supplier_id and z.codigo_inei = ca.ubigeo
     where oi.order_id = p_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = (
        select format(
          'El pedido no se puede enviar: %s no se distribuye en %s. %s. Saca estos productos del pedido o cambia la dirección de entrega: %s.',
          string_agg(distinct s.nombre, ', '),
          max(u.distrito),
          max(z.motivo),
          string_agg(distinct p.codigo_interno || ' — ' || p.descripcion, '; '))
          from pedidos.order_items oi
          join pedidos.products p on p.id = oi.product_id
          join pedidos.suppliers s on s.id = p.supplier_id
          join pedidos.customer_addresses ca on ca.id = v_order.customer_address_id
          join pedidos.territorio_vetado z
            on z.supplier_id = p.supplier_id and z.codigo_inei = ca.ubigeo
          join pedidos.ubigeos u on u.codigo_inei = ca.ubigeo
         where oi.order_id = p_order_id);
  end if;

  -- Crédito del cliente, en dos escalones.
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'submit_order';

  if v_def is null then
    raise exception 'No existe pedidos.submit_order';
  end if;
  if position('pedidos.territorio_vetado' in v_def) > 0 then
    raise notice 'El territorio del proveedor ya estaba aplicado en submit_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'submit_order no tiene el bloque de la 1048: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;
