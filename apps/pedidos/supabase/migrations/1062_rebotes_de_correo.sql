-- 1062 — Los rebotes de correo dejan de ser invisibles.
--
-- `notification_logs.estado` decía "enviado" apenas Resend aceptaba el
-- POST, que es lo único que el ERP podía saber en ese momento. Pero
-- aceptado no es entregado, y nadie se enteraba de la diferencia.
--
-- Caso real (2026-11-24, pedido #572): a la vendedora SUSANA RAMOS no le
-- llegaba ningún correo. Su buzón se dio de baja cuando dejó la empresa y
-- se recreó después con la misma dirección; mientras no existió, cada
-- correo rebotó y Resend metió `sramos@logisaludventas.com` en su lista de
-- supresión. Desde entonces Resend contestaba "aceptado" y descartaba el
-- correo sin entregarlo: "This email was not sent because the recipient's
-- email address is on the suppression list". Fueron 66 correos en dos
-- meses, todos registrados como enviados, y se descubrió porque ella avisó.
--
-- Con esto, Resend nos cuenta qué pasó DESPUÉS del envío (webhook) y el
-- desenlace queda guardado.
--
-- ── Por qué una tabla aparte y no otra columna de estado ─────────────────
-- Un correo del pedido va a diez personas. Que rebote para una no vuelve
-- falso el envío para las otras nueve: `estado` sigue describiendo la
-- llamada al proveedor, y los eventos de entrega viven por destinatario.
--
-- `rebotados` en el log es la vista rápida —lo que la pantalla necesita
-- para pintar el aviso sin cruzar tablas— y se llena desde el webhook.

alter table pedidos.notification_logs
  add column if not exists rebotados text[] not null default '{}';

create table if not exists pedidos.notification_events (
  id bigint generated always as identity primary key,
  notification_log_id bigint references pedidos.notification_logs (id) on delete set null,
  -- El id interno de Resend, que es lo único que trae el webhook para
  -- atar el evento con el envío. Se guarda aunque no haya log: un evento
  -- huérfano es dato igual, y perderlo sería tapar justo lo que se quiere ver.
  proveedor_message_id text not null,
  tipo text not null,
  destinatario text,
  detalle text,
  ocurrido_en timestamptz,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Idempotencia: el webhook llega "al menos una vez", así que Resend puede
-- repetir el mismo evento. Sin esto, un reintento duplicaría el rebote.
create unique index if not exists notification_events_unico
  on pedidos.notification_events (proveedor_message_id, tipo, coalesce(destinatario, ''));

create index if not exists notification_events_log_idx
  on pedidos.notification_events (notification_log_id, created_at desc);

alter table pedidos.notification_events enable row level security;

-- Igual que notification_logs: lectura solo para administrador, y la
-- escritura la hace el webhook con la service role key. Si registrar un
-- rebote dependiera de una policy, el propio registro del fallo podría
-- fallar.
drop policy if exists "notification_events_select_admin" on pedidos.notification_events;
create policy "notification_events_select_admin"
  on pedidos.notification_events for select
  to authenticated
  using (pedidos.is_admin());
