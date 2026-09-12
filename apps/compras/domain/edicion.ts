/**
 * Quién puede editar un registro, y hasta cuándo. Puro: sin Next, sin
 * Supabase.
 *
 * La regla, decidida el 2026-09-12, es una sola y vale para los cuatro
 * flujos (OS, Pago Directo, Anticipo, Reembolso):
 *
 *   Editar está permitido para CUALQUIERA con acceso al sistema, pero
 *   ÚNICAMENTE mientras la autoridad correspondiente no haya decidido. Una
 *   vez que hay aprobación o rechazo no edita nadie — tampoco
 *   Administración. A partir de ahí los caminos son los que ya existen:
 *   Rechazar, Anular, o un ajuste aparte si ya está pagado.
 *
 * Es DISTINTA de la regla de Anular, que sí restringe a creador + autoridad
 * (ver domain/auto-aprobacion.ts). La diferencia es deliberada: mientras
 * nadie decidió nada, corregir un dato mal tipeado no le saca nada a nadie,
 * y exigir que sea justo el creador quien esté disponible es lo que hoy
 * obliga a anular y volver a cargar todo de cero.
 *
 * Por eso acá no hay ninguna función que reciba un perfil: la única
 * pregunta es el ESTADO. Si mañana la regla se restringe, este archivo es
 * el único lugar donde cambiarla.
 */

import type { EstadoObligacion } from './obligacion'
import type { EstadoOS } from './servicio'
import type { EstadoSolicitud } from './gasto'

/**
 * Una OS se edita mientras espera al jefe de área. Apenas él aprueba o
 * rechaza, se congela: 'aprobada' ya autorizó un gasto contra un proveedor
 * y cambiarle el monto por atrás sería aprobar una cosa y ejecutar otra.
 */
const ESTADOS_OS_EDITABLES: readonly EstadoOS[] = ['pendiente_jefe']

export function puedeEditarseOS(estado: EstadoOS): boolean {
  return ESTADOS_OS_EDITABLES.includes(estado)
}

/**
 * Un Pago Directo se edita mientras Contabilidad no le dio conformidad ni
 * lo rechazó. `pendiente_factura` entra: es un registro hecho con una
 * cotización, todavía más provisorio que uno con factura.
 *
 * Misma ventana que anular, y no es casualidad: las dos preguntas son "¿ya
 * decidió Contabilidad?". Se declaran por separado igual, para que
 * restringir una mañana no mueva la otra sin que nadie lo note.
 */
const ESTADOS_OBLIGACION_EDITABLES: readonly EstadoObligacion[] = ['pendiente_factura', 'registrada']

export function puedeEditarseObligacion(estado: EstadoObligacion): boolean {
  return ESTADOS_OBLIGACION_EDITABLES.includes(estado)
}

/**
 * Un anticipo o un reembolso se editan mientras la solicitud espera una
 * decisión. Nacen en 'pendiente_contabilidad' (ver ESTADO_INICIAL_SOLICITUD),
 * y 'pendiente_jefe' se incluye por las solicitudes viejas que todavía
 * pasaban por el jefe antes de la Pieza A.
 */
const ESTADOS_SOLICITUD_EDITABLES: readonly EstadoSolicitud[] = [
  'pendiente_jefe',
  'pendiente_contabilidad',
]

export function puedeEditarseSolicitud(estado: EstadoSolicitud): boolean {
  return ESTADOS_SOLICITUD_EDITABLES.includes(estado)
}

/** El mensaje cuando alguien intenta editar algo ya decidido — por la URL
 * directa, o con la pantalla vieja abierta en otra pestaña. */
export const ERROR_EDITAR_TARDE =
  'Ya no se puede editar: alguien con autoridad ya lo aprobó o lo rechazó. ' +
  'Si hay algo mal, corresponde anularlo o rechazarlo, no cambiarlo por atrás.'

/**
 * El aviso por correo se manda SOLO si cambió el monto.
 *
 * Un monto distinto cambia qué se está autorizando, y quien recibió el
 * aviso original necesita enterarse. Corregir un typo en la descripción o
 * la fecha en que se necesita la plata, no: un correo por cada corrección
 * menor entrena a ignorar todos los correos, incluido el que sí importa.
 */
export function cambioExigeAviso(montoAntes: number, montoDespues: number): boolean {
  return redondeoCentavos(montoAntes) !== redondeoCentavos(montoDespues)
}

function redondeoCentavos(n: number): number {
  return Math.round(n * 100)
}

/** "Editado por Mariela Casiano el 12/09/2026 14:30" — el rastro de la ficha. */
export function etiquetaEdicion(nombre: string | null, cuandoISO: string | null): string | null {
  if (!cuandoISO) return null
  const fecha = new Date(cuandoISO)
  const cuando = fecha.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return `Editado por ${nombre ?? 'alguien del ERP'} el ${cuando}`
}
