-- SOLO LECTURA. Los números de Cobranzas, para comparar ANTES y DESPUÉS (deben ser idénticos).
-- Referencia del 2026-10-08: saldo pendiente 646.898,20 y catalogo.productos = 509 (cambian si hubo operación real entre esa fecha y la ventana).
select 'cartera: documentos con saldo' as indicador, count(*)::text as valor from public.v_saldos
union all select 'cartera: saldo pendiente total', round(sum(saldo_pendiente)::numeric, 2)::text from public.v_saldos
union all select 'clientes', count(*)::text from public.clientes
union all select 'documentos', count(*)::text from public.documentos
union all select 'pagos', count(*)::text from public.pagos
union all select 'letras', count(*)::text from public.letras
union all select 'letra_documento', count(*)::text from public.letra_documento
union all select 'perfiles (usuarios)', count(*)::text from public.perfiles
union all select 'catalogo.productos', count(*)::text from catalogo.productos
union all select 'compras.ordenes_compra', count(*)::text from compras.ordenes_compra
union all select 'compras.ordenes_compra_items', count(*)::text from compras.ordenes_compra_items
union all select 'almacen.recepciones', count(*)::text from almacen.recepciones
order by 1;
