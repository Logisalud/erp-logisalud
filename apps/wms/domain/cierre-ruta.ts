// Cierre de ruta (OS-7), impresión y escaneo firmado del LS-FR.43.03. Puro: lo usan la demo, las acciones y las pantallas. La base de datos
// (`wms.cerrar_ruta`, `wms.corregir_cierre_ruta`, `wms.registrar_impresion_ls_fr`, `wms.subir_escaneo_ls_fr`, migración 0027) aplica las mismas reglas y es la que manda.
import { puede } from './permisos'
import type { EstadoRuta } from './rutas'
import type { Rol } from './tipos'

/** Solo el Jefe de Transporte cierra la ruta. */
export const puedeCerrarRuta = (roles: readonly Rol[]) => puede(roles, 'cerrar_ruta')
/** Imprimir la copia que viaja con el conductor y subir el escaneo firmado: Transporte, Almacén y Dirección Técnica (y su asistente). */
export const puedeRegistrarLsFr = (roles: readonly Rol[]) => puede(roles, 'registrar_ls_fr')

/** La ruta se cierra cuando ya salió (salida confirmada) o espera su cierre. */
export const ESTADOS_QUE_SE_CIERRAN: readonly EstadoRuta[] = ['EN_RUTA', 'PENDIENTE_CIERRE']
/** El escaneo firmado se sube desde que la unidad se libera. */
export const ESTADOS_CON_ESCANEO: readonly EstadoRuta[] = ['LIBERADA', 'EN_RUTA', 'PENDIENTE_CIERRE', 'CERRADA']

export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024
/** El data logger entrega su archivo en el formato que ya le pasará Sebas a este sistema: se guarda tal cual, sin leerlo, cualquiera sea su tipo. */
export const TEMPERATURA_MINIMA_POSIBLE = -50
export const TEMPERATURA_MAXIMA_POSIBLE = 80

export interface Adjunto { nombre: string; bytes: number }

function validarTamano(a: Adjunto): string | null {
  if (!a.nombre.trim() || a.bytes <= 0) return 'El archivo está vacío.'
  if (a.bytes > MAX_BYTES_ADJUNTO) return 'El archivo pesa más de 10 MB.'
  return null
}

/** El archivo que descargas del data logger (Elitech RC-61): lo que sea, hasta 10 MB; se guarda tal cual. */
export const validarArchivoLogger = (a: Adjunto): string | null => validarTamano(a)

/** El formato firmado, escaneado: PDF o foto. */
export function validarEscaneo(a: Adjunto): string | null {
  const t = validarTamano(a)
  if (t) return t
  if (!/\.(pdf|png|jpe?g)$/i.test(a.nombre)) return 'El escaneo debe ser un PDF o una foto (PDF, JPG o PNG).'
  return null
}

export interface DatosCierre { tempMin?: number | null; tempMax?: number | null }

/** Los errores por campo del cierre (mismos textos que la base de datos). Vacío = vale. */
export function validarCierre(d: DatosCierre): Record<string, string> {
  const e: Record<string, string> = {}
  const { tempMin: min, tempMax: max } = d
  if (min == null || max == null || Number.isNaN(min) || Number.isNaN(max)) {
    if (min == null || Number.isNaN(min)) e.tempMin = 'Escribe la temperatura mínima que marcó el data logger.'
    if (max == null || Number.isNaN(max)) e.tempMax = 'Escribe la temperatura máxima que marcó el data logger.'
    return e
  }
  if (min < TEMPERATURA_MINIMA_POSIBLE) e.tempMin = `Revisa la mínima: el data logger no marca valores tan lejanos (entre ${TEMPERATURA_MINIMA_POSIBLE} y ${TEMPERATURA_MAXIMA_POSIBLE} °C).`
  if (max > TEMPERATURA_MAXIMA_POSIBLE) e.tempMax = `Revisa la máxima: el data logger no marca valores tan lejanos (entre ${TEMPERATURA_MINIMA_POSIBLE} y ${TEMPERATURA_MAXIMA_POSIBLE} °C).`
  if (!e.tempMin && !e.tempMax && min > max) e.tempMin = 'La temperatura mínima no puede ser mayor que la máxima.'
  return e
}

/** «17,5» o «17.5» → 17.5; vacío o texto → null. */
export function leerTemperatura(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t) * 10) / 10
}

/** Motivo por el que una ruta todavía no se puede cerrar (vacío = se puede). */
export function motivoNoSeCierra(estado: EstadoRuta): string | null {
  if (estado === 'CERRADA') return 'La ruta ya está cerrada.'
  if (!ESTADOS_QUE_SE_CIERRAN.includes(estado)) return 'La ruta todavía no salió: se cierra cuando la salida está confirmada.'
  return null
}

export function motivoNoSeEscanea(estado: EstadoRuta): string | null {
  return ESTADOS_CON_ESCANEO.includes(estado) ? null : 'El escaneo firmado se sube cuando la unidad ya fue liberada.'
}

export const tamanoLegible = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
