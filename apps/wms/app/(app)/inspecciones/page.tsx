import { Lock } from 'lucide-react'
import { hoyEnLima } from '@/domain/fechas'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { TIPOS_INSPECCION, mesDe, puedeVerInspecciones, type InspeccionVista, type TipoInspeccion } from '@/domain/inspecciones'
import type { VehiculoInspeccion } from '@/services/repositorio-inspecciones'
import { InspeccionUnidad } from '@/components/inspecciones/inspeccion-unidad'

export const metadata = { title: 'Inspección de la unidad — WMS LOGISALUD' }

export default async function PaginaInspecciones({ searchParams }: { searchParams: { tipo?: string; vehiculo?: string; mes?: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerInspecciones(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="inspecciones-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Inspección de la unidad</h1>
        <p className="mt-2 text-gray-700">Esta pantalla es para el conductor, el auxiliar de transporte y el Jefe de Transporte. Si la necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const hoy = hoyEnLima()
  const tipo: TipoInspeccion = TIPOS_INSPECCION.includes(searchParams.tipo as TipoInspeccion) ? (searchParams.tipo as TipoInspeccion) : 'VEHICULO'
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mes ?? '') ? searchParams.mes! : mesDe(hoy)
  let vehiculos: VehiculoInspeccion[] = []; let inspecciones: InspeccionVista[] = []; let error: string | null = null
  try {
    const repo = repositorio()
    vehiculos = await repo.vehiculosParaInspeccion(actor)
    // Con un solo vehículo disponible se elige solo
    const vehiculoId = vehiculos.find((v) => v.id === searchParams.vehiculo)?.id ?? (vehiculos.length === 1 ? vehiculos[0].id : undefined)
    if (vehiculoId) inspecciones = await repo.inspeccionesDelMes(tipo, vehiculoId, mes, actor)
    return <InspeccionUnidad tipo={tipo} vehiculos={vehiculos} vehiculoId={vehiculoId} mes={mes} hoy={hoy} inspecciones={inspecciones} roles={ctx.roles} personaId={ctx.usuario.id} />
  } catch (e) { error = e instanceof Error ? e.message : 'No pudimos traer las inspecciones. Vuelve a intentarlo.' }
  return <InspeccionUnidad tipo={tipo} vehiculos={vehiculos} mes={mes} hoy={hoy} inspecciones={inspecciones} roles={ctx.roles} personaId={ctx.usuario.id} error={error} />
}
