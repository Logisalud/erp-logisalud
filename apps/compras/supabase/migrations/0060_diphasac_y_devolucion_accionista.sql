-- Dos categorías PERMANENTES de Pago Directo, y el vínculo de una de ellas
-- con los aportes de accionista.
--
-- El caso: pagos grandes recurrentes sin Orden de Compra de por medio.
--   (a) Abonos a DIPHASAC — empresa relacionada, sin OC formal entre ambas.
--   (b) La empresa devolviéndole plata AL accionista. Es la dirección
--       OPUESTA a "Aporte de accionista" (gastos.aportes_accionista), que es
--       el accionista poniendo plata y por diseño NUNCA crea obligación.
--       Acá sale plata de la empresa, así que sí es una obligación real.
--
-- A diferencia de la categoría del backlog pre-ERP, estas NO se desactivan:
-- no son un arreglo temporal, van a seguir pasando.
--
-- Tampoco llevan las otras dos excepciones del backlog (saltarse conformidad
-- y propuesta). Eso es a propósito y es lo que las mantiene controladas:
-- pasan por conformidad de Contabilidad y por una propuesta aprobada, como
-- cualquier otro Pago Directo.
--
-- NO se reusa el origen 'prestamo' para (b): ese ya significa "cuota de un
-- préstamo bancario" y lo genera services/financiamiento.ts desde la bandeja
-- de vencimientos, apoyado en las tablas prestamos + cuotas. Una devolución
-- a un accionista no tiene cronograma ni entidad financiera; meterla ahí
-- contaminaría los reportes de Financiamiento.
--
-- Re-ejecutable.

-- ── 1. Las dos categorías ────────────────────────────────────────────────
insert into cuentas_x_pagar.categorias_pago_directo (nombre)
values
  ('Abonos a DIPHASAC (empresa relacionada)'),
  ('Devolución de deuda a accionista')
on conflict (nombre) do nothing;

-- ── 2. Diphasac, elegible en Pago Directo ────────────────────────────────
-- Estaba como 'mercaderia', que lo restringe a compras con OC. Un abono a
-- una empresa relacionada no es una compra de mercadería.
update compras.proveedores set tipo = 'ambos'
where ruc = '20546207219' and tipo <> 'ambos';

-- ── 3. Beneficiarios internos ────────────────────────────────────────────
-- Los accionistas se registran como proveedores porque es el ÚNICO catálogo
-- de "a quién le pagamos" que no exige cuenta de usuario
-- (obligaciones.beneficiario_persona es FK a auth.users, y Marisol nunca
-- entra al ERP). Pero no tienen nada que hacer en el selector de una Orden
-- de Compra: este flag los saca de ahí sin sacarlos de Pago Directo.
alter table compras.proveedores
  add column if not exists es_beneficiario_interno boolean not null default false;

comment on column compras.proveedores.es_beneficiario_interno is
  'true = es un beneficiario interno (accionista), no un proveedor comercial. '
  'Se excluye de los selectores de Órdenes de Compra y de Servicio, pero '
  'sigue disponible en Pago Directo.';

-- ── 4. El vínculo con el aporte que la devolución salda ──────────────────
-- FK simple + validación de monto (opción 2 del diseño). La validación —que
-- la suma de devoluciones no supere el aporte— vive en
-- domain/devolucion-accionista.ts y no en un CHECK: necesita SUMAR las
-- devoluciones previas, y eso es una consulta, no una expresión de fila.
alter table cuentas_x_pagar.obligaciones
  add column if not exists aporte_accionista_id uuid
    references gastos.aportes_accionista(id);

comment on column cuentas_x_pagar.obligaciones.aporte_accionista_id is
  'Solo para la categoría "Devolución de deuda a accionista": qué aporte '
  'está saldando esta devolución. Null en todo lo demás.';

create index if not exists obligaciones_aporte_accionista_idx
  on cuentas_x_pagar.obligaciones (aporte_accionista_id)
  where aporte_accionista_id is not null;
