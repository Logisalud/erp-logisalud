-- Configuración de umbrales del módulo — clave/valor genérico, para no
-- hardcodear el umbral de "OC parcial hace demasiado tiempo" (Carta de
-- Simplicidad regla 7: la alerta tiene que poder ajustarse sin deploy).
-- Mismo patrón que compras.flags (0025_acceso_temporal_abierto.sql): tabla
-- chica, RLS de lectura abierta a cualquier autenticado y escritura solo
-- admin.
--
-- Se lee al vuelo cuando se carga el Dashboard o el visor de OC — sin cron,
-- esta app todavía no tiene esa infraestructura (mismo motivo documentado
-- para las alertas de fraccionamiento/letras en servicios/financiamiento.ts).

create table if not exists compras.configuracion (
  clave text primary key,
  valor text not null
);

insert into compras.configuracion (clave, valor)
values ('oc_parcial_alerta_dias', '30')
on conflict (clave) do nothing;

alter table compras.configuracion enable row level security;

drop policy if exists configuracion_lectura on compras.configuracion;
create policy configuracion_lectura on compras.configuracion
  for select to authenticated
  using (true);

drop policy if exists configuracion_escritura on compras.configuracion;
create policy configuracion_escritura on compras.configuracion
  for all to authenticated
  using (public.area_en('admin'))
  with check (public.area_en('admin'));
