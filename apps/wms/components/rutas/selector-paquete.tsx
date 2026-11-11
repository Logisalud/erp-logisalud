'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import type { PedidoParaPaquete } from '@/domain/documentacion'

/** El paquete documental de la ruta con una casilla por pedido (marcado de entrada si su cliente pide documentos). Sale un solo PDF con lo marcado. */
export function SelectorPaquete({ rutaId, pedidos }: { rutaId: string; pedidos: PedidoParaPaquete[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(pedidos.filter((p) => p.marcado).map((p) => p.salidaId)))
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const n = marcados.size
  const href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/rutas/${rutaId}/paquete?s=${encodeURIComponent(pedidos.filter((p) => marcados.has(p.salidaId)).map((p) => p.salidaId).join(','))}`
  return (
    <fieldset className="space-y-2 rounded-md border border-gray-200 p-3" data-testid="paquete-seleccion">
      <legend className="px-1 text-sm font-medium text-gray-900">Paquete documental: ¿de qué pedidos?</legend>
      <p className="text-sm text-gray-600">Vienen marcados los pedidos cuyo cliente pide documentos; marca o desmarca los que necesites.</p>
      <ul className="divide-y divide-gray-100">
        {pedidos.map((p) => (
          <li key={p.salidaId}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={marcados.has(p.salidaId)} onChange={() => alternar(p.salidaId)} data-testid="paquete-casilla" />
              <span className="min-w-0 flex-1 text-sm text-gray-900">
                <span className="tabular font-medium">{p.pedidoNumero ?? p.salidaNumero}</span>{p.cliente ? ` · ${p.cliente}` : ''}
                <span className="block text-xs text-gray-600">{p.exige ? `Pide: ${p.exige}` : 'Su cliente no pide documentos'}{p.exige && !p.completo ? ' · le faltan documentos' : ''}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <a href={n === 0 ? undefined : href} target="_blank" rel="noopener" aria-disabled={n === 0} className={`btn-secondary ${n === 0 ? 'pointer-events-none opacity-50' : ''}`} data-testid="paquete-ruta">
        <FileText className="h-5 w-5" aria-hidden />{n === 0 ? 'Marca al menos un pedido' : `Imprimir el paquete (${n} ${n === 1 ? 'pedido' : 'pedidos'})`}
      </a>
    </fieldset>
  )
}
