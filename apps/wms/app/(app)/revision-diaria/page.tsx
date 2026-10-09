import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { RevisionDiariaVista } from '@/components/operacion/revision-diaria'

export const metadata = { title: 'Revisión diaria — WMS LOGISALUD' }

export default async function RevisionDiaria() {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const [revision, vivos, equipo, historial, p] = await Promise.all([repo.revisionDeHoy(), repo.pendientesVivos(), repo.personasDelEquipo(), repo.listarRevisiones(8), repo.panorama()])
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Revisión diaria</h1>
        <p className="mt-1 text-gray-600">Un recorrido de 10 a 15 minutos con cuatro focos: orden, limpieza, ubicaciones y situaciones anormales. No mueve stock ni decide estados: solo registra pendientes, cada uno con su responsable.</p>
      </header>
      <RevisionDiariaVista hoy={p.hoy} revision={revision} vivos={vivos} equipo={equipo} historial={historial.filter((r) => r.id !== revision?.id)} roles={ctx.roles} actorId={ctx.usuario.id} />
    </div>
  )
}
