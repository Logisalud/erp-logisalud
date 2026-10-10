import 'server-only'
import { repositorio } from '@/services/repositorio-actual'
import { calcularIndicadores, conSeries, diasDeSerie, periodoAnterior, type DatosIndicadores, type Indicador, type Periodo } from '@/domain/indicadores'
import type { Saldo } from '@/domain/tipos'
import { lunesDe, sumarDiasISO } from '@/domain/operacion'
import type { Rol } from '@/domain/tipos'
import type { Actor } from '@/services/repositorio'

/** Quién ve los indicadores: quien gestiona el inventario (el contador no ve saldos: conteo a ciegas). */
export const puedeVerIndicadores = (roles: readonly Rol[]) => roles.some((r) => r !== 'auxiliar')

/** Lee lo necesario con la sesión de la persona y calcula los indicadores del periodo (y su periodo anterior). */
export async function cargarIndicadores(actor: Actor, periodo: Periodo, propietarioCodigo?: string): Promise<{ indicadores: Indicador[]; propietarios: { id: string; codigo: string }[]; hoy: string }> {
  const repo = repositorio()
  const ant = periodoAnterior(periodo)
  // La tendencia de 30 días repite el cálculo con la misma ventana terminando en cada punto: hay que leer 30 días más hacia atrás.
  const desdeDatos = sumarDiasISO(ant.desde, -30)
  const lunes: string[] = []
  for (let x = lunesDe(desdeDatos); x <= periodo.hasta; x = sumarDiasISO(x, 7)) lunes.push(x)
  const [panorama, par, saldosAntes, ordenes, exactitud, solicitudes, revisiones, pendientes, alertas, ajustes, cobertura, programaciones] = await Promise.all([
    repo.panorama(), repo.parametrosInventario(), repo.saldosAl(sumarDiasISO(periodo.desde, -1), actor), repo.listarMovimientos(),
    repo.exactitudConteos(desdeDatos, periodo.hasta, actor), repo.listarSolicitudes(), repo.listarRevisiones(200), repo.pendientesVivos(), repo.listarAlertas(),
    repo.listarAjustes(), repo.ultimaCobertura(), Promise.all(lunes.map((l) => repo.programacionDeSemana(l))),
  ])
  const datos: DatosIndicadores = {
    hoy: panorama.hoy, panorama, saldosAntes, ordenes, exactitud, solicitudes, revisiones, pendientes, alertas, ajustes, cobertura, programaciones: programaciones.flat(),
    plazoMovHoras: par.movimientoSinVerificarHoras, diasAlertaVencimiento: par.diasAlertaVencimiento,
  }
  const opciones = { propietarioId: panorama.propietarios.find((p) => p.codigo === propietarioCodigo)?.id }
  // Cómo era el stock al final de cada punto de la tendencia (libro mayor), para los indicadores de stock.
  const dias = diasDeSerie(panorama.hoy).filter((x) => x !== panorama.hoy)
  const saldosPorDia = new Map<string, Saldo[]>(await Promise.all(dias.map(async (dia) => [dia, await repo.saldosAl(dia, actor)] as const)))
  const indicadores = conSeries(calcularIndicadores(datos, periodo, opciones), datos, periodo, opciones, saldosPorDia)
  return { indicadores, propietarios: panorama.propietarios.map((p) => ({ id: p.id, codigo: p.codigo })), hoy: panorama.hoy }
}
