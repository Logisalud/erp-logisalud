-- 0055 — Pago de Planilla: concepto propio, NO un tipo de impuesto.
--
-- Corrección de Sebas (2026-09-14): la planilla comparte con los impuestos
-- el ORIGEN DEL DATO (BUK le arroja el total a Arlette, que lo transcribe)
-- y nada más. No es un tributo: no se declara ante SUNAT, no tiene tipo de
-- impuesto, y el beneficiario son los trabajadores, no el Estado. Meterlo
-- en `impuestos.tipos_impuesto` habría hecho que todo reporte tributario
-- sumara la planilla como si fuera un impuesto.
--
-- Son DOS O MÁS pagos por mes (quincena, fin de mes, y eventualmente otro:
-- una gratificación, una CTS), cada uno con su propio total. Por eso
-- `secuencia` es un entero abierto y no un booleano quincena/fin de mes:
-- cerrarlo en dos dejaría el tercero sin forma de cargarse.
--
-- El flujo es el MISMO que el del resto del módulo, sin excepción por ser
-- recurrente: Arlette carga → Contabilidad/Tesorería dan conformidad →
-- nace la obligación → propuesta → aprobación → Tesorería paga con voucher.
-- La regla de oro dice que toda salida de dinero pasa por el mismo lugar, y
-- la planilla es de los montos más grandes del mes: es lo que menos
-- conviene sacar del embudo.
--
-- Re-ejecutable: `if not exists` y `drop policy if exists`.

create schema if not exists planilla;

-- Noveno schema del módulo (los otros ocho son los Bounded Contexts del
-- documento maestro). Va aparte y no dentro de `impuestos` justamente
-- porque el punto de esta migración es que NO es un impuesto.

create sequence if not exists planilla.pago_codigo_seq;

create table if not exists planilla.pagos_planilla (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'PL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('planilla.pago_codigo_seq')::text,4,'0')
  ),
  -- 'YYYY-MM'. Es el periodo que la planilla cubre, no cuándo se carga.
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- 1 = primera quincena, 2 = fin de mes, 3+ = pagos extra del mismo mes.
  -- Abierto a propósito: ver el comentario de arriba.
  secuencia int not null check (secuencia >= 1),
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  -- Compromiso duro, no estimación: va como `fecha_vencimiento_real` de la
  -- obligación, así entra en la sección "Vencidas" y en la proyección de
  -- pagos. Si la planilla del 15 no está en una propuesta aprobada el 14,
  -- tiene que salir en rojo.
  fecha_pago date not null,
  estado text not null default 'pendiente_contabilidad' check (
    estado in ('pendiente_contabilidad', 'conforme', 'anulada')
  ),
  cargado_por uuid references public.perfiles(id),
  obligacion_id uuid references cuentas_x_pagar.obligaciones(id),
  anulado_por uuid references public.perfiles(id),
  anulado_en timestamptz,
  anulado_motivo text,
  created_at timestamptz not null default now()
);

-- Cargar dos veces la misma quincena es un error de decenas de miles de
-- soles, y es el más fácil de cometer: dos personas, o la misma sin
-- acordarse. Un chequeo en el servicio pierde contra dos pestañas abiertas;
-- un índice en la base no pierde nunca.
--
-- PARCIAL: una carga anulada libera el par, para poder volver a cargarlo
-- bien. Sin el `where`, un error de tipeo bloquearía el periodo para siempre.
create unique index if not exists pagos_planilla_periodo_secuencia_unico
  on planilla.pagos_planilla (periodo, secuencia)
  where estado <> 'anulada';

create index if not exists pagos_planilla_fecha_idx
  on planilla.pagos_planilla (fecha_pago desc);

-- El origen nuevo, al mismo nivel que los otros diez. Ampliar un CHECK es
-- seguro (no revalida filas existentes); achicarlo no lo sería.
alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_origen_check;
alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_origen_check check (origen in (
    'compra', 'servicio', 'gasto_directo', 'reembolso', 'anticipo',
    'reposicion_caja_chica', 'prestamo', 'fraccionamiento_sunat',
    'letra_por_pagar', 'impuesto', 'planilla'
  ));

alter table planilla.pagos_planilla enable row level security;

-- Quién da conformidad: Tesorería, Contabilidad rol admin, o admin.
-- Beatriz (contabilidad/operativo) NO — mismo criterio de la Fase 1.7 que
-- ya rige Pago Directo y Propuestas, sin excepción.
create or replace function public.puede_dar_conformidad_planilla()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select area = 'tesoreria'
        or area = 'admin'
        or (area = 'contabilidad' and rol = 'admin')
    from public.perfiles where id = auth.uid()
  ), false);
$$;

-- Cargar: Gestión Humana (Arlette, que es quien recibe el dato de BUK),
-- Contabilidad y admin. Sin `gestion_humana` acá, el formulario sería
-- inusable justo para quien tiene que usarlo.
drop policy if exists pagos_planilla_carga on planilla.pagos_planilla;
create policy pagos_planilla_carga on planilla.pagos_planilla
  for insert to authenticated
  with check (public.area_en('gestion_humana', 'contabilidad', 'admin'));

-- Actualizar: los que cargan (para corregir o anular mientras está
-- pendiente) más los que dan conformidad. QUÉ puede hacer cada uno lo
-- decide la Server Action — acá solo se define quién puede escribir.
drop policy if exists pagos_planilla_actualiza on planilla.pagos_planilla;
create policy pagos_planilla_actualiza on planilla.pagos_planilla
  for update to authenticated
  using (
    public.area_en('gestion_humana', 'contabilidad', 'admin')
    or public.puede_dar_conformidad_planilla()
  );

-- Leer: los tres de arriba más Tesorería, que ejecuta el pago. Gerencia y
-- el resto de las áreas quedan afuera a propósito (pedido explícito): la
-- planilla no se muestra a nadie que no participe del circuito.
drop policy if exists pagos_planilla_lectura on planilla.pagos_planilla;
create policy pagos_planilla_lectura on planilla.pagos_planilla
  for select to authenticated
  using (public.area_en('gestion_humana', 'contabilidad', 'tesoreria', 'admin'));

-- ---------------------------------------------------------------------
-- Arreglo colateral: el índice que FALTABA en Impuestos.
--
-- Se creía que existía un unique por (tipo, periodo). No existía: hoy se
-- puede cargar dos veces el mismo IGV del mismo mes y nada avisa. Mismo
-- riesgo que el de planilla, así que va el mismo arreglo.
--
-- Verificado antes de crearlo (2026-09-14): 0 duplicados en producción, así
-- que el índice se crea sin normalizar nada.
create unique index if not exists obligaciones_tributarias_tipo_periodo_unico
  on impuestos.obligaciones_tributarias (tipo_impuesto_id, periodo)
  where estado <> 'anulada';
