-- 0056 — Proveedor comodín para el backlog pre-ERP.
--
-- Sebas está regularizando retiros anteriores al ERP y de algunos NO SABE a
-- qué proveedor correspondían. El formulario de Pago Directo exige elegir o
-- crear un proveedor con RUC, así que sin esto el backlog se traba en la
-- primera fila desconocida.
--
-- POR QUÉ UN COMODÍN Y NO UN RUC INVENTADO POR CASO: la validación de RUC
-- pide 11 dígitos pero NO verifica el dígito comprobador (ver
-- domain/proveedor.ts::validarRUC), así que cualquier número de 11 cifras
-- entra y después, en un reporte, se ve idéntico a un proveedor real. Un
-- comodín con nombre explícito dice la verdad: "no sabemos quién era".
--
-- POR QUÉ 00000000000: es el único valor que cumple las tres condiciones a
-- la vez — pasa el validador de 11 dígitos, es IMPOSIBLE que sea un RUC real
-- (los peruanos empiezan en 10, 15, 17 o 20, nunca en 0) y se lee a simple
-- vista como "esto no es un dato". Un 99999999999 también es falso pero se
-- parece más a algo real.
--
-- UNO SOLO, garantizado por el esquema: `compras.proveedores` tiene
-- UNIQUE (ruc), así que un segundo comodín es imposible. No depende de que
-- nadie se acuerde.
--
-- TEMPORAL: muere junto con la categoría "Regularización de pagos antiguos
-- (pre-ERP)" (migración 0053). Ver CONTEXTO.md — las dos se desactivan
-- cuando Sebas termine el backlog.
--
-- Re-ejecutable: `where not exists`.

insert into compras.proveedores (ruc, razon_social, tipo, condicion_pago_dias, moneda_principal, activo)
select
  '00000000000',
  -- El nombre arranca con "SIN IDENTIFICAR" para que ordene arriba en
  -- cualquier listado alfabético y grite lo que es apenas aparece en el
  -- buscador. Es la salvaguarda real: el RUC casi no se muestra en pantalla,
  -- la razón social sí.
  'SIN IDENTIFICAR — Backlog pre-ERP',
  -- 'ambos' porque el backlog mezcla mercadería vieja con letras y retiros:
  -- así es elegible en cualquier contexto, sin necesidad de un segundo
  -- registro para servicios.
  'ambos',
  0,
  'PEN',
  true
where not exists (
  select 1 from compras.proveedores where ruc = '00000000000'
);
