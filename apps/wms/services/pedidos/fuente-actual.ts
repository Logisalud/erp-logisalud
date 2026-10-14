import 'server-only'

import { FuenteNoConfigurada, FuentePedidosHttp, type FuentePedidos } from './fuente-pedidos'

/**
 * La conexión con Pedidos de verdad. Se configura con dos variables del entorno (producción: solo con aprobación de Sebas):
 *   WMS_PEDIDOS_URL      — la base de la API de Pedidos (p. ej. https://pedidos.logisalud.pe/api)
 *   WMS_PEDIDOS_SECRETO  — el secreto compartido de la firma HMAC (se puede rotar)
 * Sin ellas la fuente dice que no está configurada y la bandeja sigue con lo ya importado.
 */
export function fuenteReal(): FuentePedidos {
  const baseUrl = process.env.WMS_PEDIDOS_URL
  const secreto = process.env.WMS_PEDIDOS_SECRETO
  if (!baseUrl || !secreto) return new FuenteNoConfigurada()
  return new FuentePedidosHttp({ baseUrl, secreto })
}
