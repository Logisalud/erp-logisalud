import * as XLSX from 'xlsx'

/**
 * Importador de la rendición de Caja Chica desde el Excel que Roberto ya
 * mantiene (LIQUIDACION-TRANSPORTE_GASTOS). Mismo patrón que
 * lib/excel-cuotas.ts: puro, sin Supabase, testeable solo.
 *
 * ── DECISIÓN CONSCIENTE: sin base imponible ni IGV ────────────────────────
 * El Excel trae una sola columna de dinero (MONTO, el total). El resto del
 * módulo exige base e IGV REALES del comprobante, nunca deducidos —
 * `movimientos_base_igv_si_hay_comprobante` lo fuerza en la base.
 *
 * Sebas decidió (2026-09-16) NO pedirle a Roberto que agregue esas columnas,
 * aceptando el costo: las filas entran como `sin_comprobante`, que es la
 * única combinación que el CHECK permite sin inventar el desglose, y con eso
 * se PIERDE el crédito fiscal — del orden de S/95 por rendición, todos los
 * meses. Es un trade-off elegido, no un olvido.
 *
 * Los comprobantes físicos existen y viven en OneDrive; el número de cada
 * uno sí se guarda (columna NRO DOC), así que la trazabilidad no se pierde:
 * lo que se pierde es el desglose tributario.
 *
 * ── LA TRAMPA DEL NOMBRE DE LA HOJA ──────────────────────────────────────
 * En el archivo real la hoja se llama "DETALLE - 943,93" pero la suma de sus
 * filas es 623.25. Son números DISTINTOS (943,93 es el saldo de la caja).
 * El monto NUNCA se lee del nombre de la hoja.
 */

/** Los 8 encabezados de la hoja DETALLE, en orden. */
const ENCABEZADOS = [
  'FECHA', 'UNIDAD', 'CATEGORIA', 'ORIGEN', 'PROVEEDOR', 'NRO DOC', 'DETALLE', 'MONTO',
] as const

/**
 * Cómo se llama la hoja que interesa. Es un PATRÓN y no un nombre exacto
 * porque lleva un número variable pegado ("DETALLE - 943,93").
 */
export const PATRON_HOJA_DETALLE = /^\s*DETALLE/i

/**
 * Del vocabulario del Excel al catálogo `gastos.categorias_gasto`.
 *
 * Se mapea explícitamente y no por parecido: "GAS" y "GASOLINA" son ambos
 * Combustible, pero acertar eso por heurística sería suerte. Lo que no está
 * acá hace fallar el archivo entero, con el nombre y la fila — mandarlo a
 * "Otros gastos autorizados" en silencio perdería justo lo que Sebas quiere
 * analizar.
 */
export const MAPA_CATEGORIAS: Record<string, string> = {
  PEAJE: 'Peajes',
  COCHERA: 'Cocheras y estacionamientos',
  DIESEL: 'Combustible',
  GAS: 'Combustible',
  GASOLINA: 'Combustible',
}

export type FilaRendicion = {
  fecha: string
  /** La columna UNIDAD: la placa. Va a `movimientos.placa_vehiculo`, que ya
   *  existía en el esquema. */
  placaVehiculo: string
  /** Nombre de la categoría del catálogo, ya mapeado. */
  categoriaNombre: string
  /** PROVEEDOR + DETALLE unidos: `movimientos` no tiene columna de proveedor. */
  descripcion: string
  numero: string
  monto: number
}

export type ErrorParseo = { campo: string; mensaje: string }

export type ResultadoParseo =
  | { ok: true; filas: FilaRendicion[]; total: number; hoja: string }
  | { ok: false; errores: ErrorParseo[] }

/** Las hojas cuyo nombre matchea el patrón — para poder pedir que elijan. */
export function hojasCandidatas(nombres: readonly string[]): string[] {
  return nombres.filter((n) => PATRON_HOJA_DETALLE.test(n))
}

function aISO(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    // La celda viene como fecha real (t:'d'), ya en UTC medianoche.
    return valor.toISOString().slice(0, 10)
  }
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor.trim())) {
    return valor.trim().slice(0, 10)
  }
  return null
}

/**
 * Lee la rendición. `hojaElegida` la manda el usuario cuando hay más de una
 * candidata; si no viene, se usa la única que matchee.
 */
export function parsearRendicionExcel(
  buffer: ArrayBuffer,
  hojaElegida?: string
): ResultadoParseo {
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch {
    return { ok: false, errores: [{ campo: 'archivo', mensaje: 'El archivo no se pudo leer — ¿es un .xlsx válido?' }] }
  }

  const candidatas = hojasCandidatas(libro.SheetNames)
  let nombreHoja: string
  if (hojaElegida) {
    if (!libro.SheetNames.includes(hojaElegida)) {
      return { ok: false, errores: [{ campo: 'hoja', mensaje: `El archivo no tiene una hoja llamada "${hojaElegida}".` }] }
    }
    nombreHoja = hojaElegida
  } else if (candidatas.length === 1) {
    nombreHoja = candidatas[0]
  } else if (candidatas.length === 0) {
    return {
      ok: false,
      errores: [{ campo: 'hoja', mensaje: 'No se encontró ninguna hoja que empiece con "DETALLE". Elige la hoja a mano.' }],
    }
  } else {
    return {
      ok: false,
      errores: [{ campo: 'hoja', mensaje: `Hay varias hojas que empiezan con "DETALLE" (${candidatas.join(', ')}). Elige cuál usar.` }],
    }
  }

  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja], {
    header: 1, defval: null, blankrows: false,
  })
  if (filasCrudas.length === 0) {
    return { ok: false, errores: [{ campo: 'hoja', mensaje: `La hoja "${nombreHoja}" está vacía.` }] }
  }

  const encabezado = (filasCrudas[0] ?? []).map((c) => String(c ?? '').trim().toUpperCase())
  const faltantes = ENCABEZADOS.filter((e) => !encabezado.includes(e))
  if (faltantes.length > 0) {
    return {
      ok: false,
      errores: [{ campo: 'hoja', mensaje: `A la hoja "${nombreHoja}" le faltan columnas: ${faltantes.join(', ')}.` }],
    }
  }
  const col = (nombre: string) => encabezado.indexOf(nombre)

  const filas: FilaRendicion[] = []
  const errores: ErrorParseo[] = []
  let totalDeclarado: number | null = null

  for (let i = 1; i < filasCrudas.length; i++) {
    const cruda = filasCrudas[i] ?? []
    const fecha = cruda[col('FECHA')]
    const monto = Number(cruda[col('MONTO')] ?? 0)

    // La fila de totales del Excel: sin fecha pero con monto. Se guarda para
    // contrastarla contra la suma, que es la validación más importante.
    if (fecha == null && monto > 0) {
      totalDeclarado = monto
      continue
    }
    // Filas de separación: se ignoran en silencio, son parte del formato.
    if (fecha == null) continue

    const nFila = i + 1 // como lo numera Excel
    const fechaISO = aISO(fecha)
    if (!fechaISO) {
      errores.push({ campo: `fila-${nFila}`, mensaje: `Fila ${nFila}: la fecha no se entiende.` })
      continue
    }
    if (!(monto > 0)) {
      errores.push({ campo: `fila-${nFila}`, mensaje: `Fila ${nFila}: el monto tiene que ser mayor que cero.` })
      continue
    }

    const categoriaExcel = String(cruda[col('CATEGORIA')] ?? '').trim().toUpperCase()
    const categoriaNombre = MAPA_CATEGORIAS[categoriaExcel]
    if (!categoriaNombre) {
      errores.push({
        campo: `fila-${nFila}`,
        mensaje: `Fila ${nFila}: la categoría "${categoriaExcel || '(vacía)'}" no está en el catálogo del ERP.`,
      })
      continue
    }

    const proveedor = String(cruda[col('PROVEEDOR')] ?? '').trim()
    const detalle = String(cruda[col('DETALLE')] ?? '').trim()

    filas.push({
      fecha: fechaISO,
      placaVehiculo: String(cruda[col('UNIDAD')] ?? '').trim(),
      categoriaNombre,
      descripcion: [proveedor, detalle].filter(Boolean).join(' — '),
      numero: String(cruda[col('NRO DOC')] ?? '').trim(),
      monto,
    })
  }

  if (errores.length > 0) return { ok: false, errores }

  if (filas.length === 0) {
    return { ok: false, errores: [{ campo: 'hoja', mensaje: `La hoja "${nombreHoja}" no tiene ninguna fila de gasto.` }] }
  }

  const total = Math.round(filas.reduce((a, f) => a + f.monto, 0) * 100) / 100

  // Validación 2: total en cero. Protege del caso real en que el patrón caiga
  // sobre una hoja "plantilla", que tiene la MISMA estructura con montos en 0.
  if (total <= 0) {
    return {
      ok: false,
      errores: [{ campo: 'hoja', mensaje: `La hoja "${nombreHoja}" suma S/ 0 — ¿es una plantilla en blanco?` }],
    }
  }

  // Validación 1: el total del Excel tiene que coincidir con la suma. Si no,
  // algo se quedó afuera o hay una fila de más, y cargar eso sería cargar un
  // número que nadie revisó.
  if (totalDeclarado != null && Math.abs(totalDeclarado - total) > 0.01) {
    return {
      ok: false,
      errores: [{
        campo: 'hoja',
        mensaje:
          `El total del Excel (S/ ${totalDeclarado.toFixed(2)}) no coincide con la suma de las ` +
          `${filas.length} filas (S/ ${total.toFixed(2)}). Revisa el archivo antes de subirlo.`,
      }],
    }
  }

  return { ok: true, filas, total, hoja: nombreHoja }
}
