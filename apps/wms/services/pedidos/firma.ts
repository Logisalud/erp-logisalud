import 'server-only'

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Firma HMAC del puerto con Pedidos (S3): cada solicitud lleva la hora y la firma de `hora \n MÉTODO \n ruta \n sha256(cuerpo)` con un secreto compartido.
// Nunca viaja el secreto, y una solicitud vieja (más de 5 minutos) no vale: no se puede repetir una captura.

export const TOLERANCIA_SEGUNDOS = 300
export const ENCABEZADO_HORA = 'x-wms-timestamp'
export const ENCABEZADO_FIRMA = 'x-wms-firma'

const aFirmar = (hora: string, metodo: string, ruta: string, cuerpo: string) =>
  `${hora}\n${metodo.toUpperCase()}\n${ruta}\n${createHash('sha256').update(cuerpo).digest('hex')}`

export function firmar(secreto: string, metodo: string, ruta: string, cuerpo: string, hora: string): string {
  return 'sha256=' + createHmac('sha256', secreto).update(aFirmar(hora, metodo, ruta, cuerpo)).digest('hex')
}

export type ResultadoVerificacion = { ok: true } | { ok: false; motivo: 'FALTA_FIRMA' | 'HORA_INVALIDA' | 'FUERA_DE_TIEMPO' | 'FIRMA_INCORRECTA' }

/** Lo que haría Pedidos al recibir la solicitud (el WMS lo usa en sus pruebas como doble del otro lado). */
export function verificar(
  secreto: string, metodo: string, ruta: string, cuerpo: string, hora: string | undefined | null, firma: string | undefined | null, ahora: Date = new Date(),
): ResultadoVerificacion {
  if (!hora || !firma) return { ok: false, motivo: 'FALTA_FIRMA' }
  const t = Number(hora)
  if (!Number.isInteger(t)) return { ok: false, motivo: 'HORA_INVALIDA' }
  if (Math.abs(ahora.getTime() / 1000 - t) > TOLERANCIA_SEGUNDOS) return { ok: false, motivo: 'FUERA_DE_TIEMPO' }
  const esperada = Buffer.from(firmar(secreto, metodo, ruta, cuerpo, hora))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return { ok: false, motivo: 'FIRMA_INCORRECTA' }
  return { ok: true }
}
