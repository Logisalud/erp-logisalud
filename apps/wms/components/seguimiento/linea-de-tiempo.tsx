import { CheckCircle2, Circle, TriangleAlert } from 'lucide-react'
import { lineaDeTiempo, type HitoVista } from '@/domain/seguimiento'

const hora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' })

/**
 * La línea de tiempo del pedido (0069): 5 pasos cortos, cada uno cumplido con su hora; el actual se resalta con un latido suave (solo con `motion-safe:`: con «reducir movimiento» no se mueve).
 * Ícono + texto, nunca solo color. Sin hora estimada. Sin precios, lotes ni personal.
 */
export function LineaDeTiempo({ hitos, tieneParada = true }: { hitos: HitoVista[]; tieneParada?: boolean }) {
  const pasos = lineaDeTiempo(hitos, tieneParada)
  return (
    <ol className="space-y-0" data-testid="linea-de-tiempo" aria-label="Pasos de tu pedido">
      {pasos.map((p, i) => (
        <li key={p.estado} className="flex gap-3" data-testid="paso-seguimiento" data-estado={p.estado} data-hecho={p.hecho} data-actual={p.actual} aria-current={p.actual ? 'step' : undefined}>
          <div className="flex flex-col items-center">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${p.actual ? (p.problema ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800 motion-safe:animate-latido') : p.hecho ? 'text-green-700' : 'text-gray-400'}`} data-testid={p.actual ? 'paso-actual' : undefined}>
              {p.problema && p.hecho ? <TriangleAlert className="h-6 w-6" aria-hidden /> : p.hecho ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <Circle className="h-6 w-6" aria-hidden />}
            </span>
            {i < pasos.length - 1 && <span aria-hidden className={`my-0.5 w-0.5 flex-1 ${p.hecho && pasos[i + 1].hecho ? 'bg-green-300' : 'bg-gray-200'}`} style={{ minHeight: '1.25rem' }} />}
          </div>
          <div className="pb-4">
            <p className={`text-lg leading-8 ${p.actual ? 'font-semibold text-gray-900' : p.hecho ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
              {p.etiqueta}{p.actual && <span className="sr-only"> (paso actual)</span>}
            </p>
            <p className="tabular text-sm text-gray-700">{p.en ? hora(p.en) : <span className="text-gray-500">Pendiente</span>}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
