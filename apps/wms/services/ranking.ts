import 'server-only'

import { modoDemoActivo } from '@/lib/demo'
import type { HechoPedido } from '@/domain/ranking'
import type { ResultadoAccion } from './repositorio'
import { mensajeHumano, rpc, type Fila } from './supabase/util'
import { nombresDe } from './supabase/entradas-supabase'

/** Los hechos del mes para los rankings (una fila por pedido conformado) y los nombres de las personas. */
export async function hechosDelMes(usuario: { id: string; nombre: string }): Promise<{ hechos: HechoPedido[]; nombres: Map<string, string>; ejemplo: boolean }> {
  if (modoDemoActivo()) return { ...hechosDeEjemplo(usuario), ejemplo: true }
  const { data, error } = await rpc('pedidos_del_mes', {})
  if (error) throw new Error(`No se pudo leer el ranking: ${error.message}`)
  const filas = (data ?? []) as Fila[]
  const hechos: HechoPedido[] = filas.map((f) => ({
    salidaId: String(f.salida_id), salidaNumero: f.salida_numero == null ? undefined : String(f.salida_numero), pickerId: f.picker_id == null ? null : String(f.picker_id),
    conformadorId: f.conformador_id == null ? null : String(f.conformador_id), productos: Number(f.productos), bultos: Number(f.bultos), provincia: Boolean(f.provincia),
    errorPicking: Boolean(f.error_picking), errorPosterior: Boolean(f.error_posterior), pickerEsJefe: Boolean(f.picker_es_jefe), conformadorEsJefe: Boolean(f.conformador_es_jefe),
  }))
  const nombres = await nombresDe(hechos.flatMap((h) => [h.pickerId ?? undefined, h.conformadorId ?? undefined]))
  return { hechos, nombres, ejemplo: false }
}

/** «Diferencia detectada en la carga»: la anota quien carga, con motivo (no quien picó ni quien conformó ese pedido: lo valida la base de datos). */
export async function registrarDiferenciaCarga(salidaId: string, motivo: string): Promise<ResultadoAccion> {
  if (!motivo.trim()) return { ok: false, mensaje: 'Escribe qué diferencia encontraste' }
  if (modoDemoActivo()) { diferenciasDemo.push({ salidaId, motivo: motivo.trim() }); return { ok: true } }
  const { error } = await rpc('registrar_diferencia_carga', { p_salida: salidaId, p_motivo: motivo })
  return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true }
}

const diferenciasDemo: { salidaId: string; motivo: string }[] = []

/** Datos de ejemplo para la demostración (nada de esto es real): seis personas y el usuario que mira, con pedidos del mes. */
function hechosDeEjemplo(usuario: { id: string; nombre: string }): { hechos: HechoPedido[]; nombres: Map<string, string> } {
  const gente: [string, string, number, number, number, number][] = [
    // id, nombre, pedidos de picking, con error, pedidos de conformidad, con error posterior
    ['ej-ana', 'Ana (ejemplo)', 120, 1, 0, 0], ['ej-luis', 'Luis (ejemplo)', 95, 5, 0, 0], ['ej-marta', 'Marta (ejemplo)', 70, 1, 0, 0],
    ['ej-pedro', 'Pedro (ejemplo)', 12, 0, 0, 0], ['ej-sofia', 'Sofía (ejemplo)', 0, 0, 110, 1], [usuario.id, usuario.nombre, 80, 2, 60, 0],
  ]
  const nombres = new Map(gente.map(([id, n]) => [id, n]))
  const hechos: HechoPedido[] = []
  let k = 0
  for (const [id, , pick, errPick, conf, errConf] of gente) {
    for (let i = 0; i < pick; i += 1) { k += 1; hechos.push({ salidaId: `ej-${k}`, pickerId: id, conformadorId: 'ej-sofia', productos: 1 + (i % 7), bultos: 1 + (i % 4), provincia: i % 3 === 0, errorPicking: i < errPick, errorPosterior: false, pickerEsJefe: false, conformadorEsJefe: false }) }
    for (let i = 0; i < conf; i += 1) { k += 1; hechos.push({ salidaId: `ej-${k}`, pickerId: 'ej-ana', conformadorId: id, productos: 1 + (i % 6), bultos: 1 + (i % 5), provincia: i % 4 === 0, errorPicking: false, errorPosterior: i < errConf, pickerEsJefe: false, conformadorEsJefe: false }) }
  }
  return { hechos, nombres }
}
