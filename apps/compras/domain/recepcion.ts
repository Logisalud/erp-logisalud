/**
 * Lo que sobrevive de la Recepción de Almacén vieja. Puro: sin Next, sin
 * Supabase.
 *
 * ESTE ARCHIVO YA NO CLASIFICA NADA. La recepción se registra con el modelo
 * de tres columnas (domain/recepcion-tres-columnas.ts, 2026-09-18) y
 * `clasificarLinea` —que comparaba lo físico contra lo PEDIDO EN LA OC— se
 * eliminó junto con `validarRecepcion`, `mesesEntre` y los tipos del borrador
 * viejo: no les quedaba ningún consumidor fuera de sus propios tests.
 *
 * Queda SOLO el vocabulario de discrepancia: `TipoDiscrepancia`, que sigue
 * tipando `recepciones_items.tipo_discrepancia` donde el listado la lee.
 * `ESTADOS_CALIDAD` y `ETIQUETA_DISCREPANCIA` se fueron con el resto porque
 * nadie los leía, y `recepcionQuedaConforme` se fue el 2026-09-18 al
 * retirarse `resolverDiscrepancia` —su único llamador— junto con la columna
 * "Discrepancias abiertas" del reporte de OC.
 *
 * Si algún día se retira de la base la columna `tipo_discrepancia`, este
 * archivo entero se va con ella. Ver el aviso al inicio de
 * docs/recepcion-mercaderia.md.
 */

export const TIPOS_DISCREPANCIA = [
  'ninguna',
  'faltante',
  'sobrante',
  'producto_erroneo',
  'danado',
  'vencido',
  'por_vencer',
  'lote_no_informado',
] as const
export type TipoDiscrepancia = (typeof TIPOS_DISCREPANCIA)[number]
