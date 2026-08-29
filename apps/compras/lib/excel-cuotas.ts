import * as XLSX from 'xlsx'
import type { BorradorCuota } from '@/domain/financiamiento'

const ENCABEZADOS = ['N° Cuota', 'Fecha vencimiento', 'Capital', 'Interés'] as const

export type ErrorParseo = { campo: string; mensaje: string }

export type ResultadoParseo =
  | { ok: true; cuotas: BorradorCuota[] }
  | { ok: false; errores: ErrorParseo[] }

/**
 * Plantilla descargable — mismas columnas que espera `parsearCuotasExcel`,
 * con una fila de ejemplo para que quede claro el formato. Se sirve desde
 * app/financiamiento/fraccionamientos/nueva/plantilla-cuotas.xlsx/route.ts.
 */
export function generarPlantillaCuotas(): Buffer {
  const filas = [
    [...ENCABEZADOS],
    [1, '2026-09-15', 500.0, 12.5],
    [2, '2026-10-15', 500.0, 10.0],
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Cronograma')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Cronograma de cuotas subido por Excel — alternativa a transcribirlas una
 * por una en CuotasInput (mismo destino final: BorradorCuota[], validado
 * después con domain/financiamiento.ts::validarCuotas). Los errores de
 * ACÁ son estructurales (encabezado equivocado, celda vacía, texto donde
 * va un número) — errores de NEGOCIO (cuota repetida, capital <= 0) los
 * sigue detectando validarCuotas, para no duplicar esa lógica.
 */
export function parsearCuotasExcel(buffer: ArrayBuffer): ResultadoParseo {
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch {
    return { ok: false, errores: [{ campo: 'archivoCuotas', mensaje: 'El archivo no se pudo leer — ¿es un .xlsx válido?' }] }
  }

  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) {
    return { ok: false, errores: [{ campo: 'archivoCuotas', mensaje: 'El archivo no tiene ninguna hoja con datos.' }] }
  }

  const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false })
  if (filas.length === 0) {
    return { ok: false, errores: [{ campo: 'archivoCuotas', mensaje: 'La hoja está vacía.' }] }
  }

  const encabezado = (filas[0] ?? []).map((c) => String(c ?? '').trim())
  const encabezadoOk = ENCABEZADOS.every((h, i) => encabezado[i]?.toLowerCase() === h.toLowerCase())
  if (!encabezadoOk) {
    return {
      ok: false,
      errores: [{
        campo: 'archivoCuotas',
        mensaje: `La primera fila tiene que ser exactamente: ${ENCABEZADOS.join(' | ')} — descarga la plantilla si no la tienes a mano.`,
      }],
    }
  }

  const filasDatos = filas.slice(1)
  if (filasDatos.length === 0) {
    return { ok: false, errores: [{ campo: 'archivoCuotas', mensaje: 'No hay ninguna fila de cuota debajo del encabezado.' }] }
  }

  const errores: ErrorParseo[] = []
  const cuotas: BorradorCuota[] = []

  filasDatos.forEach((fila, i) => {
    const numeroFilaExcel = i + 2 // +1 por el encabezado, +1 porque Excel empieza en 1
    const [numeroCuotaRaw, fechaRaw, capitalRaw, interesRaw] = fila

    const numeroCuota = Number(numeroCuotaRaw)
    if (numeroCuotaRaw == null || numeroCuotaRaw === '' || Number.isNaN(numeroCuota)) {
      errores.push({ campo: `cuotas.${i}.numeroCuota`, mensaje: `Fila ${numeroFilaExcel}, columna "N° Cuota": "${numeroCuotaRaw ?? ''}" no es un número.` })
    }

    const fechaVencimiento = normalizarFecha(fechaRaw)
    if (!fechaVencimiento) {
      errores.push({ campo: `cuotas.${i}.fechaVencimiento`, mensaje: `Fila ${numeroFilaExcel}, columna "Fecha vencimiento": "${fechaRaw ?? ''}" no es una fecha válida (usa AAAA-MM-DD).` })
    }

    const montoCapital = Number(capitalRaw)
    if (capitalRaw == null || capitalRaw === '' || Number.isNaN(montoCapital)) {
      errores.push({ campo: `cuotas.${i}.montoCapital`, mensaje: `Fila ${numeroFilaExcel}, columna "Capital": "${capitalRaw ?? ''}" no es un número.` })
    }

    const montoInteres = interesRaw == null || interesRaw === '' ? 0 : Number(interesRaw)
    if (Number.isNaN(montoInteres)) {
      errores.push({ campo: `cuotas.${i}.montoInteres`, mensaje: `Fila ${numeroFilaExcel}, columna "Interés": "${interesRaw}" no es un número.` })
    }

    cuotas.push({ numeroCuota, fechaVencimiento: fechaVencimiento ?? '', montoCapital, montoInteres })
  })

  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, cuotas }
}

function normalizarFecha(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10)
  }
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    return valor.trim()
  }
  return null
}
