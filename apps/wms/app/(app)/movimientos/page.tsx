import Link from 'next/link'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { accionesDeOrden, puedeEjecutarMovimiento } from '@/domain/inventario'
import { filaDeOrden } from '@/domain/movimientos-lista'
import { ListaMovimientos } from '@/components/inventario/lista-movimientos'

export const metadata = { title: 'Movimientos — WMS LOGISALUD' }

export default async function Movimientos({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const [ordenes, vistas] = await Promise.all([repo.listarMovimientos(), repo.listarVistas('MOVIMIENTOS', actor)])
  const mios = ordenes.filter((o) => { const a = accionesDeOrden(o, ctx.usuario.id, ctx.roles); return a.verificar || a.resolver }).map((o) => o.id)
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Movimientos</h1>
          <p className="mt-1 max-w-3xl text-gray-600">Cambiar productos de lugar dentro del almacén: <strong>quien lo ejecuta</strong> lo registra y lo mueve, y <strong>otra persona</strong> lo verifica línea por línea. Mover no cambia el estado sanitario.</p>
        </div>
        {puedeEjecutarMovimiento(ctx.roles) && <Link href="/movimientos/nuevo" className="btn-primary" data-testid="nuevo-movimiento"><Plus className="h-5 w-5" aria-hidden />Registrar un movimiento</Link>}
      </header>
      {ordenes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="movimientos-vacio">
          <ArrowLeftRight className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Todavía no hay movimientos</p>
          <p className="mt-1 text-sm text-gray-600">Cuando alguien registre uno, aparecerá aquí con su estado.</p>
        </div>
      ) : <ListaMovimientos filas={ordenes.map(filaDeOrden)} vistas={vistas} mios={mios} qInicial={searchParams.q ?? ''} />}
    </div>
  )
}
