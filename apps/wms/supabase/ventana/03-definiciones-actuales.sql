-- SOLO LECTURA. Se corre ANTES de tocar nada y se GUARDA el resultado: son las definiciones originales de las dos funciones de permisos
-- que la ventana modifica. Si hay que revertir, se restauran tal cual están aquí.
select 'public.schemas_compras_y_pagos()' as funcion, pg_get_functiondef('public.schemas_compras_y_pagos()'::regprocedure) as definicion
union all
select 'public.aplicar_grants_del_modulo()', pg_get_functiondef('public.aplicar_grants_del_modulo()'::regprocedure);
