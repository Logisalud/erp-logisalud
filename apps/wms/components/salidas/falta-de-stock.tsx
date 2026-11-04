import { PackageX, UserRound } from 'lucide-react'
import { ETIQUETA_CAUSA_FALTANTE, CAUSAS_FALTANTE, type FaltanteLineaVista } from '@/domain/faltante'
import { Aviso } from '../entradas/aviso'
import { BotonCopiarAviso } from './boton-copiar-aviso'

/**
 * Cuando falta stock (SA-3): por qué falta, línea por línea y con cantidades; quién decide (el vendedor, en Pedidos); las dos únicas decisiones; y el aviso listo para copiar.
 * El Jefe de Transporte lo ve y avisa; no cambia cantidades de un pedido de Pedidos.
 */
export function FaltaDeStock({ faltantes, vendedor, aviso, pedidoNumero }: { faltantes: FaltanteLineaVista[]; vendedor?: string; aviso?: string; pedidoNumero?: string }) {
  if (faltantes.length === 0) return null
  return (
    <section id="falta-stock" aria-labelledby="h-falta" className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4" data-testid="falta-de-stock">
      <h2 id="h-falta" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><PackageX className="h-6 w-6 text-red-800" aria-hidden />Falta stock</h2>
      <Aviso tipo="atencion" testid="falta-quien-decide">
        <p className="font-medium"><UserRound className="mr-1 inline h-4 w-4" aria-hidden />Decide el vendedor{vendedor ? ` ${vendedor}` : ' del pedido'}, con el cliente y en Pedidos{pedidoNumero ? ` (${pedidoNumero})` : ''}.</p>
        <p className="mt-1">Solo hay dos caminos: <strong>quitar o reducir la línea</strong> (lo que falta se cancela, no queda pendiente) o <strong>cancelar el pedido</strong>. Aquí no se cambian cantidades: cuando Pedidos mande el cambio, la orden se actualiza sola.</p>
      </Aviso>
      <ul className="space-y-2" data-testid="faltantes">
        {faltantes.map((f) => (
          <li key={f.lineaId} className="rounded-md border border-gray-200 bg-white p-3" data-testid="faltante-linea">
            <p className="font-medium text-gray-900">{f.producto} <span className="tabular text-sm font-normal text-gray-600">{f.productoCodigo}</span></p>
            <p className="mt-1 text-sm text-gray-800" data-testid="faltante-texto">{f.explicacion.texto}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              {CAUSAS_FALTANTE.filter((c) => f.explicacion.causas[c] > 0).map((c) => (
                <div key={c}><dt className="text-xs text-gray-600 first-letter:uppercase">{ETIQUETA_CAUSA_FALTANTE[c]}</dt><dd className="tabular font-medium text-gray-900" data-testid={`causa-${c}`}>{f.explicacion.causas[c].toLocaleString('es-PE')} u</dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {aviso && (
        <div className="space-y-2">
          <p className="text-sm text-gray-800">Mientras Pedidos y el WMS no estén conectados, avísale al vendedor con este mensaje:</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-900" data-testid="aviso-vendedor-texto">{aviso}</pre>
          <BotonCopiarAviso texto={aviso} testid="copiar-aviso-orden" />
        </div>
      )}
    </section>
  )
}
