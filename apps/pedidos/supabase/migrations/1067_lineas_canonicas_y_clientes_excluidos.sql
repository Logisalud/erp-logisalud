-- 1067 — El ranking por líneas usa el nombre del negocio, y dos clientes
-- quedan fuera del análisis comercial.
--
-- ── Las líneas ───────────────────────────────────────────────────────────
-- El tablero mostraba la línea tal como viene en el archivo: "GENERICO",
-- "OTC", "VENTA CON RECETA", "CUIDADO PERSONAL". Son todas de Diphasac,
-- pero el nombre no lo dice, así que convivían con "DIPHASAC - VENTA CON
-- RECETA" como si fueran cosas distintas: la misma línea partida en dos
-- renglones del ranking.
--
-- La equivalencia NO se inventa: sale de la hoja "lineas" del propio
-- archivo de avance, la misma que alimenta los rótulos de la hoja "Cuota".
-- Así el tablero y el avance hablan el mismo idioma. Los códigos cortos
-- (GX, RX, MX, CP) son los que usa el negocio en la cuota.
--
-- ── Los clientes ─────────────────────────────────────────────────────────
-- Dos clientes que la empresa decidió no contar por fraude (2026-11-26).
-- NO se borran sus comprobantes: la venta ocurrió y la contabilidad la
-- tiene. Lo que se hace es dejarlos fuera del análisis comercial, donde
-- distorsionan el ranking, el share por línea y la clasificación.
--
-- Queda como tabla y no como una condición escondida en la función para
-- que se vea quién está afuera y por qué, y para que volver a incluir a
-- alguien sea borrar una fila.
--
-- Impacto medido al aplicarlo: la venta neta de 12 meses pasa de
-- S/ 2.425.604,03 a S/ 2.412.841,43 (-12.762,60, que es exactamente
-- Latinos Farma), los clientes con compra de 1.008 a 1.006 y la lista de
-- clientes de 894 a 893.
--
-- Aplicado a mano contra la base (ver el README de migraciones).
-- Re-ejecutable.

create table if not exists comercial.lineas_canonicas (
  linea_cruda text primary key,
  linea       text not null
);

insert into comercial.lineas_canonicas (linea_cruda, linea) values
  ('GENERICO',               'DIPHASAC - GX'),
  ('OTC',                    'DIPHASAC - OTC'),
  ('CUIDADO PERSONAL',       'DIPHASAC - CP'),
  ('VENTA CON RECETA',       'DIPHASAC - RX'),
  ('DIPHASAC - VENTA CON RECETA', 'DIPHASAC - RX'),
  ('DIPHASAC - METABOLICA',  'DIPHASAC - RX'),
  ('METABOLICO',             'DIPHASAC - MX'),
  ('PRADES - NUTRACEUTICOS', 'PRADES'),
  ('DARENUTRITION',          'DARE NUTRITION'),
  ('BIOSANA - FARMA',        'BIOSANA - FARMA'),
  ('BIOSANA - NATURAL',      'BIOSANA - NATURAL'),
  ('BIOSANA - COSMETICA',    'BIOSANA - COSMETICA'),
  ('REUMASOL',               'REUMASOL'),
  ('JAM - PHARMA',           'OTROS'),
  ('DIMEXA',                 'OTROS'),
  ('INTIPHARMA',             'OTROS'),
  ('GENERION - CORPORATION', 'OTROS'),
  ('DESCUENTO',              'DESCUENTO')
on conflict (linea_cruda) do update set linea = excluded.linea;

create table if not exists comercial.clientes_excluidos (
  ruc         text primary key,
  razon       text,
  motivo      text not null,
  excluido_en date not null default current_date
);

insert into comercial.clientes_excluidos (ruc, razon, motivo) values
  ('20612227927', 'DROGUERIA DISTRIBUIDORA LATINOS FARMA E.I.R.L.', 'Fraude: la empresa decidió no contarlo (2026-11-26)'),
  ('20551523226', 'CONSTRUCTION INVESTMENTS', 'Fraude: la empresa decidió no contarlo (2026-11-26)')
on conflict (ruc) do nothing;

revoke all on comercial.lineas_canonicas, comercial.clientes_excluidos from anon, authenticated;

-- La historia ya cargada se normaliza una vez. De acá en adelante lo hace
-- el refresco del avance (ver 1068).
update comercial.ventas_detalle v
set linea = c.linea
from comercial.lineas_canonicas c
where upper(trim(v.linea)) = c.linea_cruda and v.linea <> c.linea;

-- ── El filtro en la función del tablero ──────────────────────────────────
-- Dos puntos de entrada y nada más: todo lo demás deriva de `v` (venta,
-- líneas, productos, reposición) o de `rk` (clasificación, categorías,
-- movimientos). El parche se aplica sobre el texto de la función para no
-- transcribir a mano sus 90 líneas, y aborta si alguna de las dos anclas
-- no aparece exactamente una vez.
do $do$
declare
  src text;
  ancla_v  text := '  from ventas_detalle d where not anulado' || chr(10);
  ancla_rk text := 'rk as (select r.* from ranking_clientes r, per where r.periodo = per.p),';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'comercial' and p.proname = 'dashboard_datos';

  if src like '%clientes_excluidos%' then
    return;  -- ya parchada
  end if;

  if (length(src) - length(replace(src, ancla_v, ''))) / length(ancla_v) <> 1
     or (length(src) - length(replace(src, ancla_rk, ''))) / length(ancla_rk) <> 1 then
    raise exception 'Las anclas de dashboard_datos no aparecen una sola vez. No se toca nada.';
  end if;

  src := replace(src, ancla_v,
    ancla_v || '    and not exists (select 1 from clientes_excluidos e where e.ruc = d.ruc)' || chr(10));

  src := replace(src, ancla_rk,
    'rk as (select r.* from ranking_clientes r, per where r.periodo = per.p' || chr(10) ||
    '       and not exists (select 1 from clientes_excluidos e where e.ruc = r.ruc)),');

  execute src;
end $do$;
