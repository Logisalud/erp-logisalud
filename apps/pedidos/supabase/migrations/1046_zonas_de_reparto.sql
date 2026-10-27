-- 1046 — Zonas de reparto, plan semanal y orden de ruta.
--
-- Hasta hoy el ERP sabe A DÓNDE va cada pedido (ubigeo) pero no CÓMO se
-- agrupan esos destinos para salir a repartir. Eso vivía en un Excel y en
-- la cabeza de quien carga la unidad.
--
-- Las cinco zonas, el plan semanal y el orden de visita salen del análisis
-- de 2.894 guías de remisión (01/10/2025 – 26/10/2026) que hizo el usuario:
-- Norte 25% del volumen, Centro 22%, Sur 22%, Este 18%, Lima Moderna 13%,
-- ~56 guías por semana. De ahí el plan de dos visitas por zona por semana,
-- con zonas vecinas el mismo día.
--
-- OJO — las tres tablas son CATÁLOGO EDITABLE, no constantes de código. El
-- reparto cambia con el negocio (una zona que crece, un distrito que pasa
-- de Centro a Lima Moderna, un día que se reacomoda) y eso no puede
-- necesitar un deploy. Por eso el orden de visita es una columna y no un
-- `order by` escrito en una consulta.
--
-- No se tocan `pedidos.zones` ni `zone_assignments`: esas son las zonas
-- COMERCIALES, de qué vendedor atiende a qué cliente. Son otra cosa y no
-- coinciden — un vendedor cruza media Lima, un camión no.

-- ---------------------------------------------------------------------
-- 1. Las cinco zonas
-- ---------------------------------------------------------------------
create table if not exists pedidos.zonas_reparto (
  id smallint primary key,
  codigo text not null unique,
  nombre text not null,
  -- Orden en que se recorren saliendo del almacén de Lurín. Es el que
  -- decide cómo sale impresa la hoja de ruta.
  orden_ruta smallint not null,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now()
);

insert into pedidos.zonas_reparto (id, codigo, nombre, orden_ruta) values
  (1, 'SUR',     'Sur',           1),
  (2, 'MODERNA', 'Lima Moderna',  2),
  (3, 'CENTRO',  'Centro',        3),
  (4, 'ESTE',    'Este',          4),
  (5, 'NORTE',   'Norte y Callao',5)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Qué distrito cae en qué zona, y en qué orden se visita
-- ---------------------------------------------------------------------
-- `orden_distrito` es el orden DENTRO de la zona, de más lejos del almacén
-- a más cerca o al revés según convenga manejar. Es un punto de partida
-- razonable, no una optimización de recorrido: no mira kilómetros, tráfico
-- ni horarios de recepción del cliente. Se corrige editando el número.
create table if not exists pedidos.ubigeo_zona_reparto (
  codigo_inei text primary key references pedidos.ubigeos (codigo_inei),
  zona_reparto_id smallint not null references pedidos.zonas_reparto (id),
  orden_distrito smallint not null default 99
);

create index if not exists ubigeo_zona_reparto_zona_idx
  on pedidos.ubigeo_zona_reparto (zona_reparto_id, orden_distrito);

insert into pedidos.ubigeo_zona_reparto (codigo_inei, zona_reparto_id, orden_distrito) values
  -- Sur: los balnearios primero (son lo más lejos), después de vuelta
  -- hacia Lima por la Panamericana.
  ('150124', 1,  1), -- PUCUSANA
  ('150138', 1,  2), -- SANTA MARIA DEL MAR
  ('150129', 1,  3), -- SAN BARTOLO
  ('150127', 1,  4), -- PUNTA NEGRA
  ('150126', 1,  5), -- PUNTA HERMOSA
  ('150119', 1,  6), -- LURIN
  ('150123', 1,  7), -- PACHACAMAC
  ('150142', 1,  8), -- VILLA EL SALVADOR
  ('150143', 1,  9), -- VILLA MARIA DEL TRIUNFO
  ('150133', 1, 10), -- SAN JUAN DE MIRAFLORES
  ('150108', 1, 11), -- CHORRILLOS
  -- Lima Moderna: de sur a norte por la costa.
  ('150104', 2, 1), -- BARRANCO
  ('150122', 2, 2), -- MIRAFLORES
  ('150141', 2, 3), -- SURQUILLO
  ('150140', 2, 4), -- SANTIAGO DE SURCO
  ('150130', 2, 5), -- SAN BORJA
  -- Centro: desde San Isidro hacia el Cercado.
  ('150131', 3,  1), -- SAN ISIDRO
  ('150120', 3,  2), -- MAGDALENA DEL MAR
  ('150136', 3,  3), -- SAN MIGUEL
  ('150121', 3,  4), -- PUEBLO LIBRE
  ('150113', 3,  5), -- JESUS MARIA
  ('150116', 3,  6), -- LINCE
  ('150105', 3,  7), -- BREÑA
  ('150101', 3,  8), -- LIMA (CERCADO)
  ('150128', 3,  9), -- RIMAC
  ('150115', 3, 10), -- LA VICTORIA
  ('150134', 3, 11), -- SAN LUIS
  -- Este: subiendo por la Carretera Central.
  ('150114', 4, 1), -- LA MOLINA
  ('150109', 4, 2), -- CIENEGUILLA
  ('150103', 4, 3), -- ATE
  ('150137', 4, 4), -- SANTA ANITA
  ('150111', 4, 5), -- EL AGUSTINO
  ('150132', 4, 6), -- SAN JUAN DE LURIGANCHO
  ('150118', 4, 7), -- LURIGANCHO (CHOSICA)
  ('150107', 4, 8), -- CHACLACAYO
  -- Norte y Callao: primero el cono norte por Panamericana, después el
  -- Callao de vuelta hacia el sur.
  ('150112', 5,  1), -- INDEPENDENCIA
  ('150117', 5,  2), -- LOS OLIVOS
  ('150110', 5,  3), -- COMAS
  ('150106', 5,  4), -- CARABAYLLO
  ('150125', 5,  5), -- PUENTE PIEDRA
  ('150139', 5,  6), -- SANTA ROSA
  ('150102', 5,  7), -- ANCON
  ('070106', 5,  8), -- VENTANILLA
  ('070107', 5,  9), -- MI PERU
  ('150135', 5, 10), -- SAN MARTIN DE PORRES
  ('070103', 5, 11), -- CARMEN DE LA LEGUA-REYNOSO
  ('070101', 5, 12), -- CALLAO
  ('070102', 5, 13), -- BELLAVISTA
  ('070104', 5, 14), -- LA PERLA
  ('070105', 5, 15)  -- LA PUNTA
on conflict (codigo_inei) do nothing;

-- ---------------------------------------------------------------------
-- 3. El plan semanal
-- ---------------------------------------------------------------------
-- Dos visitas por zona por semana, dos zonas por día, zonas vecinas el
-- mismo día. `dia_semana` sigue a ISO: 1 = lunes … 5 = viernes.
--
-- La pareja Norte+Este (jueves) es la más forzada en términos de cercanía;
-- se eligió para que la carga quede pareja entre los días. Queda acá y no
-- en el código justo para poder cambiarla sin deploy.
create table if not exists pedidos.plan_semanal_reparto (
  dia_semana smallint not null check (dia_semana between 1 and 7),
  zona_reparto_id smallint not null references pedidos.zonas_reparto (id),
  primary key (dia_semana, zona_reparto_id)
);

insert into pedidos.plan_semanal_reparto (dia_semana, zona_reparto_id) values
  (1, 5), (1, 3),  -- lunes:     Norte + Centro
  (2, 1), (2, 2),  -- martes:    Sur + Lima Moderna
  (3, 4), (3, 3),  -- miércoles: Este + Centro
  (4, 5), (4, 4),  -- jueves:    Norte + Este
  (5, 1), (5, 2)   -- viernes:   Sur + Lima Moderna
on conflict (dia_semana, zona_reparto_id) do nothing;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
-- Catálogo: lo lee cualquier autenticado (Operaciones arma la ruta, el
-- vendedor podría querer ver qué día le toca a su cliente) y lo escribe
-- solo el administrador, como el resto de los maestros.
alter table pedidos.zonas_reparto        enable row level security;
alter table pedidos.ubigeo_zona_reparto  enable row level security;
alter table pedidos.plan_semanal_reparto enable row level security;

drop policy if exists "zonas_reparto_lectura" on pedidos.zonas_reparto;
create policy "zonas_reparto_lectura" on pedidos.zonas_reparto
  for select to authenticated using (true);

drop policy if exists "zonas_reparto_escritura" on pedidos.zonas_reparto;
create policy "zonas_reparto_escritura" on pedidos.zonas_reparto
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists "ubigeo_zona_reparto_lectura" on pedidos.ubigeo_zona_reparto;
create policy "ubigeo_zona_reparto_lectura" on pedidos.ubigeo_zona_reparto
  for select to authenticated using (true);

drop policy if exists "ubigeo_zona_reparto_escritura" on pedidos.ubigeo_zona_reparto;
create policy "ubigeo_zona_reparto_escritura" on pedidos.ubigeo_zona_reparto
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists "plan_semanal_reparto_lectura" on pedidos.plan_semanal_reparto;
create policy "plan_semanal_reparto_lectura" on pedidos.plan_semanal_reparto
  for select to authenticated using (true);

drop policy if exists "plan_semanal_reparto_escritura" on pedidos.plan_semanal_reparto;
create policy "plan_semanal_reparto_escritura" on pedidos.plan_semanal_reparto
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());
