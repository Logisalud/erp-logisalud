-- 1055 — JAM Pharma suma Lima Norte y el Callao.
--
-- La 1049 metió el acuerdo de distribución de JAM Pharma en la base: 297
-- distritos donde su línea no se podía vender. De esos, 32 eran de Lima
-- Metropolitana fuera de los once distritos del acuerdo y 7 del Callao,
-- que quedó afuera por decisión expresa.
--
-- El 2026-11-05 JAM dio el visto bueno para la zona de Lima Norte y el
-- Callao. Esta migración libera esos 17 distritos. El resto del acuerdo
-- no se toca: siguen vetados los 22 distritos restantes de Lima
-- Metropolitana (Lima Sur, Lima Este fuera de los del acuerdo, y los del
-- centro y oeste) y los 258 del norte del país, de Chimbote a Piura.
--
-- CUIDADO AL LEER "EL NORTE"
--
-- El VB se pidió como "el norte", y la 1049 ya usaba esa palabra para otra
-- cosa: el norte del PAÍS. Son dos zonas distintas y no se solapan. Esta
-- migración abre el norte de LIMA. Si algún día se abre el del país, es
-- otra migración y otro VB.
--
-- POR QUÉ POR DISTRITO Y NO POR VENDEDOR
--
-- El VB llegó con el nombre de Luis Vargas (CRP1001), que es quien tiene
-- esa zona: sus 55 clientes están todos en estos 17 distritos y hoy no
-- puede venderles JAM. Aun así la excepción se escribe por territorio y
-- no por persona, que es como ya vive la regla:
--
--   * El permiso es del territorio. Si mañana la zona cambia de vendedor
--     —pasó esta misma semana con dos zonas— una regla atada a un nombre
--     vuelve a frenar pedidos sin que nadie entienda por qué.
--   * Luis Vargas tiene clientes en 8 de los 17 distritos. Carabayllo,
--     Comas, Puente Piedra, Ancón, Santa Rosa, Ventanilla, La Perla,
--     La Punta y Mi Perú todavía no tienen cartera suya, y son
--     justamente a los que va a entrar ahora.
--
-- Rímac y Cercado de Lima entran a pedido del usuario: no son Lima Norte
-- en sentido estricto, pero están en la ruta y ahí hay 3 clientes.

do $abrir$
declare
  v_jam integer;
  v_borradas integer;
  v_quedan integer;
begin
  select id into v_jam from pedidos.suppliers where nombre = 'JAM Pharma';
  if v_jam is null then
    raise exception 'No existe el proveedor JAM Pharma';
  end if;

  delete from pedidos.territorio_vetado tv
   using pedidos.ubigeos u
   where u.codigo_inei = tv.codigo_inei
     and tv.supplier_id = v_jam
     and (
       u.departamento = 'CALLAO'
       or (u.provincia = 'LIMA' and u.distrito in (
             'ANCON', 'CARABAYLLO', 'COMAS', 'INDEPENDENCIA', 'LOS OLIVOS',
             'PUENTE PIEDRA', 'SAN MARTIN DE PORRES', 'SANTA ROSA',
             'RIMAC', 'LIMA'))
     );

  get diagnostics v_borradas = row_count;
  select count(*) into v_quedan from pedidos.territorio_vetado where supplier_id = v_jam;
  raise notice 'JAM Pharma: % distritos liberados, quedan % vetados.', v_borradas, v_quedan;

  -- 297 - 17 = 280: los 258 del norte del país y los 22 que quedan de
  -- Lima Metropolitana. Re-ejecutable: si ya se corrió, borra 0 y el
  -- total sigue dando 280.
  if v_quedan <> 280 then
    raise exception 'Quedaron % filas vetadas para JAM Pharma; se esperaban 280', v_quedan;
  end if;
end
$abrir$;
