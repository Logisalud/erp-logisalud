/**
 * Conciliación de una factura de compra contra lo VERIFICADO recibido —
 * puro: sin Next, sin Supabase, testeable solo.
 *
 * Distinto de `conciliarLineas` en domain/obligacion.ts (esa es la
 * conciliación de 3 vías del flujo VIEJO, un recepcion_id directo, que solo
 * dice conforme/observada). Esta es la del flujo NUEVO multi-recepción
 * (services/facturas-pendientes.ts): además de decidir si concilia,
 * calcula el MONTO a conciliar por línea — porque acá una discrepancia no
 * bloquea nada (regla de negocio 5, no la del documento maestro): si lo
 * facturado supera lo verificado, la obligación se crea igual por el monto
 * verificado y la diferencia queda como excepción para Contabilidad.
 *
 * "Verificado" = `ordenes_compra_items.cantidad_recibida` menos lo que ya
 * se facturó en obligaciones anteriores de esa misma línea — esa columna
 * YA excluye lo rechazado/dañado/producto equivocado (ver el comentario de
 * esa columna en 0001_compras_pagos_schemas.sql y
 * services/recepciones.ts::registrarRecepcion, donde cantidad_aceptada se
 * llena siempre, separado de cantidad_rechazada).
 */

export type LineaFacturaConciliacion = {
  ocItemId: string
  cantidadFacturada: number
  precioFacturado: number
}

export type LineaOCDisponible = {
  ocItemId: string
  /** cantidad_recibida - cantidad_facturada ya registrada en obligaciones anteriores. */
  cantidadVerificadaDisponible: number
  /** Precio de la OC — el monto conciliado se calcula con ESTE precio, nunca con el facturado. */
  precioUnitarioOC: number
}

export type ResultadoLineaConciliacion = {
  ocItemId: string
  /** Bonificado: precio_facturado <= 0. Nunca participa de la conciliación monetaria ni genera excepción. */
  esBonificado: boolean
  cantidadFacturada: number
  cantidadVerificadaDisponible: number
  /** min(facturado, verificado disponible) — 0 en una línea bonificada. */
  cantidadConciliada: number
  /** cantidadConciliada × precioUnitarioOC. */
  montoConciliado: number
  tieneExcepcion: boolean
  motivoExcepcion: string | null
}

export type ResultadoConciliacionFactura = {
  lineas: ResultadoLineaConciliacion[]
  /** Suma de montoConciliado de todas las líneas — es la base_imponible de la obligación (regla 5). */
  montoTotalConciliado: number
  tieneExcepciones: boolean
}

export function redondear(n: number): number {
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

export function conciliarFactura(
  lineasFactura: readonly LineaFacturaConciliacion[],
  lineasOCDisponibles: readonly LineaOCDisponible[]
): ResultadoConciliacionFactura {
  const ocPorItem = new Map(lineasOCDisponibles.map((l) => [l.ocItemId, l]))

  const lineas = lineasFactura.map((lf): ResultadoLineaConciliacion => {
    const oc = ocPorItem.get(lf.ocItemId)
    if (!oc) throw new Error(`La línea ${lf.ocItemId} no corresponde a esta orden de compra.`)

    const esBonificado = lf.precioFacturado <= 0
    if (esBonificado) {
      return {
        ocItemId: lf.ocItemId,
        esBonificado: true,
        cantidadFacturada: lf.cantidadFacturada,
        cantidadVerificadaDisponible: oc.cantidadVerificadaDisponible,
        cantidadConciliada: 0,
        montoConciliado: 0,
        tieneExcepcion: false,
        motivoExcepcion: null,
      }
    }

    const cantidadConciliada = Math.min(lf.cantidadFacturada, oc.cantidadVerificadaDisponible)
    const montoConciliado = redondear(cantidadConciliada * oc.precioUnitarioOC)
    const tieneExcepcion = lf.cantidadFacturada > oc.cantidadVerificadaDisponible
    const motivoExcepcion = tieneExcepcion
      ? `Facturado (${lf.cantidadFacturada}) supera lo verificado recibido y disponible (${oc.cantidadVerificadaDisponible}) — se concilia por lo verificado.`
      : null

    return {
      ocItemId: lf.ocItemId,
      esBonificado: false,
      cantidadFacturada: lf.cantidadFacturada,
      cantidadVerificadaDisponible: oc.cantidadVerificadaDisponible,
      cantidadConciliada,
      montoConciliado,
      tieneExcepcion,
      motivoExcepcion,
    }
  })

  const montoTotalConciliado = redondear(lineas.reduce((acc, l) => acc + l.montoConciliado, 0))
  const tieneExcepciones = lineas.some((l) => l.tieneExcepcion)

  return { lineas, montoTotalConciliado, tieneExcepciones }
}
