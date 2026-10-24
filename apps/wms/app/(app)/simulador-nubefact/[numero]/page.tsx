import { notFound } from 'next/navigation'
import { FlaskConical } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { modoNubefactActual } from '@/services/nubefact/cliente'
import { guiaSimulada } from '@/services/nubefact/simulador'

export const metadata = { title: 'Guía simulada — WMS LOGISALUD' }

/** El «PDF» de una guía emitida con el simulador de Nubefact: sirve para revisar qué se habría enviado. No existe ante SUNAT. */
export default async function GuiaSimuladaPagina({ params, searchParams }: { params: { numero: string }; searchParams: { formato?: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles) || modoNubefactActual() !== 'SIMULADOR') notFound()
  const g = guiaSimulada(params.numero)
  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="guia-simulada">
      <header>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-800"><FlaskConical className="h-4 w-4" aria-hidden />Simulador: esta guía no existe ante SUNAT</p>
        <h1 className="tabular mt-2 font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Guía de remisión {params.numero.toUpperCase()}</h1>
      </header>
      {!g
        ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-gray-800" data-testid="guia-simulada-perdida">El simulador ya no tiene esta guía en memoria (se reinicia al reiniciar el servidor). La guía sigue registrada en la salida.</p>
        : searchParams.formato === 'xml'
          ? <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-900">{`<DespatchAdvice>\n  <ID>${g.numero}</ID>\n  <IssueDate>${g.emitidaEn.slice(0, 10)}</IssueDate>\n  <!-- XML simulado -->\n</DespatchAdvice>`}</pre>
          : (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-900">
              <p><strong>Destinatario:</strong> {g.payload.cliente_denominacion} · RUC {g.payload.cliente_numero_de_documento}</p>
              <p><strong>Llegada:</strong> {g.payload.punto_de_llegada_direccion} (ubigeo {g.payload.punto_de_llegada_ubigeo})</p>
              <p><strong>Partida:</strong> {g.payload.punto_de_partida_direccion} (ubigeo {g.payload.punto_de_partida_ubigeo})</p>
              <p><strong>Traslado:</strong> inicia {g.payload.fecha_de_inicio_de_traslado} · {g.payload.numero_de_bultos} bultos · {g.payload.peso_bruto_total} kg · placa {g.payload.transportista_placa_numero} · conductor {g.payload.conductor_nombre}</p>
              <ul className="tabular space-y-0.5">{g.payload.items.map((i, k) => <li key={k}>{i.codigo} · {i.descripcion} · {i.cantidad} u</li>)}</ul>
              <p className="text-gray-700">{g.payload.observaciones}</p>
            </div>
          )}
    </div>
  )
}
