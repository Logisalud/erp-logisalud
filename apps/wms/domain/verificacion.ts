// D-15: quien hace un movimiento no lo verifica. Un movimiento interno tiene solo dos personas: el EJECUTOR (quien lo crea en el
// sistema y mueve la mercadería: la misma persona) y el VERIFICADOR (otro auxiliar, el Jefe o su reemplazo; nunca el ejecutor).
// También lo exige la base de datos (restricciones de wms.ordenes_movimiento y wms.movimientos, y wms.revisar_movimiento).

export interface ParticipantesMovimiento {
  ejecutorId?: string | null
}

export type ResultadoVerificacion = { puede: true } | { puede: false; mensaje: string }

export function puedeVerificar(verificadorId: string | null | undefined, m: ParticipantesMovimiento): ResultadoVerificacion {
  if (!verificadorId) return { puede: false, mensaje: 'Falta indicar quién verifica.' }
  if (m.ejecutorId && verificadorId === m.ejecutorId) return { puede: false, mensaje: 'El verificador no puede ser quien ejecutó el movimiento.' }
  return { puede: true }
}
