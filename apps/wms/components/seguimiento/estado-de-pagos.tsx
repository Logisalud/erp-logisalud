import { CalendarClock, CircleCheck } from 'lucide-react'
import { formatoFecha } from '@/domain/fechas'
import { soles, textoAtraso, textoCantidadVencidos, TEXTO_AL_DIA, TEXTO_INTRO_MOROSO, TEXTO_MOROSO, TITULO_AL_DIA, TITULO_MOROSO, type EstadoDePagos } from '@/domain/seguimiento'

/**
 * El estado de pagos del cliente (0068), debajo de la línea de tiempo del pedido: «¡Estás al día!» o una tabla simple de sus documentos pendientes.
 * Tono tranquilo: sin colores de alarma ni palabras duras; la tabla dice qué documento, cuándo venció, cuántos días lleva y cuánto falta. Ícono + texto, nunca solo color.
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
    <section aria-labelledby="h-pagos" className="rounded-lg border border-gray-200 bg-white p-5" data-testid="estado-pagos" data-estado="MOROSO">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-7 w-7 shrink-0 text-gray-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="h-pagos" className="font-heading text-xl font-semibold tracking-wide text-gray-900" data-testid="pagos-titulo">{TITULO_MOROSO}</h2>
          <p className="mt-1 text-gray-700">{TEXTO_INTRO_MOROSO}</p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm sm:text-base" data-testid="pagos-documentos">
          <caption className="sr-only">Documentos pendientes de pago al {formatoFecha(deuda.al)}</caption>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Documento</th>
              <th scope="col" className="px-3 py-2 font-semibold">Venció</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Atraso</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deuda.documentos.map((d) => (
              <tr key={d.documento} data-testid={`pagos-documento-${d.documento}`}>
                <td className="tabular whitespace-nowrap px-3 py-2.5 font-medium text-gray-900">{d.documento}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-gray-800">{formatoFecha(d.vence)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-gray-800">{textoAtraso(d.dias)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-medium text-gray-900">{soles(d.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50">
            <tr>
              <th scope="row" colSpan={3} className="px-3 py-2.5 text-left font-semibold text-gray-900">Total <span className="font-normal text-gray-700" data-testid="pagos-cantidad">· {textoCantidadVencidos(deuda.cantidad)}</span></th>
              <td className="tabular whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900" data-testid="pagos-total">{soles(deuda.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {faltan > 0 && <p className="mt-2 text-sm text-gray-700" data-testid="pagos-faltan">Y {textoCantidadVencidos(faltan)} más, de menor atraso (incluidos en el total).</p>}
      <p className="mt-3 text-gray-800">{TEXTO_MOROSO}</p>
      <p className="mt-2 text-sm text-gray-600">Información al <span className="tabular">{formatoFecha(deuda.al)}</span>.</p>
    </section>
  )
}
