import type { EnlaceStockVista, FiltroKardexCliente, RespuestaKardexCliente, RespuestaStockCliente } from '@/domain/stock-cliente'
import type { Actor, ResultadoAccion } from './repositorio'

/**
 * Stock del cliente de almacenamiento (0067). La consulta es PÚBLICA (sin usuario, con el token del enlace): solo su stock y su Kardex, sin ubicaciones.
 * Generar, listar y revocar enlaces es del personal con permiso de configurar (Administrador). APAGADO de fábrica (parámetro `stock_cliente_habilitado`).
 */
export interface RepositorioStockCliente {
  consultarStockCliente(token: string, ip: string): Promise<RespuestaStockCliente>
  consultarKardexCliente(token: string, filtro: FiltroKardexCliente, ip: string): Promise<RespuestaKardexCliente>
  /** El token en claro se devuelve UNA sola vez; en la base solo queda su hash. */
  crearEnlaceStockCliente(propietarioId: string, dias: number, etiqueta: string | undefined, actor: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>>
  revocarEnlaceStockCliente(enlaceId: string, actor: Actor): Promise<ResultadoAccion<{ revocado: boolean }>>
  listarEnlacesStockCliente(): Promise<EnlaceStockVista[]>
}
