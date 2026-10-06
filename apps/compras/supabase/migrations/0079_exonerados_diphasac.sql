-- Exonerados de IGV que ya estaban en el catálogo (Sebas, 2026-10-06):
-- "Solo Dapha 10, Jamol y Glicofast". Con sus bonificados (BO*).
--
-- DUO DAPHA queda gravado a propósito: "Dapha 10" también calza con
-- "DUO DAPHA 10", pero la respuesta fue "solo" esos tres.
--
-- Re-ejecutable.

update catalogo.productos set exonerado_igv = true, updated_at = now()
 where codigo in (
   -- DAPHA 10 10 MG (x10 y x30)
   'DHP100', 'DHP105', 'DHP106', 'BODHP100', 'BODHP105', 'BODHP106',
   -- GLICOFAST 1000
   'DHP107', 'BODHP107', 'BODHP110',
   -- JAMOL 5
   'DHP108', 'BODHP108', 'BODHP109'
 )
   and not exonerado_igv;

-- Las líneas de OC de estos productos que ya existían. La 0078 dejó todas en
-- false porque la foto se toma al crear la OC — pero acá no cambió el
-- producto: siempre fue exonerado, y la OC lo cargaba con IGV por error.
-- Son tres líneas, de OC-2026-0015 (DAPHA 10) y OC-2026-0018 (JAMOL 5),
-- ambas ya recibidas completas; sin esto la OC diría un total y la deuda
-- otro.
update compras.ordenes_compra_items oi
   set exonerado_igv = true
  from catalogo.productos p
 where p.id = oi.producto_id
   and p.exonerado_igv
   and not oi.exonerado_igv
   and p.codigo in (
     'DHP100', 'DHP105', 'DHP106', 'BODHP100', 'BODHP105', 'BODHP106',
     'DHP107', 'BODHP107', 'BODHP110',
     'DHP108', 'BODHP108', 'BODHP109'
   );
