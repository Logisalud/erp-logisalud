// La firma dibujada llega del navegador como una imagen PNG en texto (data URL). Aquí se valida, se le saca la huella SHA-256 y se arma su referencia:
// `firmas/<16 hex>-<sha256>.png` (direccionada por contenido: la huella va dentro de la referencia y la base de datos la verifica).
import { createHash } from 'node:crypto'

const MAX_BYTES = 300_000
const PREFIJO = /^data:image\/png;base64,/

export interface FirmaProcesada { bytes: Buffer; hash: string; ref: string }

export function procesarFirmaPng(dataUrl: string | undefined | null): FirmaProcesada | { error: string } {
  if (!dataUrl || !PREFIJO.test(dataUrl) || dataUrl.length < 100) return { error: 'Falta la firma del transportista en pantalla.' }
  const bytes = Buffer.from(dataUrl.replace(PREFIJO, ''), 'base64')
  if (bytes.length < 8 || bytes.subarray(0, 4).toString('hex') !== '89504e47') return { error: 'La firma no es una imagen válida. Bórrala y vuelve a firmar.' }
  if (bytes.length > MAX_BYTES) return { error: 'La firma pesa demasiado. Bórrala y vuelve a firmar con un trazo más corto.' }
  const hash = createHash('sha256').update(bytes).digest('hex')
  return { bytes, hash, ref: `firmas/${hash.slice(0, 16)}-${hash}.png` }
}

/** La huella que lleva una referencia de firma (o null si no tiene el formato). */
export const huellaDeReferencia = (ref: string | undefined | null): string | null => /^firmas\/[0-9a-f]{16}-([0-9a-f]{64})\.png$/.exec(ref ?? '')?.[1] ?? null

/** Un PNG de 1×1 píxel: la «firma» de los datos de ejemplo de la demostración y de las pruebas. */
export const FIRMA_PNG_EJEMPLO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
