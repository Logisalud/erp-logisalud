-- Tres cambios que se aplican juntos porque tocan las mismas tablas.

-- ── PIEZA G: "Anular" en Anticipo y Reembolso ────────────────────────
-- No existía: quien cargaba mal una solicitud no tenía forma de corregir
-- su propio error, ni siquiera antes de que Contabilidad la mirara. Lo
-- único que había era `rechazarPorContabilidad`, que es la acción de la
-- autoridad, no la del creador.
--
-- Mismo patrón que OC/OS/Pago Directo: estado terminal 'anulada' más las
-- columnas del motivo. Ampliar un CHECK es seguro — no puede fallar contra
-- las filas existentes, a diferencia de restringirlo.

alter table gastos.solicitudes_gasto drop constraint if exists solicitudes_gasto_estado_check;
alter table gastos.solicitudes_gasto add constraint solicitudes_gasto_estado_check check (
  estado = any (array[
    'pendiente_jefe', 'rechazada_jefe',
    'pendiente_contabilidad', 'rechazada_contabilidad',
    'aprobada', 'pagada', 'pendiente_rendicion', 'rendida', 'cerrada',
    'anulada'
  ])
);

alter table gastos.solicitudes_gasto
  add column if not exists anulado_motivo text,
  add column if not exists anulado_por uuid references public.perfiles(id),
  add column if not exists anulado_en timestamptz;

-- ── PIEZA J: "¿Para cuándo necesitas el dinero?" ─────────────────────
-- Distinta de fecha_inicio/fecha_fin, que son del VIAJE (el rango que
-- cubren los viáticos, usado después en la rendición). Esta es para
-- Tesorería: cuándo se necesita el desembolso. Conviven a propósito —
-- normalmente el dinero se necesita ANTES de que arranque el viaje.
-- Aplica a anticipo y a reembolso; nullable porque es opcional.

alter table gastos.solicitudes_gasto
  add column if not exists fecha_requerida date;

comment on column gastos.solicitudes_gasto.fecha_requerida is
  'Fecha en que quien pide necesita el dinero. Informativa, para priorizar el desembolso — no es un compromiso de pago.';

-- ── PIEZA H: cerrar la auto-aprobación en las policies ───────────────
-- Las policies de UPDATE dejaban que el propio solicitante (o el custodio
-- del fondo, en Caja Chica) se aprobara lo suyo. Se quita ese término de
-- las de ESCRITURA; las de lectura no se tocan — el creador tiene que
-- seguir viendo su propia solicitud.
--
-- Ojo: mientras `compras.flags.acceso_abierto_temporal` siga en true, la
-- policy `*_acceso_temporal` (cmd=ALL) sigue permitiendo todo por OR y
-- esto no cambia nada observable. Lo que cierra el hueco HOY es el chequeo
-- en las Server Actions (domain/auto-aprobacion.ts). Esto deja la base
-- correcta para el día que se apague el flag.

drop policy if exists solicitudes_gasto_actualiza on gastos.solicitudes_gasto;
create policy solicitudes_gasto_actualiza on gastos.solicitudes_gasto
  for update using (
    es_jefe_de(area) or area_en('contabilidad', 'tesoreria', 'admin')
  );

drop policy if exists ordenes_servicio_actualiza on servicios.ordenes_servicio;
create policy ordenes_servicio_actualiza on servicios.ordenes_servicio
  for update using (
    es_jefe_de(area_solicitante) or area_en('contabilidad', 'admin')
  );

-- Caja Chica va PARTIDA en dos, no en una sola policy ALL como estaba: el
-- custodio del fondo es quien CREA la reposición, así que sacarle
-- `custodio_id` a una policy `for all` lo dejaría sin poder registrarla.
-- Lo que no debe poder es APROBARLA (update), que es lo único que se le
-- quita acá.
drop policy if exists reposiciones_escritura on caja_chica.reposiciones;

create policy reposiciones_crea on caja_chica.reposiciones
  for insert with check (
    exists (
      select 1 from caja_chica.fondos f
       where f.id = reposiciones.fondo_id
         and (f.custodio_id = auth.uid() or es_jefe_de(f.area) or area_en('contabilidad', 'admin'))
    )
  );

create policy reposiciones_actualiza on caja_chica.reposiciones
  for update using (
    exists (
      select 1 from caja_chica.fondos f
       where f.id = reposiciones.fondo_id
         and (es_jefe_de(f.area) or area_en('contabilidad', 'admin'))
    )
  );
