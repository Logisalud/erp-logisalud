// El aviso para el vendedor (SA-3, D-126). Mientras no exista la conexión real con Pedidos (D-80), el WMS no puede avisarle al vendedor: arma el mensaje
// listo para pegarlo en WhatsApp y quien trabaja la orden lo copia. Solo lo necesario: pedido, cliente, qué falta, por qué (con cantidades) y qué debe decidir.
// Nada de RUC, dirección ni precios.
import { listarCausas, type FaltanteLineaVista } from './faltante'

export interface DatosAvisoVendedor {
  pedidoNumero: string
  cliente: string
  /** Sin nombre del vendedor, el saludo es genérico. */
  vendedor?: string
  lineas: readonly FaltanteLineaVista[]
}

/** Las dos únicas decisiones posibles. Se toman en Pedidos: el WMS no cambia cantidades de un pedido (D-124). */
export const DECISIONES_FALTA_STOCK = [
  'Quitar o reducir la línea: lo que falta se cancela y no queda pendiente.',
  'Cancelar el pedido.',
] as const

/** Una línea del aviso: «• Producto (código): pide 50 y hay 35 disponibles. Faltan 15: 10 en Cuarentena y 5 sin stock.» */
export const lineaDeAviso = (l: FaltanteLineaVista): string => {
  const x = l.explicacion
  return `• ${l.producto} (${l.productoCodigo}): pide ${x.pedido} y hay ${x.disponibles} disponibles. Faltan ${x.faltan}: ${listarCausas(x.causas)}.`
}

/** El mensaje completo, listo para WhatsApp. Devuelve vacío si no hay nada que avisar. */
export function avisoParaVendedor(d: DatosAvisoVendedor): string {
  const conFalta = d.lineas.filter((l) => l.explicacion.hayFaltante)
  if (conFalta.length === 0) return ''
  return [
    `Hola${d.vendedor ? ` ${d.vendedor}` : ''}, no podemos despachar completo el pedido ${d.pedidoNumero} de ${d.cliente}: falta stock.`,
    '',
    ...conFalta.map(lineaDeAviso),
    '',
    'Habla con el cliente y decide en Pedidos una de dos cosas:',
    `1) ${DECISIONES_FALTA_STOCK[0]}`,
    `2) ${DECISIONES_FALTA_STOCK[1]}`,
    '',
    'Apenas cambies el pedido en Pedidos, la orden de salida se actualiza sola. Gracias. — Almacén LOGISALUD',
  ].join('\n')
}
