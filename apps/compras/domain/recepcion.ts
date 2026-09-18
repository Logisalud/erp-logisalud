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
 * Queda solo lo que todavía lee código vivo: el vocabulario de discrepancia
 * (`TipoDiscrepancia`, que tipa columnas que siguen en la base) y
 * `recepcionQuedaConforme`. `ESTADOS_CALIDAD` y `ETIQUETA_DISCREPANCIA` se
 * fueron con el resto: nadie los leía. Ver el aviso al inicio de
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

/**
 * ¿La recepción entera puede cerrarse como conforme? Solo si ninguna línea
 * tiene una discrepancia todavía sin resolución del responsable de Almacén.
 * Una línea sin discrepancia ('ninguna') nunca bloquea el cierre.
 */
export function recepcionQuedaConforme(
  items: readonly { tipoDiscrepancia: TipoDiscrepancia; resuelta: boolean }[]
): boolean {
  return items.every((i) => i.tipoDiscrepancia === 'ninguna' || i.resuelta)
}
