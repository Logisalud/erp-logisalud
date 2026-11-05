-- 1055 — JAM Pharma abre el norte.
--
-- La 1049 metió el acuerdo de distribución de JAM Pharma en la base: 297
-- distritos donde su línea no se podía vender. Esa lista tenía dos mitades
-- bien distintas:
--
--   * 258 filas del NORTE —La Libertad, Lambayeque, Piura, Tumbes y el
--     norte de Áncash, "desde Chimbote hasta Piura"—.
--   * 39 filas de LIMA METROPOLITANA fuera de los once distritos del
--     acuerdo (32) y del CALLAO (7).
--
-- El 2026-11-05 JAM dio el visto bueno para vender en el norte. Esta
-- migración borra esas 258 filas y deja las 39 de Lima y Callao intactas:
-- ahí el acuerdo sigue igual que ayer.
--
-- POR QUÉ SE ABRE PARA TODOS Y NO PARA UNA PERSONA
--
-- El VB llegó junto con el nombre de un vendedor, Luis Vargas (CRP1001),
-- y la pregunta natural era habilitarlo a él. No se hizo así por dos
-- razones concretas:
--
--   1. Luis Vargas no tiene ni un cliente en el norte: su cartera es 141
--      en Lima, 62 en Callao y 23 sin departamento. Los 157 clientes del
--      norte son de Omar Rubio (DTRU01), Omar Quevedo (DTRU03), Milagros
--      Soto (DTRU02) y Fabiola Samaniego (DHYO01). Habilitarlo a él no
--      destrabaría un solo pedido del norte; lo único que abriría son sus
--      50 clientes de Lima Metropolitana y Callao, que es justo lo que el
--      acuerdo con JAM excluye.
--   2. El permiso es del territorio, no de la persona. Si mañana el norte
--      cambia de vendedor —pasó esta misma semana con dos zonas— una regla
--      atada a un nombre vuelve a frenar pedidos sin que nadie entienda
--      por qué.
--
-- San Martín, Cajamarca, Amazonas y Loreto nunca estuvieron vetados: el
-- acuerdo decía "desde Chimbote hasta Piura", que es la costa norte.

do $abrir$
declare
  v_jam integer;
  v_borradas integer;
begin
  select id into v_jam from pedidos.suppliers where nombre = 'JAM Pharma';
  if v_jam is null then
    raise exception 'No existe el proveedor JAM Pharma';
  end if;

  delete from pedidos.territorio_vetado tv
   using pedidos.ubigeos u
   where u.codigo_inei = tv.codigo_inei
     and tv.supplier_id = v_jam
     and u.departamento in ('LA LIBERTAD','LAMBAYEQUE','PIURA','TUMBES','ANCASH');

  get diagnostics v_borradas = row_count;
  raise notice 'JAM Pharma: % distritos del norte liberados.', v_borradas;

  -- Lo que tiene que quedar: Lima Metropolitana (32) + Callao (7).
  if (select count(*) from pedidos.territorio_vetado where supplier_id = v_jam) <> 39 then
    raise exception 'Quedaron % filas vetadas para JAM Pharma; se esperaban 39 (Lima Metropolitana y Callao)',
      (select count(*) from pedidos.territorio_vetado where supplier_id = v_jam);
  end if;
end
$abrir$;
