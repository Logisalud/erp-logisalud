import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puede } from '@/domain/permisos'
import type { OcPilotoVista } from '@/domain/oc-versiones'
import { Aviso } from '@/components/entradas/aviso'
import { EstadoSincronizacion } from '@/components/entradas/estado-sincronizacion'
import { sincronizarOcsAlAbrir } from '@/lib/sincronizar-ocs'
import { OcsPiloto } from '@/components/entradas/ocs-piloto'

export const metadata = { title: 'Órdenes de compra del piloto — WMS LOGISALUD' }

export default async function OrdenesDeCompraDelPiloto() {
  const ctx = await exigirContexto()
  const sincronizacion = await sincronizarOcsAlAbrir(ctx)
  let lista: OcPilotoVista[] = []
  let error: string | null = null
  try { lista = await repositorio().ocsDelPiloto() } catch { error = 'No pudimos leer las órdenes de compra. Vuelve a intentar en un momento; si sigue igual, avisa a quien administra el WMS.' }
  return (
    <div className="space-y-6">
      <header>
        <Link href="/entradas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Entradas</Link>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Órdenes de compra del piloto</h1>
        <p className="mt-1 max-w-3xl text-gray-700">El WMS solo lee las órdenes de Compras: no las cambia. Cada vez que revisas, guarda una copia; si Compras cambia una orden, queda una versión nueva y te avisamos. La copia anterior nunca se borra.</p>
      </header>
      <EstadoSincronizacion r={sincronizacion} />
      {error
        ? <Aviso tipo="error" testid="ocs-error"><p>{error}</p></Aviso>
        : <OcsPiloto lista={lista} puedeRevisar={puede(ctx.roles, 'ejecutar')} />}
    </div>
  )
}
