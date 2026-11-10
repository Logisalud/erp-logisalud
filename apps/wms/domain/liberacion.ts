// Liberación de productos (LS-POE.04.05, DT 2026-10-17). El WMS REEMPLAZA el LS-FR.04 «Control de Status de los productos»: cada cambio de estado
// sanitario queda con su sustento (acta o dictamen), quién y cuándo en la historia del lote.
//
//  · Productos de Logissa: Sandra hace la evaluación organoléptica y Katia emite el dictamen (como hoy). Una OBSERVACIÓN REVERSIBLE deja el producto en
//    Cuarentena hasta la disposición final de Dirección Técnica.
//  · Productos de clientes de almacenamiento: libera el DT DEL CLIENTE. Hasta tener los accesos de clientes (SEC1; el interruptor `acceso_clientes_habilitado`
//    sigue apagado y no existe ningún usuario de cliente), Sandra o Katia REGISTRAN su dictamen —adjuntan el documento que llegó por correo, con las
//    cantidades liberadas y rechazadas— y confirman el cambio de estado. Después (SEC1), el rol «DT de cliente», ligado a su propietario, podrá liberar o
//    rechazar el stock de su propietario con ese único permiso. Hoy está declarado pero DESHABILITADO.
import { puede } from './permisos'
import type { Rol } from './tipos'

export const AYUDA_LIBERACION_LOGISSA = 'Los productos de Logissa los evalúa Sandra y los libera Katia. Si algo se puede corregir, queda Observado: el producto sigue en Cuarentena hasta la disposición final de Dirección Técnica.'
export const AYUDA_LIBERACION_CLIENTE = 'Este producto es de un cliente de almacenamiento: lo libera el Director Técnico del cliente, no Logissa. Registra aquí su dictamen (adjunta el documento que llegó por correo, con las cantidades liberadas y rechazadas) y confirma el cambio de estado.'

export const puedeRegistrarDictamenCliente = (roles: readonly Rol[]) => puede(roles, 'registrar_dictamen_cliente')
export const puedeMarcarAntecedentes = (roles: readonly Rol[]) => puede(roles, 'marcar_antecedentes_calidad')
/** La observación reversible de un producto de Logissa la deja Dirección Técnica (Katia); en un producto de cliente, Sandra o Katia la registran por el DT del cliente. */
export const puedeObservar = (roles: readonly Rol[], esDeCliente: boolean) => esDeCliente ? puedeRegistrarDictamenCliente(roles) : roles.includes('direccion_tecnica')

export type EstadoDictamen = 'REGISTRADO' | 'CONFIRMADO' | 'ANULADO'
export const ETIQUETA_ESTADO_DICTAMEN: Record<EstadoDictamen, string> = { REGISTRADO: 'Por confirmar', CONFIRMADO: 'Confirmado', ANULADO: 'Anulado' }

/** El dictamen del DT del cliente tal como lo registró el personal (con su documento) o, con SEC1, el propio DT del cliente. */
export interface DictamenClienteVista {
  id: string
  actaId: string
  estado: EstadoDictamen
  /** `PERSONAL`: lo registró Sandra o Katia con el documento recibido; `DT_CLIENTE`: lo dictaminó el rol «DT de cliente» (SEC1). */
  via: 'PERSONAL' | 'DT_CLIENTE'
  liberada: number
  rechazada: number
  /** Fecha del documento del DT del cliente. */
  fechaDictamen?: string
  observacion?: string
  documentoNombre?: string
  documentoRef?: string
  documentoHash?: string
  registradoPor: string
  registradoEn: string
  confirmadoPor?: string
  confirmadoEn?: string
  anuladoPor?: string
  anuladoEn?: string
  motivoAnulacion?: string
}

export const dictamenPorConfirmar = (d: DictamenClienteVista) => d.estado === 'REGISTRADO'

/** Una observación reversible de un acta: el producto sigue en Cuarentena hasta la disposición final. */
export interface ObservacionVista {
  id: string
  actaId: string
  texto: string
  registradaPor: string
  registradaEn: string
  /** Se cierra al levantarla o con la disposición final (aprobar o rechazar). */
  cerradaEn?: string
  cerradaPor?: string
  nota?: string
}
export const observacionVigente = (o: ObservacionVista) => !o.cerradaEn

export const TIPOS_DOCUMENTO_DICTAMEN = ['application/pdf', 'image/png', 'image/jpeg'] as const
export const MAX_BYTES_DICTAMEN = 10 * 1024 * 1024

/** El documento del DT del cliente: PDF o imagen de hasta 10 MB. */
export function validarDocumentoDictamen(f: { name: string; type: string; size: number } | null | undefined): string | null {
  if (!f || !f.size) return 'Adjunta el documento del dictamen que llegó por correo (PDF o imagen).'
  if (!(TIPOS_DOCUMENTO_DICTAMEN as readonly string[]).includes(f.type)) return 'El documento tiene que ser un PDF o una imagen (PNG o JPG).'
  if (f.size > MAX_BYTES_DICTAMEN) return 'El documento pesa más de 10 MB: reduce su tamaño y vuelve a subirlo.'
  return null
}

export interface DatosDictamen {
  liberada: number | string
  rechazada: number | string
  fechaDictamen?: string
  observacion?: string
}

/**
 * Las cantidades del dictamen contra lo que espera decisión (unidades de ese lote que siguen en Cuarentena). Puede cubrir solo una parte (el resto sigue
 * esperando otro dictamen), pero nunca más de lo que hay ni cero.
 */
export function validarDictamenCliente(d: DatosDictamen, pendiente: number): { ok: true; liberada: number; rechazada: number } | { ok: false; mensaje: string; errores: Record<string, string> } {
  const errores: Record<string, string> = {}
  const num = (v: number | string) => (String(v).trim() === '' ? 0 : Number(String(v).replace(/\s/g, '')))
  const lib = num(d.liberada); const rec = num(d.rechazada)
  if (!Number.isInteger(lib) || lib < 0) errores.liberada = 'Escribe un número entero (0 si no liberó ninguna).'
  if (!Number.isInteger(rec) || rec < 0) errores.rechazada = 'Escribe un número entero (0 si no rechazó ninguna).'
  if (!errores.liberada && !errores.rechazada) {
    if (lib + rec === 0) errores.liberada = 'El dictamen tiene que liberar o rechazar al menos una unidad.'
    else if (lib + rec > pendiente) errores.liberada = `Liberadas y rechazadas suman ${lib + rec}, pero solo hay ${pendiente} unidades esperando decisión.`
  }
  if (!d.fechaDictamen?.trim()) errores.fechaDictamen = 'Escribe la fecha del dictamen (la del documento que recibiste).'
  const claves = Object.keys(errores)
  return claves.length ? { ok: false, mensaje: errores[claves[0]], errores } : { ok: true, liberada: lib, rechazada: rec }
}

/** La decisión con la que queda firmada el acta cuando todo el lote ya tiene dictamen: Aprobado si se liberó algo; si no, Bajas/Rechazados. */
export const decisionTrasDictamenes = (liberadas: number): 'APROBADO' | 'BAJAS_RECHAZADOS' => (liberadas > 0 ? 'APROBADO' : 'BAJAS_RECHAZADOS')

/** D-169: una sola persona, sin segunda firma. Quien registra el dictamen lo confirma él mismo. */
export const textoTrasRegistrarDictamen = (_registro?: 'asistente_dt' | 'direccion_tecnica') =>
  'Dictamen registrado. Siguiente: confirma el cambio de estado (lo confirmas tú; no hace falta una segunda firma).'
