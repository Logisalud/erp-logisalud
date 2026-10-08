// D-15: quien hace un movimiento no lo valida. El verificador es distinto de quien lo preparó y de quien lo ejecutó
// (también lo exige la base de datos: restricciones de wms.movimientos y wms.validar_movimiento).

export interface ParticipantesMovimiento {
  preparadorId?: string | null
  ejecutorId?: string | null
}

export type ResultadoVerificacion = { puede: true } | { puede: false; mensaje: string }

export function puedeVerificar(verificadorId: string | null | undefined, m: ParticipantesMovimiento): ResultadoVerificacion {
  if (!verificadorId) return { puede: false, mensaje: 'Falta indicar quién verifica.' }
  if (m.ejecutorId && verificadorId === m.ejecutorId) return { puede: false, mensaje: 'El verificador no puede ser quien ejecutó el movimiento.' }
  if (m.preparadorId && verificadorId === m.preparadorId) return { puede: false, mensaje: 'El verificador no puede ser quien preparó el movimiento.' }
  return { puede: true }
}
