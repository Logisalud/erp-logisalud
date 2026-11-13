import { CircleCheck, TriangleAlert } from 'lucide-react'
import { formatoFecha } from '@/domain/fechas'
import { soles, textoAtraso, textoCantidadVencidos, TEXTO_AL_DIA, TEXTO_MOROSO, TITULO_AL_DIA, TITULO_MOROSO, type EstadoDePagos } from '@/domain/seguimiento'

/**
 * El estado de pagos del cliente (0068), debajo de la línea de tiempo del pedido: «¡Estás al día!» o sus documentos vencidos con el total.
 * Ícono + texto, nunca solo color. Sin datos de Cobranzas no se muestra nada (el que lo usa no lo pinta si `deuda` es null).
 */
export function EstadoDePagosCliente({ deuda }: { deuda: EstadoDePagos }) {
  if (deuda.estado === 'AL_DIA') {
    return (
      <section aria-labelledby="h-pagos" className="rounded-lg border border-green-200 bg-green-50 p-5" data-testid="estado-pagos" data-estado="AL_DIA">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 h-7 w-7 shrink-0 text-green-700" aria-hidden />
          <div>
            <h2 id="h-pagos" className="font-heading text-xl font-semibold tracking-wide text-green-950" data-testid="pagos-titulo">{TITULO_AL_DIA}</h2>
            <p className="mt-1 text-lg text-green-950">{TEXTO_AL_DIA}</p>
            <p className="mt-2 text-sm text-green-900">Información al <span className="tabular">{formatoFecha(deuda.al)}</span>.</p>
          </div>
        </div>
      </section>
    )
  }
  const faltan = deuda.cantidad - deuda.documentos.length
  return (
    <section aria-labelledby="h-pagos" className="rounded-lg border border-amber-300 bg-amber-50 p-5" data-testid="estado-pagos" data-estado="MOROSO">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-7 w-7 shrink-0 text-amber-800" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="h-pagos" className="font-heading text-xl font-semibold tracking-wide text-amber-950" data-testid="pagos-titulo">{TITULO_MOROSO}</h2>
          <p className="mt-1 text-lg text-amber-950">
            Total vencido <strong className="tabular font-semibold" data-testid="pagos-total">{soles(deuda.total)}</strong> · <span data-testid="pagos-cantidad">{textoCantidadVencidos(deuda.cantidad)}</span>
          </p>
          <ul className="mt-3 divide-y divide-amber-200 rounded-md border border-amber-200 bg-white" data-testid="pagos-documentos">
            {deuda.documentos.map((d) => (
              <li key={d.documento} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-3 py-2" data-testid={`pagos-documento-${d.documento}`}>
                <span className="tabular font-medium text-gray-900">{d.documento}</span>
                <span className="tabular text-right font-medium text-gray-900">{soles(d.saldo)}</span>
                <span className="text-sm text-gray-700">Venció el <span className="tabular">{formatoFecha(d.vence)}</span></span>
                <span className="text-right text-sm font-medium text-amber-950">{textoAtraso(d.dias)}</span>
              </li>
            ))}
          </ul>
          {faltan > 0 && <p className="mt-2 text-sm text-amber-950" data-testid="pagos-faltan">Y {textoCantidadVencidos(faltan)} más, de menor atraso.</p>}
          <p className="mt-3 text-amber-950">{TEXTO_MOROSO}</p>
          <p className="mt-2 text-sm text-amber-900">Información al <span className="tabular">{formatoFecha(deuda.al)}</span>.</p>
        </div>
      </div>
    </section>
  )
}
