import { FileText, TriangleAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { ocupacionPorPropietario } from '@/domain/panorama'
import { asignacionVigente, ETIQUETA_AREA } from '@/domain/zonas'
import { formatoFecha } from '@/domain/fechas'
import { vistaPropietario } from '@/components/propietarios-color'
import type { TipoArea } from '@/domain/tipos'

export const metadata = { title: 'Propietarios — WMS LOGISALUD' }

export default async function Propietarios() {
  const ctx = await exigirContexto()
  if (ctx.roles.every((r) => r === 'auxiliar')) redirect('/')
  const p = await repositorio().panorama()
  const ocup = ocupacionPorPropietario(p)
  const posPorId = new Map(p.posiciones.map((x) => [x.id, x]))
  const docPorId = new Map(p.documentos.map((d) => [d.id, d]))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Propietarios</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Todo saldo tiene un propietario. Cada ubicación se asigna con su vigencia y el documento que la respalda; cambiar una asignación nunca mueve stock por sí solo.</p>
      </header>

      <ul className="space-y-4">
        {ocup.map((o) => {
          const v = vistaPropietario(o.propietario.codigo)
          const asigs = p.asignaciones.filter((a) => a.propietarioId === o.propietario.id && asignacionVigente(a, p.hoy))
          const porArea = new Map<TipoArea, { n: number; doc?: string; porConfirmar: boolean; desde: string }>()
          for (const a of asigs) {
            const pos = posPorId.get(a.posicionId)
            if (!pos) continue
            const doc = a.documentoId ? docPorId.get(a.documentoId) : undefined
            const previo = porArea.get(pos.tipoArea)
            porArea.set(pos.tipoArea, { n: (previo?.n ?? 0) + 1, doc: doc?.titulo, porConfirmar: doc?.estadoConfirmacion === 'POR_CONFIRMAR' || !!previo?.porConfirmar, desde: a.desde })
          }
          return (
            <li key={o.propietario.id} className="card" data-testid={`propietario-${o.propietario.codigo}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-md text-lg font-bold text-white" style={{ background: v.color }}>{v.letra}</span>
                  <div>
                    <h2 className="font-heading text-xl font-semibold tracking-wide text-gray-900">{o.propietario.razonSocial}</h2>
                    <p className="text-sm text-gray-600">{o.propietario.esDuenoAlmacen ? 'Dueño del almacén · stock propio' : 'Cliente · guarda su mercadería'}{o.propietario.ruc ? ` · RUC ${o.propietario.ruc}` : ''}</p>
                  </div>
                </div>
                <p className="tabular text-right text-sm text-gray-700"><span className="block font-heading text-2xl font-semibold text-gray-900">{o.posiciones}</span>ubicaciones asignadas</p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-600">
                    <tr><th className="py-2 pr-4 font-semibold">Área</th><th className="py-2 pr-4 font-semibold">Ubicaciones</th><th className="py-2 pr-4 font-semibold">Vigente desde</th><th className="py-2 font-semibold">Documento</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...porArea.entries()].map(([area, d]) => (
                      <tr key={area}>
                        <td className="py-2 pr-4 text-gray-900">{ETIQUETA_AREA[area]}</td>
                        <td className="tabular py-2 pr-4">{d.n}</td>
                        <td className="py-2 pr-4">{formatoFecha(d.desde)}</td>
                        <td className="py-2">
                          <span className="inline-flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-gray-500" aria-hidden />{d.doc}
                            {d.porConfirmar && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900"><TriangleAlert className="h-3 w-3" aria-hidden />Firma por confirmar</span>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          )
        })}
      </ul>

      <section aria-labelledby="libres">
        <h2 id="libres" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Ubicaciones libres</h2>
        <p className="mt-1 text-sm text-gray-700">Las que no tienen propietario quedan libres hasta que se decida: {p.posiciones.filter((x) => x.porVerificar && !p.asignaciones.some((a) => a.posicionId === x.id)).map((x) => x.codigo).join(', ') || 'ninguna'}.</p>
      </section>
    </div>
  )
}
