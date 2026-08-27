-- Elimina pedidos.cliente_config.whatsapp.
--
-- El telefono del cliente vive en public.clientes.celular, que es la unica
-- tabla de clientes del ERP y tiene mas datos (507 telefonos) que los que
-- traia el origen de Pedidos (456). Tener las dos columnas dejaria el mismo
-- dato envejeciendo por separado, que es el problema que la unificacion vino a
-- resolver. Una columna que no deberia usarse nunca termina usandose.
--
-- Nunca se cargo: 1005 no la copio a proposito. Igual se verifica que siga
-- vacia antes de tirarla, por si alguien la lleno entre medio.
--
-- Re-ejecutable.
do $$
declare con_dato int;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'pedidos' and table_name = 'cliente_config'
                   and column_name = 'whatsapp') then
    return;
  end if;

  select count(*) into con_dato
    from pedidos.cliente_config where whatsapp is not null;

  if con_dato > 0 then
    raise exception 'No se elimina: % filas tienen whatsapp cargado. Revisar antes de borrar.', con_dato;
  end if;

  alter table pedidos.cliente_config drop column whatsapp;
end $$;
