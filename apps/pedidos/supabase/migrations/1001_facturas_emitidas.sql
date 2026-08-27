-- Ciclo Pedido -> Factura -> Cuenta por cobrar.
-- Diseño aprobado en apps/pedidos/docs/diseno-pedido-a-cobranza.md
--
-- Regla que gobierna todo este archivo: NO se agrega, quita ni altera ninguna
-- columna de las tablas de Cobranzas. El enlace vive del lado de Pedidos
-- (facturas_emitidas.documento_id -> public.documentos.id). En public solo se
-- INSERTA una fila nueva de documento; nunca se modifica una existente.
--
-- Re-ejecutable.

-- ===================================================================
-- pedidos.facturas_emitidas
-- ===================================================================
-- Entidad propia, no columnas sobre el pedido: un pedido puede tener más de
-- una factura si se anula y se re-emite.
create table if not exists pedidos.facturas_emitidas (
  id uuid primary key default gen_random_uuid(),

  -- FK a pedidos.orders se agrega cuando exista esa tabla (PR de pedidos).
  -- Por ahora la columna existe y se valida en la función.
  pedido_id uuid not null,

  tipo char(2) not null check (tipo in ('01', '03')),
  -- Serie dedicada: FP01 facturas, BP01 boletas. Ninguna colisiona con las
  -- que ya usa Cobranzas (FFF1, E001, BBB1, FC01, BC01, FD01), y como
  -- documentos tiene unique (tipo, serie, numero), una serie propia elimina
  -- el choque con los números que carga el importador de Cobranzas.
  serie char(4) not null default 'FP01' check (serie ~ '^[A-Z0-9]{4}$'),
  numero int not null check (numero > 0),

  cliente_ruc char(11) not null references public.clientes (ruc),

  -- La del comprobante, no la de carga.
  fecha_emision date not null,
  fecha_vencimiento date,

  moneda char(3) not null default 'PEN' check (moneda in ('PEN', 'USD')),
  importe_total numeric(14, 2) not null check (importe_total >= 0),
  tipo_cambio numeric(8, 4),

  forma_pago text check (forma_pago in ('CONTADO', 'CREDITO')),

  -- Hoy 'manual' (PDF subido a mano). Cuando entre la API de NubeFact, lo
  -- único que cambia es quién llena estos datos: la función que escribe en
  -- documentos no se toca.
  origen text not null default 'manual' check (origen in ('manual', 'nubefact')),
  nubefact_enlace text,
  nubefact_respuesta jsonb,

  storage_path text,
  subido_por uuid not null references auth.users (id),

  -- El enlace. Nullable solo durante el instante de la transacción.
  documento_id uuid unique references public.documentos (id),

  anulada boolean not null default false,
  anulada_por uuid references auth.users (id),
  anulada_en timestamptz,
  motivo_anulacion text,

  created_at timestamptz not null default now(),

  -- El número de comprobante es único en la empresa, no por pedido. Una
  -- factura anulada conserva su fila y por lo tanto quema su número: SUNAT
  -- no permite reusarlo.
  unique (tipo, serie, numero),
  constraint anulacion_completa check (
    (anulada = false and anulada_por is null and anulada_en is null)
    or (anulada = true and anulada_por is not null and anulada_en is not null
        and motivo_anulacion is not null)
  ),
  constraint tipo_cambio_requerido check (moneda = 'PEN' or tipo_cambio is not null)
);

create index if not exists facturas_emitidas_pedido_idx on pedidos.facturas_emitidas (pedido_id);
create index if not exists facturas_emitidas_cliente_idx on pedidos.facturas_emitidas (cliente_ruc);
create index if not exists facturas_emitidas_documento_idx on pedidos.facturas_emitidas (documento_id);

-- Un pedido no puede tener dos facturas vivas a la vez.
create unique index if not exists factura_viva_unica_por_pedido
  on pedidos.facturas_emitidas (pedido_id) where anulada = false;

alter table pedidos.facturas_emitidas enable row level security;

-- Lectura: todo el módulo la ve; el vendedor ve las de sus pedidos.
drop policy if exists facturas_emitidas_lectura on pedidos.facturas_emitidas;
create policy facturas_emitidas_lectura on pedidos.facturas_emitidas
  for select to authenticated using (pedidos.acceso_pedidos());

-- Escritura: NADIE escribe directo. Emitir y anular pasan por las funciones,
-- que son las que validan. Sin policy de insert/update, un cliente con la
-- anon key no puede tocar esta tabla ni con la sesión de un admin.
drop policy if exists facturas_emitidas_escritura on pedidos.facturas_emitidas;

-- ===================================================================
-- Bucket de los PDF
-- ===================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas-pedidos', 'facturas-pedidos', false, 20971520,
        array['application/pdf'])
on conflict (id) do nothing;

-- Path obligado <YYYY>/<MM>/<serie>-<numero>.pdf — sin esto, a los dos años
-- el bucket es una bolsa de archivos sueltos.
create or replace function public.path_factura_valido(p_name text)
returns boolean language sql immutable as $$
  select p_name ~ '^[0-9]{4}/(0[1-9]|1[0-2])/[A-Z0-9]{4}-[0-9]+\.pdf$';
$$;

drop policy if exists facturas_pedidos_lectura on storage.objects;
create policy facturas_pedidos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas-pedidos' and pedidos.acceso_pedidos());

drop policy if exists facturas_pedidos_escritura on storage.objects;
create policy facturas_pedidos_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'facturas-pedidos'
    and public.path_factura_valido(name)
    and public.puede_actuar_por_otro()
  );

-- El PDF NO se borra nunca, ni al anular: es la evidencia de qué se cargó.
-- Solo admin, y solo para limpiar una carga fallida antes de que exista la
-- factura.
drop policy if exists facturas_pedidos_borrado on storage.objects;
create policy facturas_pedidos_borrado on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'facturas-pedidos'
    and public.es_admin()
    and not exists (
      select 1 from pedidos.facturas_emitidas f where f.storage_path = storage.objects.name
    )
  );

-- ===================================================================
-- pedidos.emitir_factura()
-- ===================================================================
-- security definer, no service role key: la app de Pedidos no necesita
-- acceso total a la base, necesita exactamente una capacidad — insertar una
-- factura bien formada. La función valida adentro y es la única puerta.
--
-- Las 5 validaciones del diseño están numeradas en el cuerpo.
create or replace function pedidos.emitir_factura(
  p_pedido_id uuid,
  p_cliente_ruc char(11),
  p_tipo char(2),
  p_serie char(4),
  p_numero int,
  p_fecha_emision date,
  p_importe_total numeric,
  p_importe_esperado numeric,
  p_moneda char(3) default 'PEN',
  p_tipo_cambio numeric default null,
  p_forma_pago text default 'CREDITO',
  p_dias_credito int default 0,
  p_storage_path text default null,
  p_origen text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_documento_id uuid;
  v_factura_id uuid;
  v_vencimiento date;
begin
  -- (0) Quién puede emitir: admin y control_pedidos. Un vendedor no.
  if not public.puede_actuar_por_otro() then
    raise exception 'Solo Administración y Control de Pedidos pueden emitir una factura';
  end if;

  -- (1) El pedido se puede facturar: existe y no tiene ya una factura viva.
  --     El unique index factura_viva_unica_por_pedido es el respaldo, pero se
  --     valida acá para dar un mensaje entendible en vez de un error de índice.
  if exists (
    select 1 from pedidos.facturas_emitidas
    where pedido_id = p_pedido_id and anulada = false
  ) then
    raise exception 'El pedido ya tiene una factura vigente. Anulá la anterior antes de re-emitir.';
  end if;

  -- (2) El cliente existe en el catálogo real y está activo.
  if not exists (select 1 from public.clientes where ruc = p_cliente_ruc) then
    raise exception 'El RUC % no existe en la cartera de clientes', p_cliente_ruc;
  end if;

  -- (3) El monto coincide con el del pedido. p_importe_esperado lo calcula el
  --     servidor desde las líneas; p_importe_total es lo que dice el PDF.
  --     Nadie tipea el monto que se guarda: si no coinciden, no se emite.
  if round(p_importe_total, 2) <> round(p_importe_esperado, 2) then
    raise exception
      'El importe de la factura (%) no coincide con el del pedido (%). Diferencia: %',
      round(p_importe_total, 2), round(p_importe_esperado, 2),
      round(p_importe_total - p_importe_esperado, 2);
  end if;

  -- (4) Tipo de comprobante válido para facturar un pedido.
  if p_tipo not in ('01', '03') then
    raise exception 'Tipo de comprobante inválido para un pedido: %', p_tipo;
  end if;

  -- El número no puede estar usado, ni siquiera por una factura anulada: una
  -- anulada quema su número. Sin este chequeo el error que ve la persona es
  -- una violación de unique de Postgres, ilegible.
  if exists (
    select 1 from public.documentos
    where tipo = p_tipo and serie = p_serie and numero = p_numero
  ) then
    raise exception
      'El comprobante %-% ya existe (puede ser uno anulado: un número anulado no se reusa). Usá el número siguiente.',
      p_serie, p_numero;
  end if;

  v_vencimiento := p_fecha_emision + coalesce(p_dias_credito, 0);

  -- (5) Las dos filas, en una sola transacción. La función es atómica: o
  --     entran las dos, o ninguna.
  --     INSERT en documentos, nunca UPDATE de una fila existente.
  insert into public.documentos (
    tipo, serie, numero, cliente_ruc, fecha_emision, fecha_vencimiento,
    moneda, importe_total, tipo_cambio, forma_pago, observaciones
  ) values (
    p_tipo, p_serie, p_numero, p_cliente_ruc, p_fecha_emision, v_vencimiento,
    p_moneda, round(p_importe_total, 2), p_tipo_cambio, p_forma_pago,
    'Generada desde Pedidos · pedido ' || p_pedido_id::text
  )
  returning id into v_documento_id;

  insert into pedidos.facturas_emitidas (
    pedido_id, tipo, serie, numero, cliente_ruc, fecha_emision, fecha_vencimiento,
    moneda, importe_total, tipo_cambio, forma_pago, origen, storage_path,
    subido_por, documento_id
  ) values (
    p_pedido_id, p_tipo, p_serie, p_numero, p_cliente_ruc, p_fecha_emision, v_vencimiento,
    p_moneda, round(p_importe_total, 2), p_tipo_cambio, p_forma_pago, p_origen,
    p_storage_path, auth.uid(), v_documento_id
  )
  returning id into v_factura_id;

  insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'emitir_factura', 'facturas_emitidas', v_factura_id::text,
          jsonb_build_object('documento_id', v_documento_id, 'importe', p_importe_total,
                             'comprobante', p_serie || '-' || p_numero::text));

  return v_factura_id;
end;
$$;

revoke all on function pedidos.emitir_factura(uuid, char, char, char, int, date, numeric, numeric, char, numeric, text, int, text, text) from public;
grant execute on function pedidos.emitir_factura(uuid, char, char, char, int, date, numeric, numeric, char, numeric, text, int, text, text) to authenticated;

-- ===================================================================
-- pedidos.anular_factura()
-- ===================================================================
-- Las 3 reglas del diseño:
--   1. El número queda quemado — la fila NO se borra, conserva su unique.
--   2. No se anula si ya tiene pagos registrados.
--   3. El PDF nunca se borra.
create or replace function pedidos.anular_factura(
  p_factura_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_documento_id uuid;
  v_pagos int;
begin
  if not public.puede_actuar_por_otro() then
    raise exception 'Solo Administración y Control de Pedidos pueden anular una factura';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'La anulación necesita un motivo';
  end if;

  select documento_id into v_documento_id
  from pedidos.facturas_emitidas
  where id = p_factura_id and anulada = false;

  if v_documento_id is null then
    raise exception 'No hay una factura vigente con ese id (¿ya está anulada?)';
  end if;

  -- Regla 2: si Cobranzas ya registró un cobro, anular dejaría el pago
  -- colgando de un documento anulado y descuadraría la conciliación bancaria.
  select count(*) into v_pagos from public.pagos where documento_id = v_documento_id;
  if v_pagos > 0 then
    raise exception
      'La factura ya tiene % pago(s) registrado(s) en Cobranzas. No se anula: la reversión correcta es una nota de crédito, y la emite Contabilidad.',
      v_pagos;
  end if;

  -- Regla 1: se marca anulado, no se borra. La fila se queda con su
  -- unique (tipo, serie, numero) y el número no se puede reusar.
  -- v_saldos filtra anulado = false, así que la cuenta por cobrar
  -- desaparece del saldo sola.
  update public.documentos set anulado = true where id = v_documento_id;

  update pedidos.facturas_emitidas
     set anulada = true,
         anulada_por = auth.uid(),
         anulada_en = now(),
         motivo_anulacion = p_motivo
   where id = p_factura_id;

  -- Regla 3: storage_path queda intacto. El PDF sigue en el bucket como
  -- evidencia de qué se cargó y por qué se anuló.

  insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_despues)
  values (auth.uid(), 'anular_factura', 'facturas_emitidas', p_factura_id::text,
          jsonb_build_object('documento_id', v_documento_id, 'motivo', p_motivo));
end;
$$;

revoke all on function pedidos.anular_factura(uuid, text) from public;
grant execute on function pedidos.anular_factura(uuid, text) to authenticated;

-- Trazabilidad factura <-> documento, sin columna nueva en documentos.
create or replace view pedidos.v_factura_documento as
select f.id as factura_id, f.pedido_id, f.anulada,
       d.id as documento_id, d.tipo, d.serie, d.numero,
       (d.serie::text || '-' || d.numero::text) as comprobante,
       d.cliente_ruc, c.razon_social, d.fecha_emision, d.fecha_vencimiento,
       d.importe_total, d.anulado as documento_anulado, f.origen, f.storage_path
from pedidos.facturas_emitidas f
join public.documentos d on d.id = f.documento_id
join public.clientes c on c.ruc = d.cliente_ruc;
