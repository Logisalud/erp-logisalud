import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { TEXTO_MARCA_PILOTO } from '@/domain/modo-piloto'

/**
 * El ayudante ÚNICO de la marca de agua del piloto: estampa «PILOTO, SIN VALOR» en diagonal sobre cada página de un PDF ya generado (actas, hojas de picking, guías y paquete
 * documental, kardex, etiquetas, LS-FR.43.03, Orden de Baja…). Todo generador de PDF pasa por `marcarPiloto`; `tests/services/marca-piloto.test.ts` recorre la lista cerrada de
 * generadores y falla si alguno no lo usa.
 */
export async function sellarPiloto(pdf: Uint8Array | Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true })
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold)
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize()
    const tam = Math.max(24, Math.min(width, height) / 9)
    const ancho = fuente.widthOfTextAtSize(TEXTO_MARCA_PILOTO, tam)
    const ang = Math.atan2(height, width)            // diagonal de la hoja (de abajo a la izquierda hacia arriba a la derecha)
    const largo = Math.hypot(width, height)
    const escala = Math.min(1, (largo * 0.8) / ancho)
    const t = tam * escala, w = ancho * escala
    p.drawText(TEXTO_MARCA_PILOTO, {
      x: width / 2 - (w / 2) * Math.cos(ang) + (t / 3) * Math.sin(ang), y: height / 2 - (w / 2) * Math.sin(ang) - (t / 3) * Math.cos(ang),
      size: t, font: fuente, color: rgb(0.8, 0.1, 0.1), opacity: 0.22, rotate: degrees((ang * 180) / Math.PI),
    })
  }
  return Buffer.from(await doc.save())
}

/** Con `modo_piloto` encendido, marca el PDF; con `no` (go-live) lo devuelve tal cual. */
export async function marcarPiloto(pdf: Uint8Array | Buffer): Promise<Buffer> {
  return (await modoPilotoActivo()) ? sellarPiloto(pdf) : Buffer.from(pdf)
}
