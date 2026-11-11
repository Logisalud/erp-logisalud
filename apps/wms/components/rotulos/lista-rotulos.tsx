'use client'

import { useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { puntaje } from '@/domain/busqueda'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { MAXIMO_ROTULOS, ROTULO_CODIGO, codificarPedido, fechaDDMMAAAA, textoVencimiento, totalRotulos, validarPedidoRotulos, type CajaSaldo } from '@/domain/rotulos'
import { hoyEnLima } from '@/domain/fechas'

/**
 * «Rótulos de caja saldo» (LS.ET.07): se eligen las cajas y salen los rótulos con todo lo que el sistema sabe. La CANTIDAD de cada conteo y la FIRMA quedan en blanco para hacerlas a mano;
 * la fecha de conteo viene con el día de hoy.
 */
export function ListaRotulos({ cajas }: { cajas: CajaSaldo[] }) {
  const [q, setQ] = useState('')
  const [copias, setCopias] = useState<Record<string, number>>({})
  const visibles = useMemo(() => {
    const t = q.trim()
    const f = t ? cajas.filter((c) => Math.max(puntaje(t, c.producto), puntaje(t, c.productoCodigo), puntaje(t, c.lote), puntaje(t, c.registroSanitario ?? '')) > 0) : cajas
    return f.slice(0, 120)
  }, [cajas, q])
  const pedido = Object.entries(copias).filter(([, n]) => n > 0).map(([clave, n]) => ({ clave, copias: n }))
  const total = totalRotulos(pedido)
  const error = validarPedidoRotulos(pedido)
  const poner = (clave: string, n: number) => setCopias((m) => ({ ...m, [clave]: Math.max(0, Math.min(20, n)) }))

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="rotulos">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Rótulos de caja saldo</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Formato {ROTULO_CODIGO} «Status del producto (cajas saldo)». Elige las cajas: el rótulo sale con el cliente (Logisalud, Diphasac, AJR, Medic Pharma…), el producto, el R.S., el lote, el vencimiento y el status. <strong>La cantidad y la firma quedan en blanco</strong> para llenarlas a mano; la fecha del conteo viene con el día de hoy ({fechaDDMMAAAA(hoyEnLima())}).</p>
      </header>

      <div className="relative">
        <label htmlFor="rot-q" className="sr-only">Buscar producto, lote o registro sanitario</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
        <input id="rot-q" className="campo pl-10" placeholder="Producto, código, lote o R.S.…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="rotulos-buscar" />
      </div>

      {cajas.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-gray-700" data-testid="rotulos-vacio">No hay stock para rotular.</p>
      ) : visibles.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-gray-700" data-testid="rotulos-sin-resultados">No encontramos cajas con eso. Prueba con el código o el lote.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white" data-testid="rotulos-lista">
          {visibles.map((c) => (
            <li key={c.clave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid="rotulo-caja">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-gray-900">{c.producto} <span className="tabular text-sm font-normal text-gray-600">{c.productoCodigo}</span></p>
                <p className="tabular text-sm text-gray-700">Lote <strong>{c.lote}</strong> · vence {textoVencimiento(c) || '—'} · {ETIQUETA_ESTADO[c.estado]} · {c.propietario} · R.S. {c.registroSanitario ?? 'sin dato'}</p>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={`Rótulos de ${c.producto}, lote ${c.lote}`}>
                <button type="button" className="btn-secondary btn-sm !min-w-11" onClick={() => poner(c.clave, (copias[c.clave] ?? 0) - 1)} aria-label="Uno menos" disabled={!(copias[c.clave] > 0)}>−</button>
                <span className="tabular w-8 text-center text-lg font-semibold" data-testid="rotulo-copias" aria-live="polite">{copias[c.clave] ?? 0}</span>
                <button type="button" className="btn-secondary btn-sm !min-w-11" onClick={() => poner(c.clave, (copias[c.clave] ?? 0) + 1)} aria-label="Uno más" data-testid="rotulo-mas">+</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cajas.length > visibles.length && !q.trim() && <p className="text-sm text-gray-600">Se muestran las primeras {visibles.length}: busca para ver el resto.</p>}

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm" data-testid="rotulos-barra">
        <p className="text-sm text-gray-800" data-testid="rotulos-total">{total === 0 ? 'Elige cuántos rótulos de cada caja.' : `${total} ${total === 1 ? 'rótulo' : 'rótulos'} (${Math.ceil(total / 2)} ${Math.ceil(total / 2) === 1 ? 'hoja' : 'hojas'} A4, dos por hoja; máximo ${MAXIMO_ROTULOS})`}</p>
        <a href={error ? undefined : `/wms/rotulos/pdf?p=${encodeURIComponent(codificarPedido(pedido))}`} target="_blank" rel="noopener noreferrer" aria-disabled={!!error}
          className={`btn-primary ${error ? 'pointer-events-none opacity-50' : ''}`} data-testid="rotulos-imprimir"><Printer className="h-5 w-5" aria-hidden />Imprimir los rótulos</a>
      </div>
    </div>
  )
}
