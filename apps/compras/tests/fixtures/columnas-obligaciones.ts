/**
 * Las columnas ESCRIBIBLES de `cuentas_x_pagar.obligaciones`, sacadas de la
 * base real (information_schema, is_generated = 'NEVER') el 2026-10-06, más
 * `monto_exonerado` (migración 0078).
 *
 * Las generadas (`total`, `neto_a_pagar`) no van: no se pueden escribir.
 *
 * Cuando una migración agregue o renombre una columna de obligaciones, hay
 * que actualizar esta lista en el mismo PR — el test que la usa va a fallar
 * si no, que es justamente para lo que existe.
 */
export const COLUMNAS_ESCRIBIBLES_OBLIGACIONES = [
  'anulada_en', 'anulada_motivo', 'anulada_por', 'aporte_accionista_id', 'base_imponible',
  'beneficiario_persona', 'categoria_pago_directo_id', 'codigo', 'condicion_pago_dias',
  'conformidad_fecha', 'conformidad_por', 'cotizacion_storage_path', 'creador_correo',
  'created_at', 'created_by', 'editado_en', 'editado_por', 'espera_nota_credito', 'estado',
  'factura_storage_path', 'fecha_factura', 'fecha_vencimiento_real', 'id', 'igv', 'moneda',
  'monto_detraccion', 'monto_exonerado', 'numero_factura', 'observaciones', 'oc_id', 'origen', 'os_id',
  'porcentaje_detraccion', 'proveedor_id', 'proveedor_servicio_id', 'recepcion_id',
  'rechazada_en', 'rechazada_por', 'rechazo_motivo', 'reposicion_caja_chica_id', 'sin_igv',
  'solicitud_gasto_id', 'tasa_detraccion_id', 'tipo_cambio', 'updated_at', 'version',
] as const
