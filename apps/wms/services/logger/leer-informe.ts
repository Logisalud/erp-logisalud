import 'server-only'
import { MENSAJE_NO_SE_LEYO, parsearCsv, parsearInformeTexto, tipoDeInforme, type ResultadoLectura } from '@/domain/data-logger'
import { textoDePdf } from './leer-pdf'

/** Lee el informe del data logger (PDF o CSV del Elitech RC-61) según el tipo de archivo. Nunca lanza: si no se puede leer, devuelve el motivo en palabras. */
export function leerInforme(nombre: string, tipoMime: string | undefined, bytes: Buffer): ResultadoLectura {
  const tipo = tipoDeInforme(nombre, tipoMime)
  if (!tipo) return { ok: false, mensaje: 'Ese tipo de archivo no se lee desde aquí: sube el informe del RC-61 en PDF o CSV, o anota la mínima y la máxima a mano.' }
  if (tipo === 'CSV') return parsearCsv(bytes.toString('utf8'))
  const texto = textoDePdf(bytes)
  return texto ? parsearInformeTexto(texto) : { ok: false, mensaje: `No pudimos abrir ese PDF. ${MENSAJE_NO_SE_LEYO}` }
}
