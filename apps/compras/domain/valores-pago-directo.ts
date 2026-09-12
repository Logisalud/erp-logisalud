/**
 * Los valores guardados de un Pago Directo con la forma que necesita el
 * formulario. Puro — mismo patrón que domain/valores-solicitud.ts.
 */

export type ProveedorDeFormulario = {
  id: string
  nombre: string
  condicionPagoDias: number
  moneda: string
  fuente?: 'compra' | 'servicio'
}

export type ValoresPagoDirecto = {
  proveedor: ProveedorDeFormulario | null
  categoriaId: string
  descripcion: string
  moneda: 'PEN' | 'USD'
  tipoCambio: string
  baseImponible: string
  sinIgv: boolean
  condicionPagoDias: number | null
  numeroFactura: string
  fechaFactura: string
  /** Es el ESTADO guardado, no una casilla editable: ver el comentario del
   * formulario y `editarPagoDirecto` en services/obligaciones.ts. */
  pendienteFactura: boolean
  tieneDetraccion: boolean | null
  porcentajeDetraccion: string
  montoDetraccion: string
}

type FilaObligacionPD = {
  estado: string
  categoria_pago_directo_id: string | null
  observaciones: string | null
  moneda: string | null
  tipo_cambio: number | string | null
  base_imponible: number | string | null
  sin_igv: boolean | null
  condicion_pago_dias: number | null
  numero_factura: string | null
  fecha_factura: string | null
  porcentaje_detraccion: number | string | null
  monto_detraccion: number | string | null
}

export function valoresDePagoDirecto(
  fila: FilaObligacionPD,
  proveedor: ProveedorDeFormulario | null
): ValoresPagoDirecto {
  const numero = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === '' ? '' : String(v)

  // `monto_detraccion` es 0 (no null) cuando no hay detracción — la columna
  // tiene default 0. Por eso "tiene detracción" se decide por el
  // PORCENTAJE, que sí queda en null cuando no corresponde.
  const tieneDetraccion = fila.porcentaje_detraccion !== null && fila.porcentaje_detraccion !== undefined

  return {
    proveedor,
    categoriaId: fila.categoria_pago_directo_id ?? '',
    descripcion: fila.observaciones ?? '',
    moneda: (fila.moneda === 'USD' ? 'USD' : 'PEN'),
    tipoCambio: numero(fila.tipo_cambio),
    baseImponible: numero(fila.base_imponible),
    sinIgv: !!fila.sin_igv,
    condicionPagoDias: fila.condicion_pago_dias,
    numeroFactura: fila.numero_factura ?? '',
    fechaFactura: fila.fecha_factura ?? '',
    pendienteFactura: fila.estado === 'pendiente_factura',
    tieneDetraccion,
    porcentajeDetraccion: tieneDetraccion ? numero(fila.porcentaje_detraccion) : '',
    montoDetraccion: tieneDetraccion ? numero(fila.monto_detraccion) : '',
  }
}
