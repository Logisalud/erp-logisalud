import type { RespuestaSeguimiento } from '@/domain/seguimiento'
import type { Actor, ResultadoAccion } from './repositorio'

/** Seguimiento para el cliente (P9). La consulta es PÚBLICA (sin usuario): solo estados con fecha y hora. APAGADO en modo piloto. */
export interface RepositorioSeguimiento {
  consultarSeguimiento(pedido: string, ruc: string, ip: string): Promise<RespuestaSeguimiento>
  consultarSeguimientoPorToken(token: string, ip: string): Promise<RespuestaSeguimiento>
  /** Del personal: genera el enlace con token (el token en claro se devuelve una sola vez). En el piloto se niega. */
  crearEnlaceSeguimiento(pedidoNumero: string, dias: number, actor: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>>
  revocarEnlacesSeguimiento(pedidoNumero: string, actor: Actor): Promise<ResultadoAccion<{ revocados: number }>>
}
