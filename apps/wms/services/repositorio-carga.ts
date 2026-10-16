import type { CargaResumen, CargaRuta, ItemChecklist } from '@/domain/carga'
import type { Actor, ResultadoAccion } from './repositorio'

/** S8: carga de la unidad, conciliación, liberar la unidad y confirmar la salida (aquí el stock sale de verdad). */
export interface RepositorioCarga {
  /** Las rutas que ya están en carga, liberadas o en ruta, con su avance. */
  colaCarga(): Promise<CargaResumen[]>
  cargaRuta(rutaId: string): Promise<CargaRuta | null>
  guardarChecklist(rutaId: string, items: ItemChecklist[], actor: Actor): Promise<ResultadoAccion>
  /** Escanear (o marcar) un bulto: 'CARGADO' o 'YA_CARGADO' (repetir el escaneo no falla ni duplica). */
  cargarBulto(rutaId: string, codigo: string, actor: Actor): Promise<ResultadoAccion<{ resultado: 'CARGADO' | 'YA_CARGADO' }>>
  retirarBulto(rutaId: string, codigo: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  /** Un pedido al que le falta un bulto se deja fuera de ESTA salida (con motivo). */
  excluirPedido(rutaId: string, salidaId: string, motivo: string, actor: Actor): Promise<ResultadoAccion>
  liberarUnidad(rutaId: string, actor: Actor): Promise<ResultadoAccion>
  /** Una sola transacción e idempotente: el stock sale aquí y solo aquí. Devuelve cuántas reservas descontó (0 si ya estaba confirmada). */
  confirmarSalidaRuta(rutaId: string, actor: Actor): Promise<ResultadoAccion<{ reservas: number }>>
}
