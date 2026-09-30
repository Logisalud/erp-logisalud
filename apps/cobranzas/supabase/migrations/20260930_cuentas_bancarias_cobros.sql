-- Cuentas bancarias donde se reciben los cobros de distribución, para que
-- quien registra el pago indique a cuál llegó (incluye Yape/Plin, que cae
-- en la cuenta Interbank). Códigos internos según la lista de la empresa.
--
-- Por pedido explícito: se crean las 4 cuentas, pero CF003 (BCP Soles 2) y
-- CF004 (BCP Dólares) NO se muestran todavía como opción en el registro de
-- pagos (`visible_en_cobros = false`) — no se usan aún para cobranza de
-- ventas de distribución.
create table cuentas_bancarias (
  codigo_interno     text primary key,
  banco              text not null,
  numero_cuenta      text not null,
  visible_en_cobros  boolean not null default false,
  created_at         timestamptz not null default now()
);

insert into cuentas_bancarias (codigo_interno, banco, numero_cuenta, visible_en_cobros) values
  ('CF010', 'BCP Soles 1',     '1917315019079', true),
  ('CF003', 'BCP Soles 2',     '1949920143063', false),
  ('CF004', 'BCP Dólares',     '1939948625169', false),
  ('CF005', 'Interbank Soles', '2003006303674', true);

alter table pagos
  add column cuenta_bancaria_codigo text references cuentas_bancarias(codigo_interno);

-- Solo tiene sentido para pagos por transferencia (Yape/Plin incluido: cae
-- en la cuenta Interbank). Efectivo y retención no pasan por una cuenta.
alter table pagos add constraint chk_cuenta_bancaria_solo_transferencia
  check (cuenta_bancaria_codigo is null or medio_cobro = 'transferencia');
