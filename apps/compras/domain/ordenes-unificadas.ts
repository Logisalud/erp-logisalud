/**
 * Capa de UX sobre dos Bounded Contexts reales (compras.ordenes_compra y
 * servicios.ordenes_servicio) — NO los fusiona: cada uno sigue viviendo en
 * su propia tabla, con su propia máquina de estados (domain/orden-compra.ts
 * y domain/servicio.ts). Esto solo calcula, para cada estado real, qué
 * texto de "siguiente paso" y qué progreso mostrar — nunca inventa un
 * estado que no exista en el modelo.
 */

import { ESTADOS_OC, ETIQUETA_ESTADO, type EstadoOC } from './orden-compra'
import { ESTADOS_OS, ETIQUETA_ESTADO_OS, type EstadoOS } from './servicio'

export type TipoOrdenUnificada = 'mercaderia' | 'bien' | 'servicio'

export const ETIQUETA_TIPO_ORDEN: Record<TipoOrdenUnificada, string> = {
  mercaderia: 'Mercadería',
  bien: 'Bien',
  servicio: 'Servicio',
}

/** Chip de color — nunca es la única señal (siempre va con texto). */
export type ColorEstado = 'gris' | 'ambar' | 'teal' | 'verde' | 'rojo'

const COLOR_OC: Record<EstadoOC, ColorEstado> = {
  borrador: 'gris',
  enviada: 'ambar',
  confirmada: 'teal',
  parcialmente_recibida: 'teal',
  recibida_completa: 'teal',
  facturada: 'teal',
  cerrada: 'verde',
  anulada: 'rojo',
}

const COLOR_OS: Record<EstadoOS, ColorEstado> = {
  pendiente_jefe: 'ambar',
  rechazada_jefe: 'rojo',
  aprobada: 'teal',
  en_ejecucion: 'teal',
  factura_adjunta: 'ambar',
  facturada: 'ambar',
  conformada: 'teal',
  cerrada: 'verde',
  anulada: 'rojo',
}

export function colorEstadoOC(estado: EstadoOC): ColorEstado {
  return COLOR_OC[estado]
}
export function colorEstadoOS(estado: EstadoOS): ColorEstado {
  return COLOR_OS[estado]
}

/** "Solo pendientes" del visor unificado — no incluye lo ya cerrado/anulado ni lo bloqueado por rechazo. */
export function ordenPendiente(estado: EstadoOC | EstadoOS): boolean {
  return !['cerrada', 'anulada', 'rechazada_jefe'].includes(estado)
}

const SIGUIENTE_PASO_OC: Record<EstadoOC, string> = {
  borrador: 'Enviar al proveedor',
  enviada: 'Confirmar que el proveedor aceptó el pedido',
  confirmada: 'Registrar la recepción en Almacén',
  parcialmente_recibida: 'Seguir recibiendo lo que falta',
  recibida_completa: 'Registrar la factura',
  facturada: 'Esperando conformidad y pago',
  cerrada: 'Ciclo cerrado',
  anulada: 'Orden anulada',
}

const SIGUIENTE_PASO_OS: Record<EstadoOS, string> = {
  pendiente_jefe: 'Esperando la aprobación del jefe de área',
  rechazada_jefe: 'Orden rechazada por el jefe de área',
  aprobada: 'Ejecutar el servicio contratado',
  en_ejecucion: 'Subir la factura al terminar el servicio',
  factura_adjunta: 'Completar los datos de la factura (Registrar obligación)',
  facturada: 'Dar conformidad de que el servicio se cumplió',
  conformada: 'Esperando el pago',
  cerrada: 'Ciclo cerrado',
  anulada: 'Orden anulada',
}

export function siguientePasoOC(estado: EstadoOC): string {
  return SIGUIENTE_PASO_OC[estado]
}
export function siguientePasoOS(estado: EstadoOS): string {
  return SIGUIENTE_PASO_OS[estado]
}

/** Pasos del stepper — conceptuales, pero calculados 1:1 desde ESTADOS_OC real. */
export const PASOS_OC = [
  { clave: 'creada', titulo: 'Orden creada', estados: ['borrador'] as EstadoOC[] },
  { clave: 'enviada', titulo: 'Enviada al proveedor', estados: ['enviada'] as EstadoOC[] },
  { clave: 'confirmada', titulo: 'Confirmada', estados: ['confirmada'] as EstadoOC[] },
  { clave: 'recibida', titulo: 'Recepción en Almacén', estados: ['parcialmente_recibida', 'recibida_completa'] as EstadoOC[] },
  { clave: 'facturada', titulo: 'Factura registrada', estados: ['facturada'] as EstadoOC[] },
  { clave: 'cerrada', titulo: 'Cerrada', estados: ['cerrada'] as EstadoOC[] },
] as const

export const PASOS_OS = [
  { clave: 'creada', titulo: 'Orden creada', estados: ['pendiente_jefe'] as EstadoOS[] },
  { clave: 'aprobada', titulo: 'Aprobada', estados: ['aprobada', 'en_ejecucion'] as EstadoOS[] },
  { clave: 'factura_adjunta', titulo: 'Factura adjunta', estados: ['factura_adjunta'] as EstadoOS[] },
  { clave: 'facturada', titulo: 'Factura registrada', estados: ['facturada'] as EstadoOS[] },
  { clave: 'conformada', titulo: 'Conforme', estados: ['conformada'] as EstadoOS[] },
  { clave: 'cerrada', titulo: 'Cerrada', estados: ['cerrada'] as EstadoOS[] },
] as const

/** Índice del paso alcanzado (-1 si el estado es un callejón sin salida como 'anulada'/'rechazada_jefe'). */
export function pasoAlcanzadoOC(estado: EstadoOC): number {
  if (estado === 'anulada') return -1
  const ordenados: EstadoOC[] = [...ESTADOS_OC].filter((e) => e !== 'anulada')
  const posicionEstado = ordenados.indexOf(estado)
  let ultimo = -1
  PASOS_OC.forEach((paso, i) => {
    if (paso.estados.some((e) => ordenados.indexOf(e) <= posicionEstado)) ultimo = i
  })
  return ultimo
}

export function pasoAlcanzadoOS(estado: EstadoOS): number {
  if (estado === 'anulada' || estado === 'rechazada_jefe') return -1
  const ordenados: EstadoOS[] = [...ESTADOS_OS].filter((e) => e !== 'anulada' && e !== 'rechazada_jefe')
  const posicionEstado = ordenados.indexOf(estado)
  let ultimo = -1
  PASOS_OS.forEach((paso, i) => {
    if (paso.estados.some((e) => ordenados.indexOf(e) <= posicionEstado)) ultimo = i
  })
  return ultimo
}

export function etiquetaEstado(tipo: TipoOrdenUnificada, estado: string): string {
  return tipo === 'servicio' ? ETIQUETA_ESTADO_OS[estado as EstadoOS] : ETIQUETA_ESTADO[estado as EstadoOC]
}

export function colorEstadoFila(tipo: TipoOrdenUnificada, estado: string): ColorEstado {
  return tipo === 'servicio' ? colorEstadoOS(estado as EstadoOS) : colorEstadoOC(estado as EstadoOC)
}
