-- Recepción de mercadería, modelo de TRES COLUMNAS.
--
-- Va en UNA migración y no en las tres que se plantearon en el plan: las
-- tres columnas, el freno de propuesta y el excedente son una sola función
-- de negocio. Separarlas solo lograría que una aplicación parcial dejara el
-- schema en un estado que ningún código sabe leer.
--
-- ── El cambio de eje ─────────────────────────────────────────────────────
-- Antes: lo físico se comparaba contra lo PEDIDO EN LA OC, y de ahí salían
-- `faltante`/`sobrante`. Ese eje estaba mal: una entrega parcial contra la
-- OC es normal (el resto llega en otra guía) y no dice nada sobre si el
-- proveedor cobra de más.
--
-- Ahora hay dos ejes separados:
--   ① factura vs OC pedida  → seguimiento de entrega, informativo
--   ② físico vs factura     → la discrepancia con consecuencia económica
--
-- ── Riesgo de datos: NINGUNO ─────────────────────────────────────────────
-- Verificado antes de escribir esto: `almacen.recepciones_items` tiene 0
-- filas y `cuentas_x_pagar.facturas_pendientes` tiene 0 filas. Nunca se
-- registró una recepción en producción, así que no hay nada que migrar ni
-- nada que preservar. Todo lo de abajo es aditivo igual.
--
-- ── Lo que queda en la base SIN USO, a propósito ─────────────────────────
-- `almacen.matriz_resolucion_discrepancias`, `almacen.resoluciones_discrepancia`,
-- `recepciones_items.lote`, `recepciones_items.fecha_vencimiento`,
-- `recepciones_items.estado_calidad`, `recepciones_items.tipo_discrepancia`.
-- No se borran: lote/vencimiento vuelven cuando exista el módulo de
-- inventario y trazabilidad (decisión de Sebas, 2026-09-18), y las otras
-- tienen 0 filas, así que dejarlas no cuesta nada.
--
-- Re-ejecutable.

-- ── ① La tercera cantidad ────────────────────────────────────────────────
-- `cantidad_guia` ya existía y significa otra cosa ("lo que decía la guía",
-- informativo, no clasificaba). Se conserva; la que manda es esta.
alter table almacen.recepciones_items
  add column if not exists cantidad_factura numeric;

comment on column almacen.recepciones_items.cantidad_factura is
  'Lo que declara la FACTURA del proveedor para esta línea. Es la base del '
  'cálculo de la obligación: se debe lo facturado hasta que exista una nota '
  'de crédito. `cantidad_fisica` se compara contra ESTA, no contra la OC.';

-- ── ② El excedente del Caso B ───────────────────────────────────────────
alter table almacen.recepciones_items
  add column if not exists excedente_sin_facturar numeric not null default 0;

comment on column almacen.recepciones_items.excedente_sin_facturar is
  'Caso B: llegó MÁS de lo facturado. Unidades que el proveedor todavía no '
  'cobró. No frena el pago de lo que sí está facturado.';

-- ── ③ Los documentos, a nivel de recepción ──────────────────────────────
-- Varias guías físicas pueden venir con UNA sola factura, llegando juntas.
-- `numero_guia` (singular) se conserva para no romper lecturas existentes;
-- el array es la fuente de verdad nueva.
alter table almacen.recepciones
  add column if not exists numeros_guia text[],
  add column if not exists numero_factura text;

comment on column almacen.recepciones.numeros_guia is
  'Los N° de guía de remisión de esta recepción. Array porque varias guías '
  'físicas pueden venir con una sola factura, llegando el mismo día.';

-- `storage_path_guia_recibida` y `storage_path_factura_proveedor` YA EXISTEN
-- desde 0001 y nunca se escribieron (gap documentado en
-- docs/recepcion-mercaderia.md sección 7). Este diseño por fin las usa; no
-- hace falta crearlas.

-- ── ④ El rastro de reemplazo de documentos ──────────────────────────────
-- Mismo patrón que `voucher_reemplazado_*` en cuentas_x_pagar.pagos (0057):
-- cambiar el respaldo documental de una recepción es legítimo, pero no
-- puede ser invisible.
alter table almacen.recepciones
  add column if not exists documento_reemplazado_cual text
    check (documento_reemplazado_cual in ('guia', 'factura')),
  add column if not exists documento_reemplazado_por uuid references public.perfiles(id),
  add column if not exists documento_reemplazado_en timestamptz,
  add column if not exists documento_reemplazado_motivo text;

-- ── ⑤ El freno de propuesta de pago (Caso A) ────────────────────────────
alter table cuentas_x_pagar.obligaciones
  add column if not exists espera_nota_credito boolean not null default false;

comment on column cuentas_x_pagar.obligaciones.espera_nota_credito is
  'Caso A de recepción: llegó MENOS de lo facturado. La obligación existe '
  'por el monto facturado —es lo que se debe hasta que haya NC— pero NO es '
  'elegible para propuesta de pago hasta que la nota de crédito se aplique. '
  'Caso B (llegó más) NO usa esto: lo facturado es correcto y se paga.';

create index if not exists obligaciones_espera_nc_idx
  on cuentas_x_pagar.obligaciones (espera_nota_credito)
  where espera_nota_credito = true;
