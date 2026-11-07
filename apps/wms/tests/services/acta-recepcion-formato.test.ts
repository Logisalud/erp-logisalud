// Acta de Recepción: el PDF es el formato oficial LS-FR.03.05 (calcado del .docx), no una reinterpretación.
// Se comprueba que estén TODOS los textos del formato y en su orden: encabezado, datos generales, productos, verificación y firmas, y el pie.
import { inflateSync } from 'node:zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositorioDemo } from '@/services/demo/repositorio-demo'
import { renderActaRecepcion } from '@/services/pdf/acta-recepcion'

let repo: RepositorioDemo
beforeEach(() => { ;(globalThis as { __wmsDemo?: unknown }).__wmsDemo = undefined; repo = new RepositorioDemo() })

function textoDelPdf(pdf: Buffer): string {
  const bytes = pdf.toString('latin1'); const partes: string[] = []
  for (const m of bytes.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string
    try { contenido = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { continue }
    for (const t of contenido.matchAll(/\[((?:<[0-9a-fA-F]*>|\([^)]*\)|-?[\d.]+|\s)*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj/g)) {
      const hex = (h: string) => h.match(/../g)?.map((x) => String.fromCharCode(parseInt(x, 16))).join('') ?? ''
      if (t[1] !== undefined) partes.push([...t[1].matchAll(/<([0-9a-fA-F]*)>|\(([^)]*)\)/g)].map((x) => (x[1] !== undefined ? hex(x[1]) : x[2])).join(''))
      else partes.push(t[2] !== undefined ? hex(t[2]) : t[3])
    }
  }
  return partes.join('\n')
}
async function actaFirmada() {
  for (const x of await repo.listarSolicitudes()) { const a = (await repo.obtenerSolicitud(x.id))!.actas.find((y) => y.estado === 'FIRMADA'); if (a) return a }
  throw new Error('la demo no trae un acta firmada')
}

/** Textos del .docx LS-FR.03.05, en el orden en que aparecen de arriba abajo. */
const FORMATO = [
  'ACTA DE RECEPCIÓN DE PRODUCTOS', 'Cod. POE', 'LS-POE.03.05', 'Cod. Formato', 'LS-FR.03.05', 'Fecha de vigencia: Desde  01-09-2026  hasta  01-09-2028',
  'DATOS GENERALES', 'CUMPLIMIENTO DOCUMENTARIO', 'TIPO DE INGRESO', 'ACTA',
  'CLIENTE', 'DUA', 'IMPORTACIÓN', 'PROVEEDOR', 'GUÍA REMISIÓN', 'COMPRA LOCAL', 'FECHA', 'FACTURA', 'DEVOLUCIÓN', 'MOTIVO', 'OTROS',
  'DESCRIPCIÓN DEL PRODUCTO', 'R.S.', 'LOTE', 'F. EXPIRA', 'CANTIDAD ESTABLECIDA', 'CANTIDAD RECIBIDA', 'BULTOS', 'PALETAS', 'OBSERVACIONES',
  'VERIFICACIÓN DEL ESTADO DEL PRODUCTO', 'CONFORME', 'TIPO DE CONTEO', 'VEHÍCULO DE TRANSPORTE', 'SÍ', 'NO',
  'CANTIDAD RECIBIDA (CANTIDAD DE CAJAS Y CANTIDAD DE UNIDADES CORRESPONDE A INDICADO EN EL DOCUMENTO)', 'CONTEO POR MUESTREO', 'PLACA:',
  'EL MATERIAL DE EMBALAJE SE ENCUENTRA SUCIO, ARRUGADO, HUMEDAD, DETERIORADO', 'CONTEO AL 100%', 'MARCA:',
  'LAS CAJAS SE ENCUENTRAN DEBIDAMENTE SELLADAS', 'OTROS', 'T°',
  'JEFE DE ALMACÉN', 'DIRECCIÓN TÉCNICA', 'TRANSPORTISTA', 'NOMBRE:', 'FIRMA', 'FECHA:', 'HORA INICIO:', 'HORA FINAL:', 'RESPONSABLE DE CONTEO:',
  'Este documento no puede ser reproducido ni fotocopiado sin autorización de LOGISSA S.A.C.',
]

describe('Acta de Recepción · formato LS-FR.03.05', () => {
  it('trae todos los textos del formato oficial y en su orden', async () => {
    // Un texto largo puede partirse en líneas dentro de su celda (como en el .docx): se comparan las palabras seguidas, pero una palabra cortada a la mitad sí falla.
    const texto = textoDelPdf(await renderActaRecepcion(await actaFirmada())).replace(/\s+/g, ' ')
    let desde = 0
    for (const t0 of FORMATO) {
      const t = t0.replace(/\s+/g, ' ')
      const pos = texto.indexOf(t, desde)
      expect(pos, `falta o está fuera de orden: «${t}»`).toBeGreaterThanOrEqual(0)
      desde = pos + t.length
    }
  })
  it('ya no trae lo que el formato no tiene: columna «POSICIÓN» ni «CANT. SOLICITUD» ni el título «TIPO DE INGRESO» con casillas inventadas', async () => {
    const texto = textoDelPdf(await renderActaRecepcion(await actaFirmada()))
    expect(texto).not.toContain('CANT. SOLICITUD')
    expect(texto).not.toContain('POSICIÓN')
    expect(texto).not.toContain('PROPIETARIO DEL STOCK')
  })
})
