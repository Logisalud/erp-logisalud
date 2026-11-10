-- 0044 · WMS · Piloto (Fase 4, P5): registro de los reinicios del piloto (`wms.reinicios`)
--
-- Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear). Requiere 0042 (usa su ayudante _solo_agregar).
-- El reinicio del 1 de diciembre NO es una función ni un botón: es un script manual (`apps/wms/scripts/reinicio-piloto.mjs`) que corre con la conexión del dueño de la base, con una copia
-- de Supabase del mismo día confirmada con una bandera. Cada reinicio deja UNA fila aquí. La tabla queda FUERA de lo que el reinicio borra y solo admite agregar filas; la aplicación
-- no escribe en ella (ninguna función ni permiso para `authenticated`): solo se puede leer.

create table if not exists wms.reinicios (
  id uuid primary key default gen_random_uuid(),
  fecha_copia date not null,                       -- la fecha de la copia de Supabase confirmada con --confirmo-copia-del-dia
  ejecutado_por text not null check (btrim(ejecutado_por) <> ''),
  tablas jsonb not null,                           -- {tabla: filas borradas}
  archivos jsonb not null default '{}'::jsonb,     -- {borrados, conservados, prefijos}
  auditoria_archivo text,                          -- el archivo (fuera de la base) donde quedó la auditoría exportada
  auditoria_filas integer not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
alter table wms.reinicios enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'wms' and tablename = 'reinicios' and policyname = 'lectura') then
    create policy lectura on wms.reinicios for select to authenticated using (wms.es_usuario());
  end if;
end $$;
grant select on wms.reinicios to authenticated;
do $$ begin if exists (select 1 from pg_trigger where tgname = 'reinicios_solo_agregar' and tgrelid = 'wms.reinicios'::regclass and not tgisinternal) then drop trigger reinicios_solo_agregar on wms.reinicios; end if; end $$;
create trigger reinicios_solo_agregar before update or delete on wms.reinicios for each row execute function wms._solo_agregar();

revoke execute on all functions in schema wms from public;
