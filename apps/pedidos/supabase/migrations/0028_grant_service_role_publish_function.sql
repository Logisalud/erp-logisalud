-- El flujo normal de la app llama a publish_price_list() con el
-- cliente autenticado (ya tiene EXECUTE desde 0026). Se agrega acá
-- también a service_role para permitir invocarla desde tareas de
-- servidor/verificación que usan el cliente admin.

grant execute on function pedidos.publish_price_list to service_role;
