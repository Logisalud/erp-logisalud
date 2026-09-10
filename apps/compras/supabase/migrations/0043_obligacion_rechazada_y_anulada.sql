-- "Rechazar" un Pago Directo: la contraparte real de "Dar conformidad"
-- (sesión 2026-09-10). Hasta ahora Contabilidad solo podía hacer avanzar una
-- obligación o anularla; no existía devolverla diciendo "esto está mal".
--
-- POR QUÉ VA COMO ESTADO Y NO COMO COLUMNA LATERAL (a diferencia de 0042):
-- rechazar es el brazo negativo de la MISMA decisión que `conforme`, así que
-- vive en el mismo eje que `registrada -> observada -> conforme`. Con una
-- columna lateral, la fila seguiría en `registrada` y por lo tanto seguiría
-- siendo elegible para `darConformidad()` (que solo mira `estado`) y, después
-- de eso, para una propuesta de pago (services/propuestas.ts levanta
-- candidatos con `estado = 'conforme'`). Un estado real la excluye sola en
-- todos lados, sin agregar un guarda nuevo por cada consulta futura.
--
-- Por la misma razón se agrega también 'anulada': 0042 dejó la anulación de
-- un Pago Directo SOLO en columnas laterales, así que hoy una obligación
-- anulada sigue en `registrada` y todavía admite "Dar conformidad" — una fuga
-- real, sin daño hasta ahora porque no hay ninguna fila anulada en
-- producción. Las columnas de auditoría de 0042 se conservan tal cual: el
-- estado dice QUÉ pasó, las columnas dicen quién, cuándo y por qué (mismo
-- patrón que compras.ordenes_compra y servicios.ordenes_servicio, que ya
-- combinan estado 'anulada' + anulado_motivo/anulado_por/anulado_en).
--
-- Ampliar un CHECK no dispara la trampa de "se valida contra la tabla
-- entera": ninguna fila existente puede violar una lista de valores MÁS
-- larga. La trampa aplica al angostar, no al ampliar.

alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_estado_check;

alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_estado_check check (estado in (
    'pendiente_factura', 'registrada', 'observada', 'conforme',
    'en_propuesta', 'pagada', 'cerrada', 'canjeada_por_letra',
    'rechazada', 'anulada'
  ));

-- Quién rechazó, cuándo y por qué — mismas tres columnas que 0042 creó para
-- la anulación, con el mismo criterio: el motivo es obligatorio en la capa de
-- servicio, no un texto opcional que se pueda dejar en blanco.
alter table cuentas_x_pagar.obligaciones
  add column if not exists rechazo_motivo text,
  add column if not exists rechazada_por uuid references auth.users(id),
  add column if not exists rechazada_en timestamptz;

-- Cierra la fuga de 0042 para cualquier fila que se haya anulado entre esa
-- migración y esta (en producción hoy son 0). Va DESPUÉS de ampliar el CHECK,
-- porque hasta ese momento 'anulada' no era un valor válido en esta tabla.
update cuentas_x_pagar.obligaciones
   set estado = 'anulada'
 where anulada_en is not null
   and estado <> 'anulada';
