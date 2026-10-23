// Órdenes de ejemplo de la demostración (SA-1): una orden en cada etapa y de cada tipo para recorrer todos los flujos sin generarlos uno por uno.
// Esta lista es DECLARATIVA y es el único punto que se amplía: cada fila dice qué orden se siembra, hasta dónde se lleva y qué etapa debe quedar. Quien la ejecuta
// (`services/demo/ejemplos-demo.ts`) llama a las mismas acciones que las pantallas; aquí no hay estados inventados.
import type { EtapaSalida } from './despacho'

/** Hasta dónde se lleva cada ejemplo (cada paso incluye los anteriores). */
export type HastaEjemplo =
  | 'ASIGNADA'              // stock asignado, sin picking
  | 'EN_PICKING'            // hoja de picking con quien pica, una línea pickeada
  | 'PENDIENTE_CONFORMIDAD' // todo pickeado, falta la conformidad
  | 'CONFORME'              // conformidad dada
  | 'GUIA_EMITIDA'          // guía emitida con el simulador de Nubefact y COA cargados (la ruta ya está asignada)
  | 'EMBALADA'              // conforme y embalada en bultos, todavía sin guía
  | 'LISTA_PARA_CARGA'      // guía + documentos + embalaje, en una ruta por cargar
  | 'CONFIRMADA'            // ruta cargada, unidad liberada y salida confirmada: el stock ya bajó
  | 'SIN_STOCK'             // falta stock (con el aviso de por qué falta)
  | 'CANCELADA'             // cancelada por el Jefe de Transporte
  | 'PEDIDO_CANCELADO'      // el pedido se canceló en Pedidos
  | 'CAMBIO_CON_PICKING'    // Pedidos cambió el pedido con el picking ya hecho: hay que devolver lo picado

export type ClaseEjemplo = 'A_BANDEJA' | 'A_MANUAL' | 'B' | 'C_MUESTRA' | 'C_PROVEEDOR'

export const ETIQUETA_CLASE_EJEMPLO: Record<ClaseEjemplo, string> = {
  A_BANDEJA: 'A · venta, llegó por la bandeja', A_MANUAL: 'A · venta manual con n.º de pedido', B: 'B · por cuenta de un cliente', C_MUESTRA: 'C · muestra de Logissa', C_PROVEEDOR: 'C · devolución al proveedor',
}

export interface EjemploSalida {
  /** Identificador estable (sirve de clave en pruebas y guion). */
  clave: string
  clase: ClaseEjemplo
  hasta: HastaEjemplo
  /** La etapa que la lista debe mostrar al terminar de sembrar. */
  etapa: EtapaSalida
  /** N.º de pedido reconocible (solo en las órdenes con pedido). */
  pedido?: string
  /** Cliente de ejemplo (nombre evidente). En B es el propietario. */
  cliente: string
  /** Pedido a provincia (se embala) o a Lima. */
  provincia?: boolean
  /** Para el guion: con quién entrar y qué probar. */
  conQuien: string
  probar: string
}

const JT = 'Jefe de Transporte'
const CONF = 'Asistente de Dirección Técnica (da la conformidad)'
const AUX = 'Auxiliar de almacén'

/**
 * Tiempo 1: lo que esta rama sabe llevar de punta a punta. El orden de la lista es el orden de siembra (y el de los números de orden OS-AAAA-NNNNN).
 * Los pedidos de la bandeja (201…212) y los manuales (221…) se llaman PED-DEMO-2xx para distinguirlos de los pedidos de siempre (101…104).
 */
export const EJEMPLOS_SALIDA: readonly EjemploSalida[] = [
  { clave: 'a-asignada', clase: 'A_BANDEJA', hasta: 'ASIGNADA', etapa: 'ASIGNADA', pedido: 'PED-DEMO-201', cliente: 'Botica Ejemplo Lima SAC', conQuien: JT, probar: 'Designar a quien pica y generar la hoja de picking; cambiar un lote antes del picking (se anota si te apartas de FEFO).' },
  { clave: 'a-picking', clase: 'A_BANDEJA', hasta: 'EN_PICKING', etapa: 'EN_PICKING', pedido: 'PED-DEMO-202', cliente: 'Farmacia Ejemplo Norte EIRL', conQuien: AUX, probar: 'Seguir el picking por el recorrido de la hoja: una línea ya está pickeada, falta la otra (o marca una discrepancia).' },
  { clave: 'a-pendiente-conformidad', clase: 'A_BANDEJA', hasta: 'PENDIENTE_CONFORMIDAD', etapa: 'PENDIENTE_CONFORMIDAD', pedido: 'PED-DEMO-203', cliente: 'Droguería Ejemplo Sur SAC', conQuien: CONF, probar: 'Dar la conformidad de toda la orden con un clic o por línea (otro lote, menos cantidad) y contar los bultos. Quien pickeó no puede darla.' },
  { clave: 'a-conforme', clase: 'A_BANDEJA', hasta: 'CONFORME', etapa: 'CONFORME', pedido: 'PED-DEMO-204', cliente: 'Botica Ejemplo Centro SAC', conQuien: JT, probar: 'Armar una ruta con este pedido y emitir la guía (simulador de Nubefact); cargar los COA del paquete documental.' },
  { clave: 'a-guia', clase: 'A_BANDEJA', hasta: 'GUIA_EMITIDA', etapa: 'DOCUMENTACION_COMPLETA', pedido: 'PED-DEMO-205', cliente: 'Farmacia Ejemplo Andina EIRL', provincia: true, conQuien: AUX, probar: 'Ver la guía emitida y su PDF simulado; embalar el pedido en bultos con código QR.' },
  { clave: 'a-embalada', clase: 'A_BANDEJA', hasta: 'EMBALADA', etapa: 'EMBALADA', pedido: 'PED-DEMO-206', cliente: 'Botica Ejemplo Selva SAC', provincia: true, conQuien: JT, probar: 'Reabrir el embalaje con motivo para rehacer los bultos; completar la guía y los documentos que faltan.' },
  { clave: 'a-lista-carga', clase: 'A_BANDEJA', hasta: 'LISTA_PARA_CARGA', etapa: 'LISTA_PARA_CARGA', pedido: 'PED-DEMO-207', cliente: 'Farmacia Ejemplo Costa EIRL', provincia: true, conQuien: AUX, probar: 'En «Cargar la unidad»: escanear los bultos, llenar el checklist del vehículo y liberar la unidad (la ruta ya está armada).' },
  { clave: 'a-confirmada', clase: 'A_BANDEJA', hasta: 'CONFIRMADA', etapa: 'CONFIRMADA', pedido: 'PED-DEMO-208', cliente: 'Botica Ejemplo Sierra SAC', provincia: true, conQuien: JT, probar: 'Ver la orden terminada: el stock ya bajó, el registro LS-FR.43.03 tiene su hora de salida y se puede crear un retorno si el cliente devuelve.' },
  { clave: 'a-sin-stock', clase: 'A_BANDEJA', hasta: 'SIN_STOCK', etapa: 'SIN_STOCK', pedido: 'PED-DEMO-209', cliente: 'Clínica Ejemplo Norte SA', conQuien: JT, probar: 'Leer por qué falta (sin stock, Cuarentena, Reserva o vence en menos de 60 días, con cantidades) y copiar el aviso para el vendedor, que es quien decide.' },
  { clave: 'a-cancelada', clase: 'A_BANDEJA', hasta: 'CANCELADA', etapa: 'CANCELADA', pedido: 'PED-DEMO-210', cliente: 'Botica Ejemplo Equivocada SAC', conQuien: JT, probar: 'Ver una orden cancelada con su motivo: el stock reservado se liberó y nada se borra.' },
  { clave: 'a-pedido-cancelado', clase: 'A_BANDEJA', hasta: 'PEDIDO_CANCELADO', etapa: 'CANCELADA', pedido: 'PED-DEMO-211', cliente: 'Farmacia Ejemplo Desiste EIRL', conQuien: JT, probar: 'En «Pedidos por despachar» el pedido figura «Cancelado en Pedidos»; la orden se canceló sola y liberó todo.' },
  { clave: 'a-cambio-con-picking', clase: 'A_BANDEJA', hasta: 'CAMBIO_CON_PICKING', etapa: 'POR_DEVOLVER_PICKING', pedido: 'PED-DEMO-212', cliente: 'Droguería Ejemplo Cambia SAC', conQuien: AUX, probar: 'Pedidos redujo una línea con el picking hecho: devolver lo picado a su ubicación (movimiento) y que otra persona lo verifique.' },
  { clave: 'a-manual-asignada', clase: 'A_MANUAL', hasta: 'ASIGNADA', etapa: 'ASIGNADA', pedido: 'PED-DEMO-221', cliente: 'Botica Ejemplo Manual SAC', conQuien: JT, probar: 'Orden manual «por conciliar con Pedidos». Si el pedido llega después por la bandeja se une a esta orden sin duplicarla.' },
  { clave: 'a-manual-conforme', clase: 'A_MANUAL', hasta: 'CONFORME', etapa: 'CONFORME', pedido: 'PED-DEMO-222', cliente: 'Farmacia Ejemplo Manual EIRL', provincia: true, conQuien: JT, probar: 'Orden manual ya conforme: hasta aquí llega hoy (la ruta y la guía de una venta manual sin pedido en la bandeja se completan en SA-6).' },
  { clave: 'b-asignada', clase: 'B', hasta: 'ASIGNADA', etapa: 'ASIGNADA', cliente: 'Diphasac', conQuien: `${JT} o Jefe de Almacén`, probar: 'Una salida por cuenta de un cliente de almacenamiento: solo su stock, con el lote que indicó en su guía y «creada por … en nombre de …».' },
  { clave: 'b-conforme', clase: 'B', hasta: 'CONFORME', etapa: 'CONFORME', cliente: 'AJR Labs', conQuien: JT, probar: 'La GRE del cliente ya está registrada (número y PDF): no se emite guía del WMS. Ver el paquete documental.' },
  { clave: 'c-muestra', clase: 'C_MUESTRA', hasta: 'CONFORME', etapa: 'CONFORME', cliente: 'Muestra de Logissa', conQuien: 'Autoriza salidas sin venta (la crea) y Jefe de Transporte', probar: 'Una muestra sin venta autorizada por el rol que corresponde; lleva guía con el motivo «otros» (no se factura).' },
  { clave: 'c-proveedor', clase: 'C_PROVEEDOR', hasta: 'CONFORME', etapa: 'CONFORME', cliente: 'Devolución al proveedor', conQuien: JT, probar: 'Una devolución al proveedor con el lote indicado y antes de su vencimiento; la guía lleva el motivo de devolución.' },
]

/**
 * Tiempo 2 (cuando se integre SA-6, que deja avanzar hasta ruta, carga y entrega a las órdenes sin pedido en la bandeja, a las de tipo C y a la entrega al transportista del
 * cliente): estos ejemplos se agregan a la lista de arriba con su `hasta` y no existen todavía.
 */
export const EJEMPLOS_PENDIENTES_TIEMPO_2: readonly { clase: ClaseEjemplo; hasta: HastaEjemplo; nota: string }[] = [
  { clase: 'A_MANUAL', hasta: 'LISTA_PARA_CARGA', nota: 'venta manual por conciliar con guía, embalaje y ruta' },
  { clase: 'A_MANUAL', hasta: 'CONFIRMADA', nota: 'venta manual por conciliar con salida confirmada' },
  { clase: 'B', hasta: 'CONFIRMADA', nota: 'por cuenta de un cliente entregada al transportista del cliente (con su GRE)' },
  { clase: 'C_MUESTRA', hasta: 'LISTA_PARA_CARGA', nota: 'muestra de Logissa con guía y ruta' },
  { clase: 'C_PROVEEDOR', hasta: 'CONFIRMADA', nota: 'devolución al proveedor con salida confirmada' },
]

export const PREFIJO_PEDIDO_EJEMPLO = 'PED-DEMO-2'
/** ¿Es un número de pedido de los ejemplos? */
export const esPedidoDeEjemplo = (numero: string | undefined | null) => !!numero && numero.toUpperCase().startsWith(PREFIJO_PEDIDO_EJEMPLO)
