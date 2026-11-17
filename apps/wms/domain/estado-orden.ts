// Los estados de la Orden de Salida, como los ve el equipo (decisión de Sebas con Dirección Técnica, nov-2026): una sola orden que avanza hasta la entrega.
// Se DERIVAN de lo que el sistema ya sabe (la etapa fina, si hay guía y si el conductor entregó): no se guardan aparte, así nunca se desactualizan.
// Puro: sin Next ni Supabase.
import type { EtapaSalida, SalidaResumen } from './despacho'

export type EstadoOrden = 'CREADA' | 'EN_PICKING' | 'EN_CONFORMIDAD' | 'LISTA' | 'GUIA_ENVIADA' | 'EN_RUTA' | 'ENTREGADA' | 'NO_ENTREGADA' | 'CANCELADA'

/** Del camino normal, en orden (la leyenda y el filtro usan este orden). «Cancelada» y «No entregada» son salidas laterales. */
export const ESTADOS_ORDEN: readonly EstadoOrden[] = ['CREADA', 'EN_PICKING', 'EN_CONFORMIDAD', 'LISTA', 'GUIA_ENVIADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADA', 'CANCELADA']

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  CREADA: 'Creada', EN_PICKING: 'En picking', EN_CONFORMIDAD: 'En conformidad', LISTA: 'Lista', GUIA_ENVIADA: 'Guía electrónica enviada',
  EN_RUTA: 'En ruta', ENTREGADA: 'Entregada', NO_ENTREGADA: 'No entregada', CANCELADA: 'Cancelada',
}

/** Qué significa cada estado, en una línea, para la leyenda de la pantalla. */
export const SIGNIFICADO_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  CREADA: 'La orden existe y ya tiene el stock asignado. Todavía no se empezó a preparar.',
  EN_PICKING: 'El auxiliar saca del almacén lo que dice la orden, línea por línea.',
  EN_CONFORMIDAD: 'Terminó el picking. Otra persona revisa cada línea (lote y cantidad) y cuenta los bultos.',
  LISTA: 'Conformidad completa y guía asignada: ya se descarga la Orden de Salida. Falta ruta, vehículo y conductor para enviar la guía.',
  GUIA_ENVIADA: 'Con ruta, vehículo y conductor, la guía se envió a Nubefact con el número asignado (TTT1-…). Es la guía oficial.',
  EN_RUTA: 'La unidad salió y el stock bajó del almacén. El conductor marca cada parada.',
  ENTREGADA: 'El conductor marcó «Entregado» con nombre y DNI de quien recibió, y foto.',
  NO_ENTREGADA: 'No se pudo entregar (cliente ausente, rechazo…). El motivo queda registrado.',
  CANCELADA: 'La orden ya no sale. Se libera el stock y, si había guía asignada sin enviar, su número.',
}

/** Quién hace avanzar la orden desde ese estado (para la leyenda). */
export const QUIEN_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  CREADA: 'Jefe de Transporte', EN_PICKING: 'Auxiliar de almacén', EN_CONFORMIDAD: 'Asistente de Dirección Técnica', LISTA: 'Jefe de Transporte (ruta y envío)',
  GUIA_ENVIADA: 'Jefe de Transporte (carga y salida)', EN_RUTA: 'Conductor', ENTREGADA: 'Terminada', NO_ENTREGADA: 'Jefe de Transporte (reprogramar)', CANCELADA: 'Terminada',
}

export type DatosEstadoOrden = Pick<SalidaResumen, 'etapa'> & Partial<Pick<SalidaResumen, 'tipo' | 'resultadoEntrega'>>

const DE_ETAPA: Record<EtapaSalida, EstadoOrden> = {
  SIN_STOCK: 'CREADA', ASIGNADA: 'CREADA',
  EN_PICKING: 'EN_PICKING', CON_DISCREPANCIA: 'EN_PICKING', POR_DEVOLVER_PICKING: 'EN_PICKING',
  PENDIENTE_CONFORMIDAD: 'EN_CONFORMIDAD', OBSERVADA: 'EN_CONFORMIDAD',
  // después de la conformidad: «Lista» hasta que la guía se envía. Las etapas con la guía ya registrada (documentación completa, lista para carga, cargada) son «Guía electrónica enviada».
  CONFORME: 'LISTA', EMBALADA: 'LISTA',
  DOCUMENTACION_COMPLETA: 'GUIA_ENVIADA', LISTA_PARA_CARGA: 'GUIA_ENVIADA', CARGADA: 'GUIA_ENVIADA',
  CONFIRMADA: 'EN_RUTA', ENTREGADA_AL_TRANSPORTISTA: 'ENTREGADA',
  CANCELADA: 'CANCELADA',
}

export function estadoDeOrden(s: DatosEstadoOrden): EstadoOrden {
  const base = DE_ETAPA[s.etapa]
  if (base === 'EN_RUTA') return s.resultadoEntrega === 'ENTREGADA' ? 'ENTREGADA' : s.resultadoEntrega === 'NO_ENTREGADA' ? 'NO_ENTREGADA' : 'EN_RUTA'
  return base
}

/**
 * El texto del estado de ESTA orden: casi siempre el de la tabla; en una orden por cuenta de un cliente de almacenamiento (tipo B) no hay guía electrónica del WMS
 * (el cliente trae su propia guía) ni ruta de Logisalud: el texto lo dice con sus palabras.
 */
export function etiquetaEstadoOrden(s: DatosEstadoOrden): string {
  const e = estadoDeOrden(s)
  if (s.tipo === 'CLIENTE') {
    if (e === 'GUIA_ENVIADA') return 'Guía del cliente registrada'
    if (e === 'ENTREGADA') return 'Entregada al transportista'
  }
  return ETIQUETA_ESTADO_ORDEN[e]
}
