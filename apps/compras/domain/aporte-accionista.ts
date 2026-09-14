/**
 * Aporte de accionista: un gasto que el accionista pagó de su bolsillo y NO
 * reclama como reembolso. Puro: sin Next, sin Supabase.
 *
 * Mariela confirmó (2026-09-14) que contablemente son aporte a cuenta de
 * accionista, no gasto de la empresa con obligación de pago.
 *
 * LA REGLA QUE LO DEFINE TODO: esto NUNCA crea una obligación. No hay
 * movimiento de dinero de la empresa, ni ahora ni después. El ERP registra
 * el hecho y lo hace visible; el asiento de aporte de capital lo hace
 * Contabilidad en su sistema — acá no se toca nada contable.
 *
 * Por eso tampoco hay estados ni flujo: un aporte nace y existe. Una máquina
 * de estados insinuaría que algo tiene que pasar después, y no pasa nada
 * después.
 */

export type BorradorAporte = {
  fecha: string
  /** Del catálogo `gastos.categorias_gasto`, o vacío si se usa el libre. */
  categoriaId: string | null
  /** Para lo que no encaja en el catálogo. Uno de los dos tiene que venir. */
  categoriaLibre: string | null
  descripcion: string
  moneda: string
  monto: number
}

export type ErrorValidacion = { campo: string; mensaje: string }

export function validarAporte(b: BorradorAporte): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!b.fecha) {
    errores.push({ campo: 'fecha', mensaje: 'Pon la fecha del gasto.' })
  } else if (b.fecha > hoyISO()) {
    // Un aporte es un gasto que YA ocurrió; con fecha futura no hay nada que
    // registrar todavía.
    errores.push({ campo: 'fecha', mensaje: 'La fecha no puede ser futura — es un gasto que ya ocurrió.' })
  }

  if (!b.categoriaId && !b.categoriaLibre?.trim()) {
    errores.push({
      campo: 'categoriaId',
      mensaje: 'Elige una categoría o escribe una si ninguna encaja.',
    })
  }

  if (!b.descripcion.trim()) {
    errores.push({ campo: 'descripcion', mensaje: 'Cuenta en qué fue el gasto.' })
  }

  if (!(Number(b.monto) > 0)) {
    errores.push({ campo: 'monto', mensaje: 'El monto tiene que ser mayor a 0.' })
  }

  if (b.moneda !== 'PEN' && b.moneda !== 'USD') {
    errores.push({ campo: 'moneda', mensaje: 'La moneda tiene que ser PEN o USD.' })
  }

  return errores
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Editar y anular NO tienen ventana, a diferencia de todo el resto del
 * módulo (ver domain/edicion.ts). Es una decisión explícita, no un olvido:
 * no hay ninguna autoridad que decida sobre un aporte, así que no existe el
 * momento en que se congela. Mientras no esté anulado, se corrige.
 */
export function puedeEditarseAporte(anuladoEn: string | null): boolean {
  return !anuladoEn
}

export function puedeAnularseAporte(anuladoEn: string | null): boolean {
  return !anuladoEn
}

/** Cómo se nombra la categoría en pantalla: la del catálogo, o la escrita. */
export function etiquetaCategoria(
  nombreCatalogo: string | null,
  libre: string | null
): string {
  return nombreCatalogo ?? libre?.trim() ?? '—'
}

export type MontoPorMoneda = { moneda: string; monto: number }

/**
 * Totales SIEMPRE agrupados por moneda y nunca sumados entre sí — mismo
 * criterio que `sumarPorMoneda` en domain/propuesta-permisos.ts: un único
 * número mezclando PEN y USD sería directamente falso.
 */
export function totalesPorMoneda(
  filas: readonly { moneda: string; monto: number }[]
): MontoPorMoneda[] {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.moneda, (mapa.get(f.moneda) ?? 0) + f.monto)
  return [...mapa.entries()]
    .map(([moneda, monto]) => ({ moneda, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/** Agrupado por categoría, para el reporte de Contabilidad. */
export function totalesPorCategoria(
  filas: readonly { categoria: string; moneda: string; monto: number }[]
): { categoria: string; totales: MontoPorMoneda[]; cantidad: number }[] {
  const mapa = new Map<string, { moneda: string; monto: number }[]>()
  for (const f of filas) {
    const lista = mapa.get(f.categoria) ?? []
    lista.push({ moneda: f.moneda, monto: f.monto })
    mapa.set(f.categoria, lista)
  }
  return [...mapa.entries()]
    .map(([categoria, montos]) => ({
      categoria,
      totales: totalesPorMoneda(montos),
      cantidad: montos.length,
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria))
}
