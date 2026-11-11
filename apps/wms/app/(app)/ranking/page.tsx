import { exigirContexto } from '@/lib/contexto'
import { armarRanking } from '@/domain/ranking'
import { hechosDelMes } from '@/services/ranking'
import { ComoSeGana, ComoVoy, TablaRanking } from '@/components/ranking/vista-ranking'
import { Aviso } from '@/components/entradas/aviso'

export const metadata = { title: 'Ranking del mes — WMS LOGISALUD' }

export default async function Ranking() {
  const ctx = await exigirContexto()
  const { hechos, nombres, ejemplo } = await hechosDelMes({ id: ctx.usuario.id, nombre: ctx.usuario.nombre })
  const rankings = [armarRanking(hechos, 'PICKING'), armarRanking(hechos, 'CONFORMIDAD')]
  const mes = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' })
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Ranking del mes</h1>
        <p className="mt-1 text-gray-600">Así va el mes de {mes}. Se calcula solo, con lo que el sistema ya registra: no hay nada que llenar.</p>
      </header>
      {ejemplo && <Aviso tipo="info" testid="ranking-ejemplo">Estos son datos de ejemplo de la demostración.</Aviso>}
      <ComoVoy rankings={rankings} personaId={ctx.usuario.id} />
      <ComoSeGana />
      <div className="grid gap-6 lg:grid-cols-2">{rankings.map((r) => <TablaRanking key={r.rol} ranking={r} nombres={nombres} personaId={ctx.usuario.id} />)}</div>
    </div>
  )
}
