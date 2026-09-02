-- Condición de pago con días de crédito escritos a mano.
--
-- El catálogo sólo tenía Contado y Crédito 30/45/60/90/120. Cuando el
-- cliente pide 15 días —o 75, o cualquier número que no esté en la lista—
-- el vendedor no tenía dónde anotarlo: elegía la opción más parecida y el
-- dato real se perdía.
--
-- No se resuelve agregando filas al catálogo: cada número nuevo se
-- volvería una condición "estándar" más, y el punto es exactamente el
-- contrario. Se agrega UNA opción de entrada libre, marcada como tal, y el
-- número solicitado se guarda en el pedido.

-- ---------------------------------------------------------------------
-- 1. La opción de entrada libre en el catálogo
-- ---------------------------------------------------------------------

alter table pedidos.payment_terms
  add column if not exists permite_dias_libres boolean not null default false;

comment on column pedidos.payment_terms.permite_dias_libres is
  'true sólo en la opción de entrada libre: al elegirla el pedido exige un número de días en orders.dias_credito_solicitados. Ninguna condición estándar la tiene.';

insert into pedidos.payment_terms (nombre, descripcion, permite_dias_libres)
select
  'Crédito (otro número de días)',
  'Días de crédito escritos a mano al armar el pedido. No es una condición estándar: siempre cae en excepción administrativa.',
  true
where not exists (
  select 1 from pedidos.payment_terms where permite_dias_libres
);

-- ---------------------------------------------------------------------
-- 2. Los días solicitados, en el pedido
-- ---------------------------------------------------------------------

-- Va en `orders` y no en el catálogo porque es un dato DEL PEDIDO: dos
-- pedidos con la misma condición de entrada libre pueden pedir 15 y 75.
alter table pedidos.orders
  add column if not exists dias_credito_solicitados smallint;

comment on column pedidos.orders.dias_credito_solicitados is
  'Días de crédito escritos a mano por quien armó el pedido. Sólo se llena con la condición de pago de entrada libre; con cualquier condición estándar queda null.';

alter table pedidos.orders
  drop constraint if exists orders_dias_credito_rango_check;

alter table pedidos.orders
  add constraint orders_dias_credito_rango_check
  check (dias_credito_solicitados is null
         or (dias_credito_solicitados > 0 and dias_credito_solicitados <= 365));

-- La coherencia entre la condición elegida y el número de días no se puede
-- expresar en un CHECK (mira otra tabla), así que la sostiene un trigger:
-- con la condición de entrada libre el número es obligatorio, y con
-- cualquier otra tiene que quedar null. Sin esto, un pedido podría decir
-- "Contado" y arrastrar 15 días fantasma.
create or replace function pedidos.check_dias_credito_coherentes()
returns trigger
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_libre boolean;
begin
  select permite_dias_libres into v_libre
  from pedidos.payment_terms where id = new.payment_terms_id;

  if coalesce(v_libre, false) then
    if new.dias_credito_solicitados is null then
      raise exception 'La condición de pago de días libres exige indicar el número de días';
    end if;
  elsif new.dias_credito_solicitados is not null then
    raise exception 'Sólo la condición de pago de días libres admite un número de días';
  end if;

  return new;
end;
$$;

drop trigger if exists check_dias_credito_coherentes on pedidos.orders;

create trigger check_dias_credito_coherentes
  before insert or update of payment_terms_id, dias_credito_solicitados
  on pedidos.orders
  for each row execute function pedidos.check_dias_credito_coherentes();
