import { CheckCircle2, Circle, TriangleAlert } from 'lucide-react'
import { lineaDeTiempo, type HitoVista } from '@/domain/seguimiento'

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

/** La línea de tiempo del pedido: cada paso con su fecha y hora si ya ocurrió. Ícono + texto, nunca solo color. Sin hora estimada, sin precios, lotes ni personal (el estado de pagos va aparte, debajo: `estado-de-pagos.tsx`). */
export function LineaDeTiempo({ pedido, hitos }: { pedido: string; hitos: HitoVista[] }) {
  const pasos = lineaDeTiempo(hitos)
  return (
    <section aria-labelledby="h-linea" className="rounded-lg border border-gray-200 bg-white p-5" data-testid="linea-de-tiempo">
      <h2 id="h-linea" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Pedido <span className="tabular">{pedido}</span></h2>
      <ol className="mt-4 space-y-4">
        {pasos.map((p) => (
          <li key={p.estado} className="flex gap-3" data-testid="paso-seguimiento" data-estado={p.estado} data-hecho={p.hecho}>
            {p.problema && p.hecho ? <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden /> : p.hecho ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-700" aria-hidden /> : <Circle className="mt-0.5 h-6 w-6 shrink-0 text-gray-300" aria-hidden />}
            <div>
              <p className={`font-medium ${p.hecho ? 'text-gray-900' : 'text-gray-500'}`}>{p.etiqueta}{p.actual && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-900">Estado actual</span>}</p>
              <p className="tabular text-sm text-gray-700">{p.en ? fechaHora(p.en) : 'Pendiente'}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
