import { BellOff } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { ListaAlertas } from '@/components/alertas/lista-alertas'

export const metadata = { title: 'Alertas — WMS LOGISALUD' }

export default async function Alertas() {
  const ctx = await exigirContexto()
  const todas = await repositorio().listarAlertas()
  const abiertas = todas.filter((a) => a.estado === 'ABIERTA')
  const atendidas = todas.filter((a) => a.estado === 'ATENDIDA')
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Alertas</h1>
        <p className="mt-1 text-gray-700">Lo que pide una mirada: temperatura fuera de rango, registro sanitario vencido, cambios de Compras y aprobados sin trasladar.</p>
      </header>
      <section aria-labelledby="abiertas">
        <h2 id="abiertas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Abiertas <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{abiertas.length}</span></h2>
        <div className="mt-3">
          {abiertas.length === 0
            ? <div className="card flex flex-col items-center gap-2 py-10 text-center" data-testid="alertas-vacio"><BellOff className="h-9 w-9 text-gray-400" aria-hidden /><p className="font-heading text-xl uppercase tracking-wide text-gray-800">Todo en orden</p><p className="text-sm text-gray-600">No hay alertas abiertas.</p></div>
            : <ListaAlertas alertas={abiertas} roles={ctx.roles} />}
        </div>
      </section>
      {atendidas.length > 0 && (
        <section aria-labelledby="atendidas"><h2 id="atendidas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Atendidas</h2><div className="mt-3"><ListaAlertas alertas={atendidas} roles={ctx.roles} /></div></section>
      )}
    </div>
  )
}
