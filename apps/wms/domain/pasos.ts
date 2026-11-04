// «¿Qué tengo que hacer ahora?»: el camino de una Orden de Salida y de un ingreso en pasos, con quién hace el siguiente y un botón directo (OS-4).
// Puro: lo usan la ficha de la orden, la lista, «Mis tareas» de Inicio y la prueba que exige que toda etapa tenga siguiente paso y responsable.
import type { EstadoSolicitud } from './entradas'
import type { EtapaSalida } from './despacho'
import type { TipoSalida } from './salidas'
import type { Rol } from './tipos'

export type EstadoPaso = 'HECHO' | 'ACTUAL' | 'PENDIENTE'
export interface Paso { clave: string; etiqueta: string; estado: EstadoPaso }

/** Quién hace el siguiente paso: los roles que pueden y el nombre que se ve en pantalla. */
export interface Responsable {
  roles: readonly Rol[]
  etiqueta: string
  /** Quien decide no es del WMS (el vendedor del pedido decide en Pedidos): no tiene rol aquí y no aparece en «Mis tareas». */
  externo?: boolean
}
export interface SiguientePaso {
  /** Lo que hay que hacer, en una frase con verbo. */
  texto: string
  responsable: Responsable
  /** Dónde se hace. Sin enlace cuando no hay nada más que hacer. */
  href?: string
  boton?: string
  /** Terminada: no queda nada pendiente. */
  fin?: boolean
}
export interface Avance { pasos: Paso[]; siguiente: SiguientePaso }

const R = {
  jefeTransporte: { roles: ['jefe_transporte'], etiqueta: 'Jefe de Transporte' },
  picker: { roles: ['auxiliar', 'jefe_almacen', 'jefe_transporte'], etiqueta: 'quien hace el picking (auxiliar)' },
  conformidad: { roles: ['conformidad_despacho', 'asistente_dt'], etiqueta: 'Conformidad de Despacho (otra persona, no quien pickeó)' },
  documentos: { roles: ['jefe_transporte', 'asistente_dt', 'direccion_tecnica'], etiqueta: 'Jefe de Transporte o asistente de Dirección Técnica' },
  embalaje: { roles: ['auxiliar', 'jefe_almacen', 'jefe_transporte'], etiqueta: 'auxiliar de almacén' },
  carga: { roles: ['auxiliar', 'jefe_almacen', 'jefe_transporte'], etiqueta: 'auxiliar de almacén o Jefe de Transporte' },
  dt: { roles: ['direccion_tecnica', 'asistente_dt'], etiqueta: 'Dirección Técnica o su asistente' },
  devuelve: { roles: ['auxiliar', 'jefe_almacen'], etiqueta: 'auxiliar de almacén (y otra persona lo verifica)' },
  verificaDevolucion: { roles: ['auxiliar', 'jefe_almacen'], etiqueta: 'otra persona de almacén (no quien devolvió)' },
  /** SA-6: el tipo B se entrega al transportista del cliente (no va en ruta de Logisalud). */
  entregaCliente: { roles: ['jefe_transporte', 'jefe_almacen'], etiqueta: 'Jefe de Transporte o Jefe de Almacén' },
  nadie: { roles: [], etiqueta: 'nadie: no queda nada pendiente' },
} satisfies Record<string, Responsable>

/** El vendedor del pedido: decide con el cliente, en Pedidos. No es un rol del WMS (SA-3, D-124). Sin nombre conocido se dice «el vendedor del pedido». */
export const responsableVendedor = (nombre?: string): Responsable => ({ roles: [], etiqueta: nombre?.trim() ? `Vendedor ${nombre.trim()}` : 'Vendedor del pedido', externo: true })

const ORDEN_SALIDA = [
  ['stock', 'Stock asignado'], ['picking', 'Picking'], ['conformidad', 'Conformidad'], ['documentos', 'Guía y documentos'],
  ['embalaje', 'Embalaje'], ['carga', 'Carga'], ['salida', 'Salida confirmada'],
] as const

/** Una orden por cuenta de un cliente (B): sin guía del WMS ni carga: la GRE es la del cliente y la salida es la entrega a su transportista (SA-6). */
const ORDEN_SALIDA_B = [
  ['stock', 'Stock asignado'], ['picking', 'Picking'], ['conformidad', 'Conformidad'], ['documentos', 'GRE del cliente y documentos'],
  ['embalaje', 'Embalaje'], ['entrega', 'Entrega al transportista del cliente'],
] as const

/** Cuántos pasos de ORDEN_SALIDA ya están hechos en cada etapa. */
const HECHOS: Record<EtapaSalida, number> = {
  SIN_STOCK: 0, ASIGNADA: 1, EN_PICKING: 1, CON_DISCREPANCIA: 1, PENDIENTE_CONFORMIDAD: 2, OBSERVADA: 2,
  CONFORME: 3, DOCUMENTACION_COMPLETA: 3, EMBALADA: 3, LISTA_PARA_CARGA: 5, CARGADA: 6, CONFIRMADA: 7, CANCELADA: 0, POR_DEVOLVER_PICKING: 1, ENTREGADA_AL_TRANSPORTISTA: 7,
}

export interface ExtrasSalida {
  /** Pedido a Lima: no se embala. */
  sinEmbalaje?: boolean
  /** La guía se envió pero SUNAT todavía no responde. */
  guiaEnEspera?: boolean
  /** Falta la guía (con la conformidad completa). */
  sinGuia?: boolean
  /** D-191: la orden ya salió, su guía se anuló y no hay otra vigente: el stock no se toca y falta emitir la guía nueva. */
  faltaGuiaVigente?: boolean
  /** SA-2: orden por cuenta de un cliente (tipo B): no lleva guía del WMS, se registra la GRE que trae el cliente. */
  tipo?: TipoSalida
  /** SA-2: salida por destrucción: el stock sale de Bajas, no se asigna desde los racks. */
  destruccion?: boolean
  /** Con falta de stock decide el vendedor del pedido; este es su nombre (dato `vendedor` del snapshot de Pedidos). Sin nombre se dice «el vendedor del pedido». */
  vendedor?: string
  /** Una orden que no nace de un pedido (muestra de Logissa, tipo B/C, manual sin pedido) no tiene vendedor: el faltante lo resuelve el Jefe de Transporte. */
  sinPedido?: boolean
  /** SA-6: la orden todavía no está en una ruta de Logisalud (la guía toma vehículo, conductor y fecha de la ruta). No aplica al tipo B. Sin dato (undefined) no se dice nada. */
  sinRuta?: boolean
  /** SA-6: orden manual (A o C): «Ruta planificada» se muestra como un paso más de la lista. */
  porRuta?: boolean
  /** Por devolver lo picado: si el auxiliar todavía no lo devolvió o ya lo devolvió y falta que otra persona lo verifique. */
  devolucion?: 'POR_EJECUTAR' | 'POR_VERIFICAR'
  /** Dónde se hace la devolución (el movimiento interno enlazado), si ya existe. */
  devolucionHref?: string
}

const pasosDe = <T extends readonly (readonly [string, string])[]>(lista: T, hechos: number, terminada = false): Paso[] =>
  lista.map(([clave, etiqueta], i) => ({ clave, etiqueta, estado: terminada || i < hechos ? 'HECHO' : i === hechos ? 'ACTUAL' : 'PENDIENTE' }))

const siguientePlanificarRuta = (): SiguientePaso => ({ texto: 'Planificar la ruta de Logisalud: la guía y la carga toman el vehículo, el conductor y la fecha de la ruta', responsable: R.jefeTransporte, href: '/rutas', boton: 'Planificar la ruta' })
const siguienteEntregaCliente = (id: string): SiguientePaso => ({
  texto: 'Entregar la mercadería al transportista del cliente: anota quién la recoge, la hora y quién entrega por el almacén; ahí baja el stock',
  responsable: R.entregaCliente, href: `/salidas/${id}#entrega-transportista`, boton: 'Registrar la entrega',
})

/** El siguiente paso de cada etapa de una Orden de Salida. `id` es el de la orden para armar el enlace. */
function siguienteDeSalida(etapa: EtapaSalida, id: string, x: ExtrasSalida): SiguientePaso {
  switch (etapa) {
    case 'SIN_STOCK':
      if (x.destruccion) return { texto: 'Preparar la destrucción desde Bajas: se retira del área de Bajas lo que el cliente indicó en su guía', responsable: R.jefeTransporte, href: `/salidas/${id}`, boton: 'Ver la orden' }
      // Con falta de stock decide el VENDEDOR con el cliente, en Pedidos: quitar o reducir lo que falta, o cancelar el pedido. El Jefe de Transporte lo ve, no cambia cantidades.
      // Sin pedido detrás (muestra, por cuenta de un cliente, manual sin pedido en la bandeja) no hay vendedor: lo resuelve el Jefe de Transporte.
      if (x.sinPedido ?? (x.tipo !== undefined && x.tipo !== 'DISTRIBUCION')) return { texto: 'Esperar stock o cambiar la cantidad de la orden: no hay stock suficiente', responsable: R.jefeTransporte, href: `/salidas/${id}`, boton: 'Ver la orden' }
      return { texto: `el vendedor ${x.vendedor?.trim() || 'del pedido'} decide con el cliente si se quita lo que falta o se cancela el pedido`, responsable: responsableVendedor(x.vendedor), href: `/salidas/${id}#falta-stock`, boton: 'Ver por qué falta y copiar el aviso' }
    case 'POR_DEVOLVER_PICKING': return x.devolucion === 'POR_VERIFICAR'
      ? { texto: 'otra persona verifica que lo picado volvió a su ubicación (no quien lo devolvió)', responsable: R.verificaDevolucion, href: x.devolucionHref ?? `/salidas/${id}`, boton: 'Verificar la devolución' }
      : { texto: 'el auxiliar devuelve lo picado a su ubicación y otra persona lo verifica', responsable: R.devuelve, href: x.devolucionHref ?? `/salidas/${id}`, boton: 'Devolver lo picado' }
    case 'ASIGNADA': return { texto: 'Designar a quien hace el picking y generar la hoja de picking', responsable: R.jefeTransporte, href: `/salidas/${id}`, boton: 'Generar el picking' }
    case 'EN_PICKING': return { texto: 'Hacer el picking siguiendo el recorrido de la hoja', responsable: R.picker, href: `/picking/${id}`, boton: 'Ir al picking' }
    case 'CON_DISCREPANCIA': return { texto: 'Resolver la discrepancia del picking: elegir el lote de reemplazo o ajustar la cantidad', responsable: R.jefeTransporte, href: `/salidas/${id}`, boton: 'Resolver la discrepancia' }
    case 'PENDIENTE_CONFORMIDAD': return { texto: 'Dar la conformidad de lo pickeado y contar los bultos', responsable: R.conformidad, href: `/conformidad/${id}`, boton: 'Ir a la conformidad' }
    case 'OBSERVADA': return { texto: 'Atender la observación de la conformidad (cantidad, lote o daño)', responsable: R.jefeTransporte, href: `/conformidad/${id}`, boton: 'Ver la observación' }
    case 'CONFORME': case 'EMBALADA': case 'DOCUMENTACION_COMPLETA': {
      if (x.sinRuta && x.tipo !== 'CLIENTE' && !x.guiaEnEspera && etapa !== 'DOCUMENTACION_COMPLETA') return siguientePlanificarRuta()
      if (x.guiaEnEspera) return { texto: 'Consultar si SUNAT ya aceptó la guía: sin eso no hay PDF ni se avisa a Pedidos', responsable: R.documentos, href: `/salidas/${id}`, boton: 'Consultar estado en SUNAT' }
      const sinDoc = etapa !== 'DOCUMENTACION_COMPLETA'
      if (sinDoc && x.tipo === 'CLIENTE') return { texto: 'Registrar la guía de remisión del cliente (su número y el PDF que adjuntó) y completar el paquete documental: el WMS no emite guía en esta orden', responsable: R.documentos, href: `/salidas/${id}`, boton: 'Registrar la GRE del cliente' }
      if (sinDoc) return { texto: 'Emitir la guía de remisión (con la ruta ya asignada) y completar el paquete documental', responsable: R.documentos, href: `/salidas/${id}`, boton: 'Emitir la guía' }
      return { texto: 'Embalar el pedido en bultos y imprimir las etiquetas', responsable: R.embalaje, href: `/embalaje/${id}`, boton: 'Ir al embalaje' }
    }
    case 'LISTA_PARA_CARGA':
      if (x.tipo === 'CLIENTE') return siguienteEntregaCliente(id)
      if (x.sinRuta) return siguientePlanificarRuta()
      return { texto: 'Cargar los bultos en el vehículo escaneando su QR y liberar la unidad', responsable: R.carga, href: '/carga', boton: 'Ir a la carga' }
    case 'CARGADA': return { texto: 'Liberar la unidad y confirmar la salida: ahí recién baja el stock', responsable: R.jefeTransporte, href: '/carga', boton: 'Liberar la unidad' }
    case 'CONFIRMADA':
      if (x.faltaGuiaVigente) return { texto: 'Guía anulada, falta guía vigente: emite la guía nueva (el stock no se toca porque la orden ya salió). Si la mercadería vuelve al almacén, entra como devolución', responsable: R.jefeTransporte, href: `/salidas/${id}#panel-documentacion`, boton: 'Emitir la guía nueva' }
      return { texto: 'Terminada: la orden salió y el stock ya bajó', responsable: R.nadie, fin: true }
    case 'ENTREGADA_AL_TRANSPORTISTA':
      if (x.faltaGuiaVigente) return { texto: 'GRE anulada, falta una guía vigente: registra la GRE nueva del cliente (el stock no se toca porque la orden ya salió)', responsable: R.documentos, href: `/salidas/${id}#panel-documentacion`, boton: 'Registrar la GRE nueva' }
      return { texto: 'Terminada: la mercadería se entregó al transportista del cliente y el stock ya bajó', responsable: R.nadie, fin: true }
    case 'CANCELADA': return { texto: 'Cancelada: no se hace nada más con esta orden', responsable: R.nadie, fin: true }
  }
}

/** El avance de una Orden de Salida: sus siete pasos y qué sigue, quién lo hace y dónde. */
export function avanceDeSalida(etapa: EtapaSalida, id: string, extras: ExtrasSalida = {}): Avance {
  const sinEmb = !!extras.sinEmbalaje
  const esB = extras.tipo === 'CLIENTE'
  let hechos = HECHOS[etapa]
  // Documentación completa sin embalaje: la guía y el paquete están hechos, falta embalar.
  if (etapa === 'DOCUMENTACION_COMPLETA') hechos = 4
  const terminada = (etapa === 'CONFIRMADA' || etapa === 'ENTREGADA_AL_TRANSPORTISTA') && !extras.faltaGuiaVigente
  let pasos: Paso[]
  if (esB) pasos = pasosDe(ORDEN_SALIDA_B, Math.min(hechos, 5), terminada)
  else {
    pasos = pasosDe(ORDEN_SALIDA, hechos, terminada)
    // SA-6: una orden manual (A o C) lleva «Ruta planificada» antes de la guía: hecha cuando ya está en una ruta
    if (extras.porRuta && extras.sinRuta !== undefined) {
      const i = pasos.findIndex((p) => p.clave === 'documentos')
      pasos.splice(i, 0, { clave: 'ruta', etiqueta: 'Ruta planificada', estado: terminada || !extras.sinRuta ? 'HECHO' : 'PENDIENTE' })
      const primero = pasos.findIndex((p) => p.estado !== 'HECHO')
      pasos.forEach((p, k) => { if (p.estado === 'ACTUAL') p.estado = 'PENDIENTE'; if (k === primero) p.estado = 'ACTUAL' })
    }
  }
  pasos = pasos.filter((p) => !(sinEmb && p.clave === 'embalaje'))
  if (sinEmb) pasos.forEach((p, i) => { if (p.estado === 'ACTUAL' && i > 0 && pasos[i - 1].estado !== 'HECHO') p.estado = 'PENDIENTE' })
  if (etapa === 'CANCELADA') return { pasos: pasos.map((p) => ({ ...p, estado: 'PENDIENTE' as const })), siguiente: siguienteDeSalida(etapa, id, extras) }
  return { pasos, siguiente: siguienteDeSalida(etapa, id, extras) }
}

// ── Ingreso ───────────────────────────────────────────────────────────────────────────────────────────────────────

const INGRESO = [['solicitud', 'Solicitud'], ['autorizada', 'Autorizada'], ['recepcion', 'Recepción'], ['acta', 'Acta firmada']] as const
const HECHOS_INGRESO: Record<EstadoSolicitud, number> = { BORRADOR: 0, ENVIADA: 1, PROGRAMADA: 2, EN_RECEPCION: 2, CERRADA: 4, ANULADA: 0 }

/** El avance de un ingreso (compra local, importación, devolución…): quién autoriza, quién recibe y quién firma el acta. */
export function avanceDeIngreso(estado: EstadoSolicitud, id: string): Avance {
  const hechos = HECHOS_INGRESO[estado]
  const pasos = pasosDe(INGRESO, hechos, estado === 'CERRADA')
  const base: Record<EstadoSolicitud, SiguientePaso> = {
    BORRADOR: { texto: 'Terminar la solicitud y enviarla a autorizar', responsable: { roles: ['asistente_dt', 'jefe_almacen', 'direccion_tecnica'], etiqueta: 'asistente de DT o Jefe de Almacén' }, href: `/entradas/${id}`, boton: 'Abrir la solicitud' },
    ENVIADA: { texto: 'Autorizar la solicitud para que se pueda recibir', responsable: R.dt, href: `/entradas/${id}`, boton: 'Revisar y autorizar' },
    PROGRAMADA: { texto: 'Recibir la mercadería cuando llegue y contarla', responsable: { roles: ['auxiliar', 'jefe_almacen'], etiqueta: 'auxiliar o Jefe de Almacén' }, href: `/entradas/${id}`, boton: 'Registrar la recepción' },
    EN_RECEPCION: { texto: 'Completar la verificación y firmar el acta de recepción', responsable: R.dt, href: `/entradas/${id}`, boton: 'Ir al acta' },
    CERRADA: { texto: 'Terminado: el ingreso está cerrado y el acta firmada', responsable: R.nadie, fin: true },
    ANULADA: { texto: 'Anulada: no se hace nada más con esta solicitud', responsable: R.nadie, fin: true },
  }
  return { pasos: estado === 'ANULADA' ? pasos.map((p) => ({ ...p, estado: 'PENDIENTE' as const })) : pasos, siguiente: base[estado] }
}

/** ¿Este conjunto de roles es quien hace el siguiente paso? (para «Mis tareas»). */
export const esMiTarea = (misRoles: readonly Rol[], s: SiguientePaso): boolean =>
  !s.fin && s.responsable.roles.some((r) => misRoles.includes(r))

export const ETAPAS_SALIDA: readonly EtapaSalida[] = Object.keys(HECHOS) as EtapaSalida[]
export const ESTADOS_INGRESO: readonly EstadoSolicitud[] = Object.keys(HECHOS_INGRESO) as EstadoSolicitud[]

// ── Mis tareas ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TareaPendiente {
  clave: string
  tipo: 'SALIDA' | 'INGRESO'
  /** Qué es: «OS-2026-00012 · Botica Salud» o «IN-2026-00005 · compra local». */
  titulo: string
  /** Dónde va (la etapa o el estado, en palabras). */
  donde: string
  siguiente: SiguientePaso
}

/** Lo que le toca a una persona según sus roles: el siguiente paso de cada orden o ingreso que ella puede hacer. Las más adelantadas primero (cerca de salir). */
export function misTareas(
  roles: readonly Rol[],
  salidas: readonly { id: string; numero: string; cliente?: string; faltaGuiaVigente?: boolean; etapa: EtapaSalida; requiereEmbalaje?: boolean; guiaEnEspera?: boolean; tipo?: TipoSalida; motivo?: string; devolucion?: 'POR_EJECUTAR' | 'POR_VERIFICAR'; devolucionHref?: string; sinPedido?: boolean; origen?: 'PEDIDO' | 'MANUAL'; rutaNumero?: string }[],
  ingresos: readonly { id: string; numero: string; estado: EstadoSolicitud; etiquetaTipo: string; etiquetaEstado: string }[],
  etiquetaEtapa: Record<EtapaSalida, string>,
): TareaPendiente[] {
  const tareas: (TareaPendiente & { orden: number })[] = []
  for (const s of salidas) {
    const a = avanceDeSalida(s.etapa, s.id, { sinEmbalaje: s.requiereEmbalaje === false, guiaEnEspera: s.guiaEnEspera, tipo: s.tipo, destruccion: s.motivo === 'DESTRUCCION', devolucion: s.devolucion, devolucionHref: s.devolucionHref, faltaGuiaVigente: s.faltaGuiaVigente, sinPedido: s.sinPedido, sinRuta: s.tipo === 'CLIENTE' ? undefined : !s.rutaNumero, porRuta: s.origen === 'MANUAL' && s.tipo !== 'CLIENTE' })
    if (esMiTarea(roles, a.siguiente)) tareas.push({ clave: `s-${s.id}`, tipo: 'SALIDA', titulo: `${s.numero}${s.cliente ? ` · ${s.cliente}` : ''}`, donde: etiquetaEtapa[s.etapa], siguiente: a.siguiente, orden: -HECHOS[s.etapa] })
  }
  for (const i of ingresos) {
    const a = avanceDeIngreso(i.estado, i.id)
    if (esMiTarea(roles, a.siguiente)) tareas.push({ clave: `i-${i.id}`, tipo: 'INGRESO', titulo: `${i.numero} · ${i.etiquetaTipo}`, donde: i.etiquetaEstado, siguiente: a.siguiente, orden: 10 - HECHOS_INGRESO[i.estado] })
  }
  return tareas.sort((x, y) => x.orden - y.orden).map(({ orden: _o, ...t }) => t)
}
