/**
 * Reemplazar la constancia de un pago ya registrado. Puro.
 *
 * El caso real: se subió la foto equivocada, o ilegible. No cambia ningún
 * dato financiero — ni fecha, ni monto, ni N° de operación, ni cuenta.
 *
 * PERO NO ES UN CAMBIO CUALQUIERA: el voucher es la evidencia de que ese
 * desembolso ocurrió, así que reemplazarlo es cambiar el respaldo documental
 * de una salida de dinero. Es legítimo, y por eso existe; lo que no puede
 * ser es invisible. La diferencia entre "corregir" y "alterar" es
 * exactamente si queda registrado quién y cuándo.
 */

export const ARCHIVOS_REEMPLAZABLES = ['voucher', 'detraccion'] as const
export type ArchivoConstancia = (typeof ARCHIVOS_REEMPLAZABLES)[number]

export const ETIQUETA_ARCHIVO: Record<ArchivoConstancia, string> = {
  voucher: 'Voucher del pago',
  detraccion: 'Comprobante de detracción',
}

export function esArchivoReemplazable(valor: string): valor is ArchivoConstancia {
  return (ARCHIVOS_REEMPLAZABLES as readonly string[]).includes(valor)
}

/**
 * Solo admin: Sebastián y Andrés.
 *
 * NO se incluye a Tesorería aunque la RLS de `pagos` se lo permitiría:
 * Milagritos ejecuta los pagos, y dejarla reemplazar el respaldo de un pago
 * que ella misma hizo borraría la separación entre quien paga y quien
 * custodia la evidencia. Si algún día lo necesita, se amplía — empezar
 * angosto es más fácil que recortar después.
 */
export function puedeReemplazarConstancia(
  perfil: { area: string | null; rol: string | null } | null
): boolean {
  return perfil?.area === 'admin' && perfil?.rol === 'admin'
}

export type ErrorValidacion = { campo: string; mensaje: string }

export function validarReemplazo(input: {
  cual: string
  motivo: string
  storagePathNuevo: string | null
}): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  if (!esArchivoReemplazable(input.cual)) {
    errores.push({ campo: 'cual', mensaje: 'Elige qué archivo estás reemplazando.' })
  }
  // Obligatorio: es lo que convierte el rastro en algo útil. "Se reemplazó"
  // sin motivo no le dice nada a quien audite esto en un año.
  if (!input.motivo.trim()) {
    errores.push({ campo: 'motivo', mensaje: 'Cuenta por qué lo estás reemplazando.' })
  }
  if (!input.storagePathNuevo) {
    errores.push({ campo: 'archivo', mensaje: 'Sube el archivo nuevo.' })
  }
  return errores
}

/** "Voucher del pago reemplazado por Sebastián Gonzales el 15/09/2026 14:30 — subí la foto equivocada" */
export function etiquetaReemplazo(
  cual: string | null,
  nombre: string | null,
  cuandoISO: string | null,
  motivo: string | null
): string | null {
  if (!cuandoISO) return null
  const que = esArchivoReemplazable(cual ?? '') ? ETIQUETA_ARCHIVO[cual as ArchivoConstancia] : 'Constancia'
  const cuando = new Date(cuandoISO).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const porQuien = nombre ?? 'alguien del ERP'
  return `${que} reemplazado por ${porQuien} el ${cuando}${motivo ? ` — ${motivo}` : ''}`
}
