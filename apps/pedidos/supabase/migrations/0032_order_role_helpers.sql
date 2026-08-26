-- Análogo a pedidos.is_admin()/has_role(): resuelve el seller_id del
-- usuario autenticado cuando existe vínculo sellers.user_id (Fase 4).
--
-- No reemplaza pedidos.current_user_zone_ids() (Fase 2, base del RLS
-- de customers) — orders se particiona por seller_id directo, no por
-- zona, porque zone_assignments sigue desincronizado de sellers (ver
-- docs/data-model.md): sellers.user_id recién empieza a poblarse en
-- esta fase, y zone_assignments.vendedor nunca se llenó a partir de
-- sellers. Particionar por seller_id evita depender de esa sincronía.

create function pedidos.current_seller_id()
returns uuid
language sql
security definer
stable
set search_path = pedidos, public
as $$
  select id from pedidos.sellers where user_id = auth.uid() limit 1;
$$;
