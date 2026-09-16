/**
 * Devolución de deuda a un accionista: la empresa devolviéndole plata al
 * accionista. Puro: sin Next, sin Supabase.
 *
 * Es la CONTRACARA de domain/aporte-accionista.ts. Un aporte es el
 * accionista poniendo dinero de su bolsillo sin pedir reembolso, y por eso
 * NUNCA crea una obligación. Una devolución es la dirección opuesta —sale
 * plata de la empresa— así que sí es una obligación real, y entra por Pago
 * Directo con su categoría propia.
 *
 * El vínculo con el aporte es OBLIGATORIO: una devolución que no dice qué
 * está saldando no se puede auditar ni netear. Lo que responde es "¿cuánto
 * le sigue debiendo la empresa a esta persona?".
 */

export const CATEGORIA_DEVOLUCION_ACCIONISTA = 'Devolución de deuda a accionista'

export function esDevolucionAccionista(categoriaNombre: string | null | undefined): boolean {
  return (categoriaNombre ?? '').trim() === CATEGORIA_DEVOLUCION_ACCIONISTA
}

export type ErrorValidacion = { campo: string; mensaje: string }

/** El estado de un aporte frente a lo que ya se devolvió contra él. */
export type SaldoDelAporte = {
  aporteId: string
  /** Lo que el accionista puso. */
  montoAporte: number
  /** Suma de las devoluciones YA registradas contra este aporte, sin contar
   *  las anuladas. */
  yaDevuelto: number
  moneda: string
}

export function saldoDisponible(s: SaldoDelAporte): number {
  return Math.round((s.montoAporte - s.yaDevuelto) * 100) / 100
}

/**
 * Valida una devolución contra el aporte que dice saldar.
 *
 * Por qué esto vive acá y no en un CHECK de la base: necesita SUMAR las
 * devoluciones previas contra ese aporte, y eso es una consulta, no una
 * expresión de fila. Mismo criterio que el resto de las reglas de negocio
 * del módulo (ver sección 8 del documento maestro).
 *
 * Opción 2 del diseño acordado con Sebas: FK simple + validación de monto.
 * NO es una tabla puente, así que una devolución salda UN aporte. Lo que la
 * validación impide es el caso incoherente —devolver más de lo que se
 * puso— que era el problema real de la FK simple sin validar.
 */
export function validarDevolucion(input: {
  aporteId: string | null
  monto: number
  moneda: string
  /** Null si el aporte no se encontró. */
  saldo: SaldoDelAporte | null
}): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!input.aporteId) {
    errores.push({
      campo: 'aporteAccionistaId',
      mensaje: 'Elige qué aporte está saldando esta devolución.',
    })
    return errores
  }

  if (!input.saldo) {
    errores.push({
      campo: 'aporteAccionistaId',
      mensaje: 'No se encontró ese aporte. Elige uno de la lista.',
    })
    return errores
  }

  // Devolver en una moneda distinta a la del aporte haría que el saldo
  // neto mezcle PEN con USD, que es justo lo que el resto del módulo evita.
  if (input.moneda !== input.saldo.moneda) {
    errores.push({
      campo: 'moneda',
      mensaje: `Ese aporte fue en ${input.saldo.moneda}. La devolución tiene que ser en la misma moneda.`,
    })
    return errores
  }

  const disponible = saldoDisponible(input.saldo)

  if (disponible <= 0) {
    errores.push({
      campo: 'aporteAccionistaId',
      mensaje: 'Ese aporte ya fue devuelto por completo. Elige otro.',
    })
    return errores
  }

  if (input.monto > disponible) {
    // El mensaje dice CUÁNTO queda, no solo que no se puede: sin el número,
    // la persona tiene que salir a buscarlo a otra pantalla.
    errores.push({
      campo: 'monto',
      mensaje:
        `De ese aporte quedan ${input.saldo.moneda} ` +
        `${disponible.toLocaleString('es-PE', { minimumFractionDigits: 2 })} por devolver, ` +
        `y esta devolución es por más. Registra hasta ese monto, o elige otro aporte.`,
    })
  }

  return errores
}
