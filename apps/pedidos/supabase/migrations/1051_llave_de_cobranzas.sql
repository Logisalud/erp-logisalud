-- 1051 — El mismo cliente, escrito distinto en cada ERP.
--
-- Cobranzas guarda la llave como once dígitos SIEMPRE: su columna
-- `clientes.ruc` tiene un CHECK de `^[0-9]{11}$`, así que un RUC entra tal
-- cual y un DNI entra relleno con ceros (`74920171` → `00074920171`).
-- Pedidos guarda el documento pelado, como lo escribió el vendedor.
--
-- Comparar los dos en crudo hace que ningún cliente con DNI cruce nunca.
-- En el puente de contactos eso significa que no se le completa la ficha;
-- acá, en el control de crédito, significa algo peor: `credito_nivel` no
-- encuentra su deuda y contesta 'ninguno', así que **a un cliente con DNI
-- no se le aplica ni la alerta ni el freno de 60 días**, deba lo que deba.
--
-- Se descubrió el 2026-11-03 investigando por qué un cliente con celular y
-- dirección en pedidos seguía en blanco en la cartera de cobranzas.
--
-- Hoy no hay ninguno de esos clientes pasado de los 60 días —de los 10 con
-- DNI en la copia, 3 tienen vencido por S/ 3.606,27 y ninguno llega al
-- tope—, así que esto no destraba ni frena ningún pedido existente. Es
-- cerrar el agujero antes de que alguien caiga en él.

-- ---------------------------------------------------------------------
-- 1. La regla de la llave, en un solo lugar
-- ---------------------------------------------------------------------
-- Se rellena SOLO el documento de ocho dígitos, que es la forma del DNI.
-- Rellenar cualquier cosa corta inventaría cruces: un documento de diez
-- dígitos no es un DNI ni un RUC, y hacerlo pasar por uno de once lo
-- emparejaría con el cliente equivocado. `lpad` además RECORTA lo que pasa
-- de largo, así que aplicarlo a ciegas sobre un documento de doce dígitos
-- lo convertiría en otro distinto.
create or replace function pedidos.clave_cobranzas(p_documento text)
returns text
language sql
immutable
as $fn$
  select case
           when btrim(coalesce(p_documento, '')) = '' then null
           when btrim(p_documento) ~ '^[0-9]{8}$' then lpad(btrim(p_documento), 11, '0')
           else btrim(p_documento)
         end;
$fn$;

comment on function pedidos.clave_cobranzas(text) is
  'El documento de un cliente de pedidos, escrito como lo guarda cobranzas: '
  'el DNI relleno con ceros hasta once, el RUC tal cual.';

-- ---------------------------------------------------------------------
-- 2. El nivel de crédito busca con esa llave
-- ---------------------------------------------------------------------
create or replace function pedidos.credito_nivel(p_ruc text)
returns text
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select coalesce(
    (select case
              when not cfg.activo              then 'ninguno'
              when coalesce(c.vencido, 0) <= 0 then 'ninguno'
              when c.dias_atraso >= cfg.dias_bloqueo    then 'bloqueo'
              when c.dias_atraso >  cfg.dias_tolerancia then 'alerta'
              else 'ninguno'
            end
     from pedidos.credito_config cfg
     left join pedidos.credito_clientes c
            on c.ruc = pedidos.clave_cobranzas(p_ruc)
     where cfg.id = 1),
    'ninguno');
$fn$;

comment on function pedidos.credito_nivel(text) is
  'ninguno | alerta (pasa frenado, lo decide una persona) | bloqueo (no se envía). '
  'Recibe el documento como lo guarda pedidos y lo traduce a la llave de cobranzas.';
