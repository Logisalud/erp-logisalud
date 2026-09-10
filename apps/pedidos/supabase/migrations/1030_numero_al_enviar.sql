-- 1030 — El número de pedido se asigna al ENVIAR, no al crear el borrador.
--
-- Hasta acá `orders.numero` era `generated always as identity`: el número
-- salía al crear el borrador. Eso hacía que cada borrador abandonado —o
-- abierto por equivocación— se llevara un número, y la numeración real
-- quedara llena de huecos. El primer día de producción los pedidos
-- enviados fueron el #2 y el #5: el #1 lo consumió una prueba y el #3 y el
-- #4 son borradores que nunca se enviaron.
--
-- Ahora el número se asigna en la transición DRAFT → SUBMITTED, y sale de
-- un contador propio (`order_numbering`), no de una secuencia. La
-- diferencia importa: una secuencia NO vuelve atrás si la transacción
-- falla, así que un envío fallido dejaría un hueco igual. El contador es
-- una fila que se actualiza dentro de la misma transacción del envío —
-- si el envío se cae, el número no se gastó.
--
-- El costo es que dos envíos simultáneos se serializan un instante en esa
-- fila. Con el volumen real (decenas de pedidos por día) no se nota, y es
-- el precio de que la numeración no tenga huecos.
--
-- El número se asigna con un TRIGGER y no dentro de submit_order a
-- propósito: así cualquier camino que saque un pedido de DRAFT obtiene su
-- número, incluida una corrección hecha a mano.

create table if not exists pedidos.order_numbering (
  -- Una sola fila, garantizado por el check: no hay "otro" contador.
  id boolean primary key default true check (id),
  ultimo bigint not null default 0
);

insert into pedidos.order_numbering (id, ultimo)
select true, coalesce(max(numero), 0) from pedidos.orders where fecha_envio is not null
on conflict (id) do nothing;

alter table pedidos.order_numbering enable row level security;

drop policy if exists "order_numbering_select_admin" on pedidos.order_numbering;
create policy "order_numbering_select_admin"
  on pedidos.order_numbering for select to authenticated
  using (pedidos.is_admin());

-- `numero` deja de ser identity y pasa a admitir null: un borrador todavía
-- no tiene número. El índice único que ya existe (orders_numero_key) sigue
-- sirviendo — en Postgres un índice único admite varios NULL.
alter table pedidos.orders alter column numero drop identity if exists;
alter table pedidos.orders alter column numero drop not null;

-- Los borradores que hoy tienen número lo devuelven: lo van a recibir
-- cuando se envíen, y mientras tanto no bloquean ese número.
update pedidos.orders set numero = null where estado = 'DRAFT';

create or replace function pedidos.asignar_numero_al_enviar()
returns trigger
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
begin
  -- Sólo la primera vez que el pedido deja de ser borrador. Un pedido que
  -- ya tiene número no lo cambia nunca: es su identidad en el correo, en
  -- el Excel y en la bandeja de la oficina.
  if new.numero is null and new.estado is distinct from 'DRAFT' then
    update pedidos.order_numbering
       set ultimo = ultimo + 1
     where id
    returning ultimo into new.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_numero_al_enviar on pedidos.orders;
create trigger orders_numero_al_enviar
  before update on pedidos.orders
  for each row
  execute function pedidos.asignar_numero_al_enviar();

comment on column pedidos.orders.numero is
  'Correlativo del pedido, asignado al ENVIARLO (DRAFT -> SUBMITTED) por el '
  'trigger orders_numero_al_enviar. Null mientras es borrador. No es un '
  'número de comprobante fiscal.';
