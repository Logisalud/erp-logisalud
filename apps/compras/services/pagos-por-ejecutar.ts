import 'server-only'
import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import { diasEsperando } from '@/domain/pendientes-aprobar'
import { esperaEjecucion, ordenarPorEspera, type LotePorEjecutar } from '@/domain/pagos-por-ejecutar'
import { sumarPorMoneda } from '@/domain/propuesta-permisos'

/**
 * Los lotes aprobados que todavía tienen pagos por hacer — la bandeja de
 * Tesorería. Reusa `listarPropuestas`, que desde el PR #105 ya calcula los
 * totales por moneda y lo pendiente, en vez de recalcularlo acá.
 *
 * No ejecuta ningún pago: lleva a la propuesta, donde el pago ya vive (ver
 * domain/pagos-por-ejecutar.ts para el porqué).
 */
export async function listarPagosPorEjecutar(): Promise<LotePorEjecutar[]> {
  const { listarPropuestas } = await import('@/services/propuestas')
  const propuestas = await listarPropuestas()
  const ahora = new Date().toISOString()

  const candidatas = propuestas.filter((p) => p.estado === 'aprobada')
  if (candidatas.length === 0) return []

  const pendientesPorPropuesta = await contarPendientes(candidatas.map((p) => p.id))

  const lotes = candidatas
    .map((p): LotePorEjecutar | null => {
      const pendientes = pendientesPorPropuesta.get(p.id) ?? 0
      if (!esperaEjecucion(p.estado, pendientes)) return null
      return {
        id: p.id,
        codigo: p.codigo,
        periodo: p.periodo ?? null,
        pendientes,
        total: p.totalObligaciones,
        pendientePorMoneda: p.pendientePorMoneda ?? [],
        aprobadaEn: p.fecha_aprobacion ?? null,
        creadaEn: p.created_at,
        // La espera real arranca en la aprobación; solo se cae a la creación
        // en los lotes aprobados antes de la 0050, que no tienen esa fecha.
        esperaDesde: p.fecha_aprobacion ? 'aprobacion' : 'creacion',
        diasEsperando: diasEsperando(p.fecha_aprobacion ?? p.created_at, ahora),
        href: `/cuentas-por-pagar/propuestas/${p.id}`,
      }
    })
    .filter((l): l is LotePorEjecutar => l !== null)

  return ordenarPorEspera(lotes)
}

/** Cuántas obligaciones de cada lote siguen sin pago aplicado. */
async function contarPendientes(propuestaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (propuestaIds.length === 0) return mapa
  const supabase = crearClienteServidor()

  const { data: detalle } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuesta_detalle')
    .select('propuesta_id, obligacion_id')
    .in('propuesta_id', propuestaIds)
  const filas = (detalle ?? []) as { propuesta_id: string; obligacion_id: string }[]
  if (filas.length === 0) return mapa

  const { data: aplicados } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('obligacion_id')
    .in('obligacion_id', filas.map((f) => f.obligacion_id))
  const pagadas = new Set((aplicados ?? []).map((a: any) => a.obligacion_id))

  for (const fila of filas) {
    if (pagadas.has(fila.obligacion_id)) continue
    mapa.set(fila.propuesta_id, (mapa.get(fila.propuesta_id) ?? 0) + 1)
  }
  return mapa
}

/**
 * Quién ve la bandeja: Tesorería (quien ejecuta), más Contabilidad y admin,
 * que ya ven las propuestas. Mismo criterio que `puedeVerPropuestas` — no
 * tiene sentido que la bandeja sea más restrictiva que la pantalla a la que
 * lleva.
 */
export async function puedeVerPagosPorEjecutar(): Promise<boolean> {
  const perfil = await perfilActual()
  return perfil?.area === 'admin' || perfil?.area === 'contabilidad' || perfil?.area === 'tesoreria'
}
