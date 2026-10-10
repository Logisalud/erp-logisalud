import 'server-only'
import { repositorio } from '@/services/repositorio-actual'
import { calcularIndicadores, periodoAnterior, type Indicador, type Periodo } from '@/domain/indicadores'
import { lunesDe, sumarDiasISO } from '@/domain/operacion'
import type { Rol } from '@/domain/tipos'
import type { Actor } from '@/services/repositorio'

/** Quién ve los indicadores: quien gestiona el inventario (el contador no ve saldos: conteo a ciegas). */
export const puedeVerIndicadores = (roles: readonly Rol[]) => roles.some((r) => r !== 'auxiliar')

/** Lee lo necesario con la sesión de la persona y calcula los indicadores del periodo (y su periodo anterior). */
export async function cargarIndicadores(actor: Actor, periodo: Periodo, propietarioCodigo?: string): Promise<{ indicadores: Indicador[]; propietarios: { id: string; codigo: string }[]; hoy: string }> {
  const repo = repositorio()
  const ant = periodoAnterior(periodo)
  const lunes: string[] = []
  for (let x = lunesDe(ant.desde); x <= periodo.hasta; x = sumarDiasISO(x, 7)) lunes.push(x)
  const [panorama, par, saldosAntes, ordenes, exactitud, solicitudes, revisiones, pendientes, alertas, ajustes, cobertura, programaciones] = await Promise.all([
    repo.panorama(), repo.parametrosInventario(), repo.saldosAl(sumarDiasISO(periodo.desde, -1), actor), repo.listarMovimientos(),
    repo.exactitudConteos(ant.desde, periodo.hasta, actor), repo.listarSolicitudes(), repo.listarRevisiones(200), repo.pendientesVivos(), repo.listarAlertas(),
    repo.listarAjustes(), repo.ultimaCobertura(), Promise.all(lunes.map((l) => repo.programacionDeSemana(l))),
  ])
  const indicadores = calcularIndicadores({
    hoy: panorama.hoy, panorama, saldosAntes, ordenes, exactitud, solicitudes, revisiones, pendientes, alertas, ajustes, cobertura, programaciones: programaciones.flat(),
    plazoMovHoras: par.movimientoSinVerificarHoras, diasAlertaVencimiento: par.diasAlertaVencimiento,
  }, periodo, { propietarioId: panorama.propietarios.find((p) => p.codigo === propietarioCodigo)?.id })
  return { indicadores, propietarios: panorama.propietarios.map((p) => ({ id: p.id, codigo: p.codigo })), hoy: panorama.hoy }
}
