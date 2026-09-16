/**
 * Corregir la fecha de un pago ya registrado. Puro.
 *
 * El caso que lo motiva: el bug de zona horaria dejó pagos con la fecha del
 * día siguiente (un pago de las 22:50 del 11/09 guardado como 12/09). El bug
 * ya está arreglado —ver domain/fecha.ts— pero los pagos que quedaron mal
 * siguen ahí.
 *
 * Es hermano de domain/reemplazo-constancia.ts, pero NO es lo mismo y por eso
 * vive aparte: reemplazar un archivo es inerte para los números, cambiar la
 * fecha de pago reclasifica plata en el tiempo (ver el comentario de la
 * migración 0059 para la lista de reportes que la leen).
 */

import { hoyLima } from './fecha'

/**
 * Solo admin, igual que reemplazar la constancia y por la misma razón: se
 * está cambiando cómo se ve una salida de dinero en los reportes, y quien
 * ejecuta el pago no debería poder mover su propia fecha.
 */
export function puedeCorregirFechaDePago(
  perfil: { area: string | null; rol: string | null } | null
): boolean {
  return perfil?.area === 'admin' && perfil?.rol === 'admin'
}

export type ErrorValidacion = { campo: string; mensaje: string }

export function validarCorreccionFecha(input: {
  fechaNueva: string
  fechaActual: string
  motivo: string
  /** El "hoy" se inyecta para poder testear el borde sin depender del reloj. */
  hoy?: string
}): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  const hoy = input.hoy ?? hoyLima()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaNueva)) {
    errores.push({ campo: 'fechaNueva', mensaje: 'Elige la fecha correcta del pago.' })
  } else {
    // Un pago no pudo ocurrir mañana. Se compara contra el día de LIMA y no
    // contra el del servidor: con el `hoy` en UTC, corregir un pago a la
    // fecha de hoy desde Lima a las 20:00 se habría rechazado por "futura".
    if (input.fechaNueva > hoy) {
      errores.push({
        campo: 'fechaNueva',
        mensaje: 'La fecha no puede ser futura: el pago ya ocurrió.',
      })
    }
    if (input.fechaNueva === input.fechaActual) {
      errores.push({
        campo: 'fechaNueva',
        mensaje: 'Esa es la fecha que ya tiene. Elige otra o cancela.',
      })
    }
  }

  // Obligatorio, mismo criterio que el reemplazo de constancia: "se corrigió"
  // sin motivo no le dice nada a quien audite esto en un año.
  if (!input.motivo.trim()) {
    errores.push({ campo: 'motivo', mensaje: 'Cuenta por qué estás corrigiendo la fecha.' })
  }

  return errores
}

/**
 * ¿La corrección cruza de mes?
 *
 * Es el único caso en que esto deja de ser un detalle: mover un pago del
 * 01/10 al 30/09 cambia DOS cierres mensuales de forma retroactiva — el
 * "Pagado este mes" del tablero y los reportes con filtro de fechas. No se
 * bloquea (es el caso legítimo típico), pero se avisa antes de confirmar.
 */
export function cruzaDeMes(fechaActual: string, fechaNueva: string): boolean {
  return fechaActual.slice(0, 7) !== fechaNueva.slice(0, 7)
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "setiembre de 2026" — para la advertencia, en español de Perú. */
export function nombreDelMes(fechaISO: string): string {
  const [anio, mes] = fechaISO.split('-')
  return `${MESES[Number(mes) - 1]} de ${anio}`
}

/**
 * La advertencia que se lee ANTES de confirmar, con el monto adentro: sin el
 * monto es una nota al pie, con el monto es una decisión.
 */
export function advertenciaDeCambioDeMes(input: {
  fechaActual: string
  fechaNueva: string
  monto: number
  moneda: string
}): string | null {
  if (!cruzaDeMes(input.fechaActual, input.fechaNueva)) return null
  const simbolo = input.moneda === 'USD' ? 'US$' : 'S/'
  const monto = input.monto.toLocaleString('es-PE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  return (
    `Esto mueve ${simbolo} ${monto} de ${nombreDelMes(input.fechaActual)} ` +
    `a ${nombreDelMes(input.fechaNueva)}. Dos cierres mensuales van a cambiar.`
  )
}

/** "Fecha corregida: era 12/09/2026 · la cambió Sebastián Gonzales el 15/09/2026 14:30 — se registró con la fecha del día siguiente" */
export function etiquetaCorreccion(
  fechaOriginal: string | null,
  nombre: string | null,
  cuandoISO: string | null,
  motivo: string | null
): string | null {
  if (!fechaOriginal || !cuandoISO) return null
  const era = fechaOriginal.split('-').reverse().join('/')
  const cuando = new Date(cuandoISO).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const porQuien = nombre ?? 'alguien del ERP'
  return `Fecha corregida: era ${era} · la cambió ${porQuien} el ${cuando}${motivo ? ` — ${motivo}` : ''}`
}
