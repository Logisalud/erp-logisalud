import type { ClaveOpcionSeguimiento, ContactoVendedorVista, ErrorFilaContacto, OpcionesSeguimiento, RespuestaCarita, RespuestaSeguimiento, ValorCarita } from '@/domain/seguimiento'
import type { Actor, ResultadoAccion } from './repositorio'

/** Seguimiento para el cliente (P9 y 0069). La consulta es PÚBLICA (sin usuario): estados con hora, ruta, a quién escribir, la guía y la carita. Se enciende con `seguimiento_cliente_habilitado`. */
export interface RepositorioSeguimiento {
  consultarSeguimiento(pedido: string, ruc: string, ip: string): Promise<RespuestaSeguimiento>
  consultarSeguimientoPorToken(token: string, ip: string): Promise<RespuestaSeguimiento>
  /** «¿Cómo fue tu entrega?»: una respuesta por pedido entregado, con el mismo acceso (pedido + RUC) y el mismo límite de intentos. */
  responderEntrega(pedido: string, ruc: string, valor: ValorCarita, ip: string): Promise<RespuestaCarita>
  /** Del personal: genera el enlace con token (el token en claro se devuelve una sola vez). En el piloto se niega. */
  crearEnlaceSeguimiento(pedidoNumero: string, dias: number, actor: Actor): Promise<ResultadoAccion<{ token: string; venceEn: string }>>
  revocarEnlacesSeguimiento(pedidoNumero: string, actor: Actor): Promise<ResultadoAccion<{ revocados: number }>>
  // Del Administrador (permiso `configurar`): a quién escribe «Escribir a mi vendedor» y las opciones del seguimiento.
  listarContactosVendedores(): Promise<ContactoVendedorVista[]>
  guardarContactoVendedor(nombre: string, telefono: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>>
  eliminarContactoVendedor(id: string, actor: Actor): Promise<ResultadoAccion<{ eliminado: boolean }>>
  /** Carga por CSV: guarda las filas buenas y dice cuáles no (no es todo o nada). */
  cargarContactosVendedores(filas: { nombre: string; telefono: string }[], actor: Actor): Promise<ResultadoAccion<{ guardados: number; errores: ErrorFilaContacto[] }>>
  opcionesSeguimiento(): Promise<OpcionesSeguimiento>
  guardarOpcionSeguimiento(clave: ClaveOpcionSeguimiento, valor: string, actor: Actor): Promise<ResultadoAccion>
}
