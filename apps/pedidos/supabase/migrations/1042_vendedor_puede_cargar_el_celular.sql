-- El vendedor no podía cargar el celular que la migración 1040 le exige.
--
-- 1040 dejó el pedido sin salir hasta tener un celular válido, y la pantalla
-- del pedido muestra el recuadro para cargarlo ahí mismo. Pero la única
-- policy de UPDATE sobre `customers` es `customers_update_control_o_admin`:
-- un vendedor no puede escribir esa tabla. Y como una fila que RLS esconde
-- no es un error sino simplemente cero filas afectadas, el update salía
-- "bien" sin guardar nada. El vendedor tocaba "Guardar celular", no pasaba
-- nada, y el pedido seguía trabado. Al administrador sí le funcionaba, que
-- es por lo que no se vio antes.
--
-- Abrir `customers` al UPDATE para vendedores sería mucho más de lo que hace
-- falta: podrían cambiar la razón social, el canal —que decide el precio— o
-- el estado. Por eso va una función SECURITY DEFINER que toca UNA columna,
-- valida el formato, y sólo deja hacerlo sobre un cliente que quien llama ya
-- puede ver. El trigger de auditoría sigue registrando el cambio con el
-- usuario real, porque auth.uid() no cambia dentro de la función.

create or replace function pedidos.set_customer_whatsapp(
  p_customer_id uuid,
  p_celular text
)
returns text
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $function$
declare
  v_customer record;
  v_normalizado text;
  v_puede boolean;
begin
  -- Solo dígitos: la gente escribe "987 654 321" y "+51 987654321", y las
  -- dos son el mismo número. Mismo criterio que domain/celular.ts.
  v_normalizado := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  if length(v_normalizado) = 11 and v_normalizado like '51%' then
    v_normalizado := substring(v_normalizado from 3);
  end if;

  if v_normalizado = '' then
    raise exception 'Falta el celular del cliente.';
  end if;
  if v_normalizado !~ '^9[0-9]{8}$' then
    raise exception 'El celular tiene que ser un número de 9 dígitos que empiece en 9.';
  end if;

  select * into v_customer from pedidos.customers where id = p_customer_id;
  if v_customer is null then
    raise exception 'El cliente no existe';
  end if;

  -- Quién puede: la misma regla con la que el cliente se ve en pantalla
  -- (policy `customers_select`). Si alguien ya lo tiene delante para armarle
  -- un pedido, puede cargarle el número — no puede tocarle nada más.
  v_puede := pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('operaciones')
    or pedidos.has_role('aprobador_comercial')
    or (pedidos.has_role('vendedor') and not pedidos.zonas_restringen_visibilidad())
    or v_customer.zona_id in (select pedidos.current_user_zone_ids());

  if not v_puede then
    raise exception 'No autorizado para cargar el celular de este cliente';
  end if;

  update pedidos.customers
     set whatsapp = v_normalizado
   where id = p_customer_id;

  return v_normalizado;
end;
$function$;

revoke all on function pedidos.set_customer_whatsapp(uuid, text) from public;
grant execute on function pedidos.set_customer_whatsapp(uuid, text) to authenticated;
