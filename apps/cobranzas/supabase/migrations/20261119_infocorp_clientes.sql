-- Fase legal: a quién hay que reportar a Equifax (Infocorp), y a quién ya
-- se reportó.
--
-- Hoy esas solicitudes viajan por correo y por WhatsApp mezcladas con todo
-- lo demás, y se pierden. Esta tabla es la lista: Natalia marca al cliente
-- y queda en un solo lugar, con su saldo y sus días al momento de marcarlo.
--
-- Por qué se guarda el saldo y los días AL MARCAR, si se pueden calcular:
-- porque son la foto de la decisión. Si el cliente paga después, la
-- cartera va a decir que no debía nada, y la pregunta "¿por qué lo
-- reportamos?" se queda sin respuesta. El saldo de hoy vive en v_saldos;
-- el de aquel día, solo acá.
--
-- Es una fila por cliente, no por factura: a Infocorp se reporta al
-- deudor, no al documento.

create table if not exists public.infocorp_clientes (
  cliente_ruc char(11) primary key references public.clientes(ruc),

  -- El marcado: la solicitud.
  marcado_en timestamptz not null default now(),
  marcado_por text not null,
  motivo text,
  saldo_al_marcar numeric(12,2),
  dias_vencido_al_marcar integer,

  -- El reporte efectivo, con su constancia.
  reportado boolean not null default false,
  reportado_en timestamptz,
  reportado_por text,
  adjunto_path text,
  adjunto_nombre text,

  -- Un "ya reportado" sin fecha no sirve para nada: la fecha es lo que se
  -- mira cuando el cliente reclama.
  constraint chk_infocorp_reportado_con_fecha check (
    (reportado = false and reportado_en is null)
    or (reportado = true and reportado_en is not null)
  )
);

comment on table public.infocorp_clientes is
  'Clientes marcados para reportar a Equifax (Infocorp) y los ya reportados. Una fila por cliente.';

create index if not exists idx_infocorp_pendientes
  on public.infocorp_clientes (reportado, marcado_en desc);

alter table public.infocorp_clientes enable row level security;
