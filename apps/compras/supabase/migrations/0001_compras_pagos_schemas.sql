-- Módulo Compras y Pagos — estructura base de los 8 Bounded Contexts.
-- Ver apps/compras/docs/modulo-compras-pagos.md
--
-- Re-ejecutable: todo con "if not exists". Aditivo: no toca ninguna tabla
-- existente de Cuentas por Cobrar (schema public de cobranzas).

-- ===================================================================
-- SCHEMAS
-- ===================================================================
create schema if not exists compras;
create schema if not exists servicios;
create schema if not exists almacen;
create schema if not exists cuentas_x_pagar;
create schema if not exists gastos;
create schema if not exists caja_chica;
create schema if not exists financiamiento;
create schema if not exists impuestos;

-- ===================================================================
-- PERFILES Y RESPONSABLES
-- Base de auth compartida del ERP: este módulo es el primero en usar
-- Supabase Auth real (apps/cobranzas no tiene login).
-- ===================================================================
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  area text not null constraint perfiles_area_check check (area in (
    'compras','almacen','contabilidad','tesoreria','gerencia',
    'gestion_humana','legal','direccion_tecnica','ventas','admin','otro'
  )),
  rol text not null default 'operativo',
  created_at timestamptz not null default now()
);

create table if not exists public.area_responsables (
  area text primary key,
  responsable_id uuid not null references auth.users(id)
);

-- ===================================================================
-- COMPRAS (mercadería)
-- ===================================================================
create table if not exists compras.proveedores (
  id uuid primary key default gen_random_uuid(),
  ruc text not null unique,
  razon_social text not null,
  nombre_comercial text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  -- cuenta desde la CONFORMIDAD de recepción, no desde la OC
  condicion_pago_dias int not null default 30,
  moneda_principal text not null default 'PEN' check (moneda_principal in ('PEN','USD')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists compras.proveedor_cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references compras.proveedores(id) on delete cascade,
  banco text not null,
  tipo_cuenta text check (tipo_cuenta in ('ahorros','corriente')),
  numero_cuenta text not null,
  cci text not null check (char_length(cci) = 20),
  moneda text not null check (moneda in ('PEN','USD')),
  titular text not null,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists proveedor_cuenta_principal_unica
  on compras.proveedor_cuentas_bancarias (proveedor_id, moneda) where es_principal;

create table if not exists compras.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  unidad_medida text not null,
  precio_referencial numeric(14,2),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  -- mínimo de meses hasta vencer, exigido al recibir
  meses_vida_util_minima_recepcion int not null default 12,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists compras.oc_codigo_seq;

create table if not exists compras.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'OC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('compras.oc_codigo_seq')::text,4,'0')
  ),
  proveedor_id uuid not null references compras.proveedores(id),
  cuenta_bancaria_id uuid references compras.proveedor_cuentas_bancarias(id),
  fecha_emision date not null default current_date,
  fecha_entrega_estimada date,
  moneda text not null check (moneda in ('PEN','USD')),
  condiciones_pago_dias int,
  estado text not null default 'borrador' check (estado in (
    'borrador','enviada','confirmada','parcialmente_recibida',
    'recibida_completa','facturada','cerrada','anulada'
  )),
  notas text,
  creado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compras.ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references compras.ordenes_compra(id) on delete cascade,
  producto_id uuid not null references compras.productos(id),
  cantidad_pedida numeric(14,3) not null,
  precio_unitario numeric(14,2) not null,
  subtotal numeric(14,2) generated always as (cantidad_pedida * precio_unitario) stored,
  -- = suma de cantidad_aceptada (lo rechazado no cuenta)
  cantidad_recibida numeric(14,3) not null default 0,
  cantidad_facturada numeric(14,3) not null default 0
);

-- obligacion_id y recepcion_item_id se enlazan por ALTER más abajo:
-- cuentas_x_pagar.obligaciones y almacen.recepciones_items todavía no existen.
create table if not exists compras.notas_credito (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid,
  proveedor_id uuid not null references compras.proveedores(id),
  recepcion_item_id uuid,
  numero_nc text,
  motivo text not null,
  monto numeric(14,2) not null,
  moneda text not null check (moneda in ('PEN','USD')),
  fecha_emision date,
  storage_path text,
  aplicada boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===================================================================
-- SERVICIOS (catálogo separado de proveedores de servicio)
-- ===================================================================
create table if not exists servicios.proveedores_servicio (
  id uuid primary key default gen_random_uuid(),
  ruc text not null unique,
  razon_social text not null,
  nombre_comercial text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  condicion_pago_dias int not null default 30,
  moneda_principal text not null default 'PEN' check (moneda_principal in ('PEN','USD')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists servicios.proveedor_servicio_cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  proveedor_servicio_id uuid not null references servicios.proveedores_servicio(id) on delete cascade,
  banco text not null,
  tipo_cuenta text check (tipo_cuenta in ('ahorros','corriente')),
  numero_cuenta text not null,
  cci text not null check (char_length(cci) = 20),
  moneda text not null check (moneda in ('PEN','USD')),
  titular text not null,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists proveedor_servicio_cuenta_principal_unica
  on servicios.proveedor_servicio_cuentas_bancarias (proveedor_servicio_id, moneda) where es_principal;

create sequence if not exists servicios.os_codigo_seq;

create table if not exists servicios.ordenes_servicio (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'OS-' || to_char(now(),'YYYY') || '-' || lpad(nextval('servicios.os_codigo_seq')::text,4,'0')
  ),
  area_solicitante text not null,
  solicitante_id uuid not null references auth.users(id),
  proveedor_servicio_id uuid not null references servicios.proveedores_servicio(id),
  descripcion_servicio text not null,
  monto_estimado numeric(14,2) not null,
  moneda text not null check (moneda in ('PEN','USD')),
  condiciones_pago_dias int,
  fecha_solicitud date not null default current_date,
  fecha_entrega_estimada date,
  estado text not null default 'pendiente_jefe' check (estado in (
    'pendiente_jefe','rechazada_jefe','aprobada',
    'en_ejecucion','facturada','conformada','cerrada','anulada'
  )),
  aprobado_por uuid references auth.users(id),
  aprobado_fecha timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists servicios.conformidad_servicio (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references servicios.ordenes_servicio(id),
  confirmado_por uuid not null references auth.users(id),
  fecha_conformidad timestamptz not null default now(),
  conforme boolean not null,
  observaciones text,
  storage_path text
);

-- ===================================================================
-- ALMACÉN (recepción con control de discrepancias)
-- ===================================================================
create table if not exists almacen.recepciones (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references compras.ordenes_compra(id),
  recibido_por uuid not null references auth.users(id),
  fecha_recepcion timestamptz not null default now(),
  guia_remision text,
  -- guía escaneada, con sello de recibido (sube Charlie)
  storage_path_guia_recibida text,
  -- factura física entregada junto con la mercadería (sube Charlie)
  storage_path_factura_proveedor text,
  conforme boolean,
  -- se llena cuando la recepción queda cerrada -> dispara el cálculo
  -- de vencimiento de pago
  fecha_conformidad timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente','conforme','con_discrepancia')),
  observaciones text
);

create table if not exists almacen.recepciones_items (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references almacen.recepciones(id) on delete cascade,
  oc_item_id uuid not null references compras.ordenes_compra_items(id),
  cantidad_guia numeric(14,3),
  cantidad_fisica numeric(14,3) not null,
  lote text,
  fecha_vencimiento date,
  estado_calidad text not null default 'bueno' check (estado_calidad in ('bueno','danado','vencido','por_vencer')),
  tipo_discrepancia text check (tipo_discrepancia in (
    'ninguna','faltante','sobrante','producto_erroneo',
    'danado','vencido','por_vencer','lote_no_informado'
  )),
  cantidad_aceptada numeric(14,3),
  cantidad_rechazada numeric(14,3) not null default 0,
  observaciones text
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_recepcion_item'
  ) then
    alter table compras.notas_credito
      add constraint fk_recepcion_item
      foreign key (recepcion_item_id) references almacen.recepciones_items(id);
  end if;
end $$;

create table if not exists almacen.matriz_resolucion_discrepancias (
  id uuid primary key default gen_random_uuid(),
  tipo_discrepancia text not null unique check (tipo_discrepancia in (
    'faltante','sobrante','producto_erroneo','danado','vencido','por_vencer','lote_no_informado'
  )),
  accion_estandar text not null,
  requiere_nota_credito boolean not null default false,
  requiere_reposicion boolean not null default false
);

insert into almacen.matriz_resolucion_discrepancias
  (tipo_discrepancia, accion_estandar, requiere_nota_credito, requiere_reposicion)
values
  ('faltante', 'Recibir lo físico real; solicitar NC o reposición por la diferencia', true, true),
  ('sobrante', 'Rechazar el excedente salvo autorización expresa', false, false),
  ('producto_erroneo', 'Rechazo total de la línea, no ingresa a stock', false, true),
  ('danado', 'Rechazar unidades dañadas; solicitar NC o reposición', true, true),
  ('vencido', 'Rechazo total, nunca se recibe producto vencido', true, false),
  ('por_vencer', 'Rechazo salvo autorización puntual del responsable de Almacén', false, false),
  ('lote_no_informado', 'Recibir con observación, validar con Compras', false, false)
on conflict (tipo_discrepancia) do nothing;

create table if not exists almacen.resoluciones_discrepancia (
  id uuid primary key default gen_random_uuid(),
  recepcion_item_id uuid not null references almacen.recepciones_items(id),
  tipo_discrepancia text not null,
  accion_sugerida text,
  accion_tomada text not null check (accion_tomada in (
    'aceptado_segun_sugerencia','aceptado_con_ajuste','rechazado',
    'nota_credito_solicitada','reposicion_solicitada'
  )),
  comentario text,
  decidido_por uuid not null references auth.users(id),
  fecha_decision timestamptz not null default now()
);

-- ===================================================================
-- CUENTAS POR PAGAR
-- ===================================================================
create table if not exists cuentas_x_pagar.tasas_detraccion (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  porcentaje numeric(5,2) not null,
  anexo_sunat text,
  vigente boolean not null default true
);

create sequence if not exists cuentas_x_pagar.obligacion_codigo_seq;

create table if not exists cuentas_x_pagar.obligaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'C-' || lpad(nextval('cuentas_x_pagar.obligacion_codigo_seq')::text,4,'0')
  ),
  origen text not null check (origen in (
    'compra','servicio','gasto_directo','reembolso','anticipo',
    'reposicion_caja_chica','prestamo','fraccionamiento_sunat',
    'letra_por_pagar','impuesto'
  )),
  proveedor_id uuid references compras.proveedores(id),
  proveedor_servicio_id uuid references servicios.proveedores_servicio(id),
  beneficiario_persona uuid references auth.users(id),
  oc_id uuid references compras.ordenes_compra(id),
  os_id uuid references servicios.ordenes_servicio(id),
  -- hereda documentos ya subidos por Charlie
  recepcion_id uuid references almacen.recepciones(id),
  solicitud_gasto_id uuid,
  reposicion_caja_chica_id uuid,
  numero_factura text,
  fecha_factura date,
  moneda text not null check (moneda in ('PEN','USD')),
  tipo_cambio numeric(8,4),
  base_imponible numeric(14,2) not null,
  igv numeric(14,2) generated always as (round(base_imponible * 0.18, 2)) stored,
  total numeric(14,2) generated always as (base_imponible + round(base_imponible * 0.18, 2)) stored,
  tasa_detraccion_id uuid references cuentas_x_pagar.tasas_detraccion(id),
  monto_detraccion numeric(14,2) default 0,
  neto_a_pagar numeric(14,2) generated always as (
    (base_imponible + round(base_imponible * 0.18, 2)) - coalesce(monto_detraccion, 0)
  ) stored,
  estado text not null default 'registrada' check (estado in (
    'registrada','observada','conforme','en_propuesta','pagada','cerrada','canjeada_por_letra'
  )),
  conformidad_por uuid references auth.users(id),
  conformidad_fecha timestamptz,
  observaciones text,
  -- se calcula por Server Action, ver regla de negocio 3
  fecha_vencimiento_real date,
  version int not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proveedor_id, numero_factura),
  constraint tipo_cambio_requerido check (moneda = 'PEN' or tipo_cambio is not null)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_obligacion'
  ) then
    alter table compras.notas_credito
      add constraint fk_obligacion
      foreign key (obligacion_id) references cuentas_x_pagar.obligaciones(id);
  end if;
end $$;

create table if not exists cuentas_x_pagar.obligaciones_items (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references cuentas_x_pagar.obligaciones(id) on delete cascade,
  oc_item_id uuid references compras.ordenes_compra_items(id),
  cantidad_facturada numeric(14,3) not null,
  precio_facturado numeric(14,2) not null
);

create table if not exists cuentas_x_pagar.historial_estados (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references cuentas_x_pagar.obligaciones(id),
  estado_anterior text,
  estado_nuevo text not null,
  cambiado_por uuid references auth.users(id),
  comentario text,
  created_at timestamptz not null default now()
);

create table if not exists cuentas_x_pagar.propuestas_pago (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  periodo text,
  creado_por uuid references auth.users(id),
  estado text not null default 'borrador' check (estado in ('borrador','pendiente_aprobacion','aprobada','rechazada')),
  created_at timestamptz not null default now()
);

create table if not exists cuentas_x_pagar.propuesta_detalle (
  id uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references cuentas_x_pagar.propuestas_pago(id),
  obligacion_id uuid not null references cuentas_x_pagar.obligaciones(id),
  -- neto_a_pagar YA descontadas notas de crédito aplicadas
  monto_a_pagar numeric(14,2) not null
);

create table if not exists cuentas_x_pagar.pagos (
  id uuid primary key default gen_random_uuid(),
  fecha_pago date,
  moneda text not null check (moneda in ('PEN','USD')),
  monto_total numeric(14,2) not null,
  cuenta_bancaria_proveedor_id uuid references compras.proveedor_cuentas_bancarias(id),
  cuenta_bancaria_proveedor_servicio_id uuid references servicios.proveedor_servicio_cuentas_bancarias(id),
  numero_voucher text,
  storage_path_voucher text,
  storage_path_detraccion text,
  ejecutado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists cuentas_x_pagar.pago_aplicacion (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references cuentas_x_pagar.pagos(id),
  obligacion_id uuid not null references cuentas_x_pagar.obligaciones(id),
  monto_aplicado numeric(14,2) not null
);

-- ===================================================================
-- GASTOS (reembolsos, gasto directo, anticipos)
-- ===================================================================
create table if not exists gastos.categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuenta_contable text,
  activo boolean not null default true
);

create sequence if not exists gastos.solicitud_codigo_seq;

create table if not exists gastos.solicitudes_gasto (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'G-' || to_char(now(),'YYYY') || '-' || lpad(nextval('gastos.solicitud_codigo_seq')::text,4,'0')
  ),
  tipo text not null check (tipo in ('gasto_directo','reembolso','anticipo')),
  solicitante_id uuid not null references auth.users(id),
  area text not null,
  categoria_id uuid not null references gastos.categorias_gasto(id),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  monto_solicitado numeric(14,2) not null,
  descripcion text not null,
  -- solo si el anticipo es de viaje
  destino text,
  fecha_inicio date,
  fecha_fin date,
  estado text not null default 'pendiente_jefe' check (estado in (
    'pendiente_jefe','rechazada_jefe','pendiente_contabilidad','rechazada_contabilidad',
    'aprobada','pagada','pendiente_rendicion','rendida','cerrada'
  )),
  aprobado_jefe_por uuid references auth.users(id),
  aprobado_jefe_fecha timestamptz,
  aprobado_contabilidad_por uuid references auth.users(id),
  aprobado_contabilidad_fecha timestamptz,
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  created_at timestamptz not null default now()
);

create table if not exists gastos.solicitud_comprobantes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references gastos.solicitudes_gasto(id) on delete cascade,
  fase text not null default 'inicial' check (fase in ('inicial','rendicion')),
  tipo_comprobante text not null check (tipo_comprobante in ('factura','boleta','sin_comprobante')),
  numero text,
  ruc_emisor text,
  monto numeric(14,2) not null,
  sustentable boolean not null default true,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists gastos.liquidaciones_anticipo (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null unique references gastos.solicitudes_gasto(id),
  monto_anticipo numeric(14,2) not null,
  monto_sustentado numeric(14,2) not null default 0,
  diferencia numeric(14,2) generated always as (monto_anticipo - monto_sustentado) stored,
  resultado text generated always as (
    case
      when monto_anticipo - monto_sustentado > 0 then 'devolucion_empleado'
      when monto_anticipo - monto_sustentado < 0 then 'reembolso_adicional'
      else 'sin_diferencia'
    end
  ) stored,
  fecha_devolucion date,
  monto_devuelto numeric(14,2),
  obligacion_reembolso_id uuid references cuentas_x_pagar.obligaciones(id),
  fecha_liquidacion timestamptz,
  liquidado_por uuid references auth.users(id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_solicitud_gasto'
  ) then
    alter table cuentas_x_pagar.obligaciones
      add constraint fk_solicitud_gasto
      foreign key (solicitud_gasto_id) references gastos.solicitudes_gasto(id);
  end if;
end $$;

-- ===================================================================
-- CAJA CHICA
-- ===================================================================
create table if not exists caja_chica.fondos (
  id uuid primary key default gen_random_uuid(),
  custodio_id uuid not null references auth.users(id),
  area text not null default 'almacen',
  descripcion text,
  monto_fijo numeric(14,2) not null,
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  estado text not null default 'activo' check (estado in ('activo','cerrado')),
  created_at timestamptz not null default now()
);

create sequence if not exists caja_chica.reposicion_codigo_seq;

create table if not exists caja_chica.reposiciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'RCC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('caja_chica.reposicion_codigo_seq')::text,4,'0')
  ),
  fondo_id uuid not null references caja_chica.fondos(id),
  monto_solicitado numeric(14,2) not null,
  estado text not null default 'pendiente_jefe' check (estado in (
    'pendiente_jefe','rechazada_jefe','pendiente_contabilidad','rechazada_contabilidad',
    'aprobada','pagada','cerrada'
  )),
  aprobado_jefe_por uuid references auth.users(id),
  aprobado_jefe_fecha timestamptz,
  aprobado_contabilidad_por uuid references auth.users(id),
  aprobado_contabilidad_fecha timestamptz,
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  created_at timestamptz not null default now()
);

create table if not exists caja_chica.movimientos (
  id uuid primary key default gen_random_uuid(),
  fondo_id uuid not null references caja_chica.fondos(id),
  fecha date not null default current_date,
  categoria_id uuid not null references gastos.categorias_gasto(id),
  placa_vehiculo text,
  monto numeric(14,2) not null,
  tipo_comprobante text not null check (tipo_comprobante in ('factura','boleta','sin_comprobante')),
  numero text,
  ruc_emisor text,
  sustentable boolean not null default true,
  descripcion text,
  storage_path text,
  reposicion_id uuid references caja_chica.reposiciones(id),
  registrado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_reposicion_caja_chica'
  ) then
    alter table cuentas_x_pagar.obligaciones
      add constraint fk_reposicion_caja_chica
      foreign key (reposicion_caja_chica_id) references caja_chica.reposiciones(id);
  end if;
end $$;

-- ===================================================================
-- FINANCIAMIENTO (préstamos, fraccionamiento SUNAT, letras)
-- ===================================================================
create table if not exists financiamiento.prestamos (
  id uuid primary key default gen_random_uuid(),
  entidad_financiera text not null,
  numero_prestamo text,
  monto_original numeric(14,2) not null,
  moneda text not null check (moneda in ('PEN','USD')),
  tasa_interes_anual numeric(6,3),
  fecha_desembolso date,
  estado text not null default 'activo' check (estado in ('activo','cancelado')),
  created_at timestamptz not null default now()
);

create table if not exists financiamiento.prestamos_cuotas (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references financiamiento.prestamos(id),
  numero_cuota int not null,
  fecha_vencimiento date not null,
  monto_capital numeric(14,2) not null,
  monto_interes numeric(14,2) not null default 0,
  monto_cuota numeric(14,2) generated always as (monto_capital + monto_interes) stored,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_propuesta','pagada','vencida')),
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  unique (prestamo_id, numero_cuota)
);

create table if not exists financiamiento.fraccionamientos_sunat (
  id uuid primary key default gen_random_uuid(),
  numero_expediente text not null,
  -- ej. 'IGV Justo', 'Fraccionamiento general', 'REFT'
  tipo text,
  deuda_original numeric(14,2) not null,
  tasa_interes_moratorio numeric(6,3) default 0,
  fecha_resolucion date,
  estado text not null default 'activo' check (estado in ('activo','perdido','cancelado')),
  created_at timestamptz not null default now()
);

create table if not exists financiamiento.fraccionamientos_sunat_cuotas (
  id uuid primary key default gen_random_uuid(),
  fraccionamiento_id uuid not null references financiamiento.fraccionamientos_sunat(id),
  numero_cuota int not null,
  fecha_vencimiento date not null,
  monto_capital numeric(14,2) not null,
  monto_interes numeric(14,2) not null default 0,
  monto_cuota numeric(14,2) generated always as (monto_capital + monto_interes) stored,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_propuesta','pagada','vencida')),
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  unique (fraccionamiento_id, numero_cuota)
);

create table if not exists financiamiento.letras_por_pagar (
  id uuid primary key default gen_random_uuid(),
  obligacion_origen_id uuid not null references cuentas_x_pagar.obligaciones(id),
  proveedor_id uuid not null references compras.proveedores(id),
  numero_letra text,
  monto numeric(14,2) not null,
  moneda text not null check (moneda in ('PEN','USD')),
  fecha_emision date not null default current_date,
  fecha_vencimiento date not null,
  banco_negociacion text,
  estado text not null default 'pendiente' check (estado in (
    'pendiente','en_propuesta','pagada','protestada','renovada'
  )),
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  created_at timestamptz not null default now()
);

-- ===================================================================
-- IMPUESTOS
-- ===================================================================
create table if not exists impuestos.tipos_impuesto (
  id uuid primary key default gen_random_uuid(),
  -- Essalud, ONP, AFP, Renta 4ta, Renta 5ta, Seguro Vida Ley, IGV, Renta mensual
  nombre text not null,
  activo boolean not null default true
);

create table if not exists impuestos.obligaciones_tributarias (
  id uuid primary key default gen_random_uuid(),
  tipo_impuesto_id uuid not null references impuestos.tipos_impuesto(id),
  -- 'YYYY-MM'
  periodo text not null,
  monto numeric(14,2) not null,
  moneda text not null default 'PEN',
  fecha_vencimiento date not null,
  fuente text not null default 'manual' check (fuente in ('BUK','SUNAT','manual')),
  cargado_por uuid references auth.users(id),
  estado text not null default 'pendiente_contabilidad' check (estado in (
    'pendiente_contabilidad','conforme','en_propuesta','pagado'
  )),
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  created_at timestamptz not null default now(),
  unique (tipo_impuesto_id, periodo)
);

-- ===================================================================
-- ÍNDICES
-- ===================================================================
create index if not exists ordenes_compra_estado_idx on compras.ordenes_compra (estado);
create index if not exists ordenes_servicio_estado_idx on servicios.ordenes_servicio (estado);
create index if not exists obligaciones_estado_idx on cuentas_x_pagar.obligaciones (estado);
create index if not exists obligaciones_origen_idx on cuentas_x_pagar.obligaciones (origen);
create index if not exists obligaciones_vencimiento_idx on cuentas_x_pagar.obligaciones (fecha_vencimiento_real);
create index if not exists obligaciones_proveedor_idx on cuentas_x_pagar.obligaciones (proveedor_id);
create index if not exists solicitudes_gasto_estado_idx on gastos.solicitudes_gasto (estado);
create index if not exists solicitudes_gasto_solicitante_idx on gastos.solicitudes_gasto (solicitante_id);
create index if not exists movimientos_fondo_reposicion_idx on caja_chica.movimientos (fondo_id, reposicion_id);
