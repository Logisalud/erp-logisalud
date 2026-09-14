-- 0054 — Aporte de accionista: registro informativo, SIN obligación de pago.
--
-- Gastos que el accionista paga de su bolsillo y NO reclama como reembolso.
-- Mariela confirmó que contablemente son aporte a cuenta de accionista, no
-- gasto de la empresa con obligación de pago.
--
-- LA REGLA QUE DEFINE ESTA TABLA: acá NUNCA se crea una fila en
-- cuentas_x_pagar.obligaciones. No hay movimiento de dinero de la empresa,
-- ni ahora ni después. Es visibilidad para que Contabilidad conozca el costo
-- real del negocio y lo asiente como corresponda.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UN ESTADO EN `obligaciones`: todo lo demás
-- del módulo que registra plata termina en una obligación (un reembolso la
-- crea al aprobarse, una reposición de caja chica también). Meter esto ahí
-- como "obligación que no se paga" sería una deuda marcada "no cobrar"
-- viviendo en la tabla de deudas: se colaría en el Dashboard, en la sábana y
-- en los reportes por un filtro mal escrito, y bastaría uno para que
-- Tesorería la viera como pagable. Con tabla propia eso es IMPOSIBLE por
-- construcción, no por filtro: ninguna pantalla de pago la consulta.
--
-- SIN ESTADOS Y SIN FLUJO, también a propósito: un aporte nace y existe. No
-- hay aprobación ni pago. Una máquina de estados insinuaría que algo tiene
-- que pasar después, y no pasa nada después.
--
-- Re-ejecutable: `if not exists` y `drop policy if exists`.

create sequence if not exists gastos.aporte_codigo_seq;

create table if not exists gastos.aportes_accionista (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'AP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('gastos.aporte_codigo_seq')::text,4,'0')
  ),
  -- Cuándo ocurrió el gasto, que no es cuándo se registra: estos se cargan
  -- cuando el accionista junta los comprobantes, no el mismo día.
  fecha date not null default current_date,
  -- Catálogo compartido con las solicitudes de gasto, para que el reporte de
  -- Contabilidad agrupe por las mismas categorías que ya usa.
  categoria_id uuid references gastos.categorias_gasto(id),
  -- Para lo que no encaja en el catálogo. Uno de los dos tiene que venir —
  -- lo garantiza el CHECK de abajo.
  categoria_libre text,
  descripcion text not null,
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  monto numeric(14,2) not null check (monto > 0),
  storage_path_comprobante text,
  registrado_por uuid not null references public.perfiles(id),
  created_at timestamptz not null default now(),
  -- Editar y anular NO tienen ventana acá, a diferencia del resto del módulo
  -- (domain/edicion.ts): no hay ninguna autoridad que decida sobre un
  -- aporte, así que no hay momento en que se congele. Decisión explícita,
  -- no un olvido.
  editado_por uuid references public.perfiles(id),
  editado_en timestamptz,
  -- Anular es borrado LÓGICO y nunca un delete: Contabilidad ya pudo haberlo
  -- asentado en sus libros, y una fila que desaparece sin rastro es lo que
  -- rompe una conciliación.
  anulado_por uuid references public.perfiles(id),
  anulado_en timestamptz,
  anulado_motivo text,
  constraint aportes_accionista_categoria_presente check (
    categoria_id is not null or nullif(btrim(categoria_libre), '') is not null
  )
);

create index if not exists aportes_accionista_fecha_idx
  on gastos.aportes_accionista (fecha desc);

alter table gastos.aportes_accionista enable row level security;

-- El gate es `area = 'admin' AND rol = 'admin'` — hoy, exactamente
-- Sebastián Gonzales y Andrés Romero.
--
-- NO se usa `esAutoridadFinal`, aunque se mencionó al decidirlo: esa función
-- es `area='admin' OR (area='contabilidad' AND rol='admin')`, o sea que
-- incluiría también a Mariela (contabilidad/admin). El pedido nombró dos
-- personas, no tres, así que manda el criterio literal.
--
-- Decisión consciente de 2026-09-14: NO se crea una columna `es_accionista`
-- solo para esto. Si alguna vez hace falta afinarlo, se resuelve entonces
-- con una columna dedicada.
--
-- Hace falta una función propia porque `area_en()` no mira el rol.
create or replace function public.es_admin_total()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select area = 'admin' and rol = 'admin' from public.perfiles where id = auth.uid()
  ), false);
$$;

-- Contabilidad LEE —el reporte es para ella— pero no escribe: el hecho lo
-- registra quien lo vivió.
drop policy if exists aportes_accionista_lectura on gastos.aportes_accionista;
create policy aportes_accionista_lectura on gastos.aportes_accionista
  for select to authenticated
  using (public.es_admin_total() or public.area_en('contabilidad'));

drop policy if exists aportes_accionista_escritura on gastos.aportes_accionista;
create policy aportes_accionista_escritura on gastos.aportes_accionista
  for all to authenticated
  using (public.es_admin_total())
  with check (public.es_admin_total());
