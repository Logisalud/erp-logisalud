/**
 * Los valores guardados de una OS con la forma que necesita el formulario.
 * Puro — mismo patrón que domain/valores-solicitud.ts.
 */

export type ValoresOS = {
  proveedorServicioId: string
  descripcionServicio: string
  montoEstimado: string
  /** 'true' | 'false' | '' — es el value de un <select>, no un booleano:
   * el vacío es el "todavía no eligió" que `validarOS` rechaza. Una OS
   * vieja creada antes del campo (ver 0033) cae ahí y obliga a definirlo
   * al editar, que es exactamente lo que corresponde. */
  montoIncluyeIgv: string
  moneda: string
  condicionesPagoDias: number | null
  fechaEntregaEstimada: string
}

type FilaOS = {
  proveedor_servicio_id: string | null
  descripcion_servicio: string | null
  monto_estimado: number | string | null
  monto_incluye_igv: boolean | null
  moneda: string | null
  condiciones_pago_dias: number | null
  fecha_entrega_estimada: string | null
}

export function valoresDeOS(fila: FilaOS): ValoresOS {
  return {
    proveedorServicioId: fila.proveedor_servicio_id ?? '',
    descripcionServicio: fila.descripcion_servicio ?? '',
    montoEstimado:
      fila.monto_estimado === null || fila.monto_estimado === undefined
        ? ''
        : String(fila.monto_estimado),
    montoIncluyeIgv: fila.monto_incluye_igv === null ? '' : String(fila.monto_incluye_igv),
    moneda: fila.moneda ?? 'PEN',
    condicionesPagoDias: fila.condiciones_pago_dias,
    fechaEntregaEstimada: fila.fecha_entrega_estimada ?? '',
  }
}
