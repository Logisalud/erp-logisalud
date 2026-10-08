import Link from 'next/link'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { accionesDeOrden, puedePrepararMovimiento, type OrdenMovimiento } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { ChipOrden } from '@/components/inventario/chips-inventario'

export const metadata = { title: 'Movimientos — WMS LOGISALUD' }

/** «3 líneas: A-01.1 → B-02.1» cuando todas comparten origen y destino; si no, lista cada una. */
function resumenLineas(o: OrdenMovimiento) {
  const rutas = Array.from(new Set(o.lineas.map((l) => `${l.desde} → ${l.hacia}`)))
  const n = o.lineas.length
  return `${n} ${n === 1 ? 'línea' : 'líneas'}: ${rutas.join(' · ')}`
}

export default async function Movimientos() {
  const ctx = await exigirContexto()
  const ordenes = await repositorio().listarMovimientos()
  const mias = (o: OrdenMovimiento) => { const a = accionesDeOrden(o, ctx.usuario.id, ctx.roles); return a.autorizar || a.ejecutar || a.verificar || a.resolver }
  const porAtender = ordenes.filter(mias)
  const resto = ordenes.filter((o) => !mias(o))
  const Fila = ({ o }: { o: OrdenMovimiento }) => (
    <li>
      <Link href={`/movimientos/${o.id}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-gray-50" data-testid="fila-movimiento">
        <span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{o.numero}</span>
        <ChipOrden estado={o.estado} />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{o.motivo} · {resumenLineas(o)}</span>
        <span className="tabular text-sm text-gray-600">{formatoFechaHora(o.preparadoEn)}</span>
      </Link>
    </li>
  )
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Movimientos</h1>
          <p className="mt-1 text-gray-600">Cambiar un producto de lugar dentro del almacén: se prepara, el Jefe lo autoriza, alguien lo mueve y <strong>otra persona</strong> lo verifica. Mover no cambia el estado sanitario.</p>
        </div>
        {puedePrepararMovimiento(ctx.roles) && <Link href="/movimientos/nuevo" className="btn-primary" data-testid="nuevo-movimiento"><Plus className="h-5 w-5" aria-hidden />Preparar un movimiento</Link>}
      </header>
      {ordenes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="movimientos-vacio">
          <ArrowLeftRight className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Todavía no hay movimientos</p>
          <p className="mt-1 text-sm text-gray-600">Cuando alguien prepare uno, aparecerá aquí con su estado.</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="por-atender">
            <h2 id="por-atender" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Te toca a ti <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{porAtender.length}</span></h2>
            {porAtender.length === 0 ? <p className="mt-2 text-sm text-gray-600" data-testid="nada-por-atender">No tienes movimientos pendientes.</p> : <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="movimientos-por-atender">{porAtender.map((o) => <Fila key={o.id} o={o} />)}</ul>}
          </section>
          {resto.length > 0 && (
            <section aria-labelledby="otros">
              <h2 id="otros" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Los demás <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{resto.length}</span></h2>
              <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">{resto.map((o) => <Fila key={o.id} o={o} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
