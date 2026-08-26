-- Borradores de documentación electrónica (comprobante y guía de remisión)
-- generados al confirmar el despacho, para revisión humana.
--
-- TODO — Pendiente: reemplazar generación de borrador por llamada real a la
-- API de NubeFact (POST a la ruta configurada con el token), una vez
-- confirmada la estructura exacta de campos contra el manual oficial y
-- rotado el token de forma segura (variables de entorno NUBEFACT_API_URL y
-- NUBEFACT_API_TOKEN, nunca en el repo).
--
-- Hoy NO se llama a ningún servicio externo: solo se genera el JSON y se
-- guarda acá para que la facturadora lo compare contra el manual real.
--
-- Por qué una tabla jsonb y no Supabase Storage: los payloads son de unos
-- pocos KB, se quieren consultar y versionar por pedido, y la RLS de una
-- tabla es directa — con Storage habría que administrar policies de bucket
-- y URLs firmadas para leer un JSON que igual se muestra en pantalla.

begin;

create table if not exists pedidos.electronic_document_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pedidos.orders (id) on delete cascade,
  fulfillment_id uuid references pedidos.fulfillments (id) on delete set null,
  tipo text not null check (tipo in ('COMPROBANTE', 'GUIA_REMISION')),
  -- Snapshot de qué comprobante correspondía al generar el borrador
  -- (FACTURA / BOLETA), o null para la guía.
  tipo_comprobante text check (tipo_comprobante in ('FACTURA', 'BOLETA')),
  payload jsonb not null,
  -- Advertencias que la generación detectó y que un humano tiene que
  -- resolver antes de emitir de verdad (ej. el cliente admite factura o
  -- boleta y nadie eligió; falta el peso de un producto).
  advertencias text[] not null default '{}',
  generado_en timestamptz not null default now(),
  generado_por uuid references auth.users (id)
);

create index if not exists electronic_document_drafts_order_idx
  on pedidos.electronic_document_drafts (order_id, tipo, generado_en desc);

alter table pedidos.electronic_document_drafts enable row level security;

-- Lo lee quien tiene que revisarlo: administrador y control_pedidos (la
-- facturadora). Operaciones lo genera pero no necesita leerlo, y el
-- vendedor no tiene nada que hacer con un borrador fiscal.
drop policy if exists "electronic_document_drafts_select" on pedidos.electronic_document_drafts;
create policy "electronic_document_drafts_select"
  on pedidos.electronic_document_drafts for select
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'));

-- Sin policy de escritura para authenticated: los genera el servidor con
-- la service role key al confirmar el despacho. Nadie los edita a mano —
-- si el contenido está mal, se corrige el generador, no la fila.
comment on table pedidos.electronic_document_drafts is
  'BORRADORES para revisión humana. No se envían a ningún servicio. '
  'Pendiente: reemplazar por llamada real a la API de NubeFact.';

commit;
