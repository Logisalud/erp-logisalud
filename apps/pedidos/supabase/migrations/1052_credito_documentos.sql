-- 1052 — Qué factura está vencida, y no solo cuánto suma todo.
--
-- La copia de la deuda (`credito_clientes`) trae un total vencido y el mayor
-- atraso. Con eso alcanza para decidir si el pedido se frena, pero lo que el
-- vendedor lee engaña: "S/ 6.073,41 vencidos con 116 días" se entiende como
-- UNA factura de ese monto con esa antigüedad. En CORFARMA (2026-11-04) la
-- de 116 días era de S/ 2.830,58, y había otras tres — una de apenas 22
-- días. El monto es la suma de todas; los días, los de la más vieja.
--
-- Y la conversación que de verdad ocurre no es "debés S/ 6.073": es "pagá
-- la FFF1-921 y volvés a comprar". Para eso hace falta el detalle.
--
-- Es un espejo, igual que `credito_clientes`: una copia de
-- `public.v_documentos_vencidos` de cobranzas, refrescada por el mismo
-- sync. No es la fuente de verdad de nada.

create table if not exists pedidos.credito_documentos (
  ruc text not null,
  comprobante text not null,
  -- LO VENCIDO, no el saldo de la factura. Se diferencian en las canjeadas
  -- por letras: ahí el saldo son las letras pendientes y unas vencieron
  -- mientras otras no. FFF1-1689 debe S/ 12.521,44 con solo S/ 5.000
  -- vencidos. Si acá entrara el saldo entero, el detalle sumaría más que el
  -- total del cliente y habría dos verdades.
  saldo_vencido numeric(14,2) not null,
  /** El saldo completo del documento, para poder mostrar los dos. */
  saldo_documento numeric(14,2) not null,
  dias_atraso integer not null,
  fecha_vencimiento date,
  tiene_letras boolean not null default false,
  actualizado_en timestamptz not null default now(),
  primary key (ruc, comprobante)
);

comment on table pedidos.credito_documentos is
  'Copia diaria de las facturas vencidas que viven en el ERP de cobranzas '
  '(public.v_documentos_vencidos). Es un espejo, no la fuente de verdad.';

create index if not exists credito_documentos_ruc_idx
  on pedidos.credito_documentos (ruc, dias_atraso desc);

alter table pedidos.credito_documentos enable row level security;

-- La lee cualquier autenticado: el vendedor tiene que ver qué factura
-- frena su pedido. La escribe solo el administrador — la sincronización
-- corre con la service role y no pasa por RLS.
drop policy if exists "credito_documentos_lectura" on pedidos.credito_documentos;
create policy "credito_documentos_lectura" on pedidos.credito_documentos
  for select to authenticated using (true);

drop policy if exists "credito_documentos_escritura" on pedidos.credito_documentos;
create policy "credito_documentos_escritura" on pedidos.credito_documentos
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());
