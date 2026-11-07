'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronRight, Search } from 'lucide-react'
import type { OcPendiente } from '@/domain/entradas-vistas'

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Las líneas de la orden que todavía tienen saldo por recibir. */
const conSaldo = (o: OcPendiente) => o.items.filter((i) => i.saldo > 0)

/** ¿La orden coincide con lo que se escribió? Busca por número de OC, proveedor o producto (código o nombre), sin tildes ni mayúsculas. */
export function ocCoincide(o: OcPendiente, texto: string): boolean {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const pajar = sinTildes([o.codigo, o.proveedorNombre, o.proveedorRuc, ...conSaldo(o).flatMap((i) => [i.codigo, i.descripcion])].join(' '))
  return palabras.every((p) => pajar.includes(p))
}

/**
 * Elegir la orden de compra de una solicitud de ingreso: una fila por orden (OC, proveedor, productos y unidades por recibir). La flecha despliega el detalle
 * de sus productos sin elegirla; «Elegir» la selecciona. En el teléfono cada fila es una tarjeta compacta con el mismo despliegue.
 */
export function SelectorOrdenCompra({ ocs, ocId, onElegir }: { ocs: OcPendiente[]; ocId: string; onElegir: (id: string) => void }) {
  const [texto, setTexto] = useState('')
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set())
  const lista = useMemo(
    () => [...ocs].sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true })).filter((o) => ocCoincide(o, texto)),
    [ocs, texto],
  )
  const alternar = (id: string) => setAbiertas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="mt-3" data-testid="selector-oc">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por número de OC, proveedor o producto" aria-label="Buscar orden de compra"
          className="campo pl-10" data-testid="oc-buscar" />
      </div>
      <p className="mt-2 text-xs text-gray-600" role="status" data-testid="oc-conteo">
        {lista.length === ocs.length ? `${ocs.length} órdenes con saldo por recibir` : `${lista.length} de ${ocs.length} órdenes`}
      </p>

      {lista.length === 0 ? (
        <p className="mt-3 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700" data-testid="oc-sin-resultados">Ninguna orden coincide con «{texto}». Prueba con otro número, proveedor o producto.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="hidden grid-cols-[2.75rem_9rem_1fr_6rem_8rem_8rem] items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-700 md:grid" aria-hidden>
            <span /><span>Orden</span><span>Proveedor</span><span className="text-right">Productos</span><span className="text-right">Por recibir</span><span />
          </div>
          <ul role="radiogroup" aria-label="Órdenes de compra" className="divide-y divide-gray-100">
            {lista.map((o) => {
              const items = conSaldo(o)
              const unidades = items.reduce((t, i) => t + i.saldo, 0)
              const on = ocId === o.ocId
              const abierta = abiertas.has(o.ocId)
              const panel = `oc-detalle-${o.codigo}`
              return (
                <li key={o.ocId} className={on ? 'bg-green-50' : undefined} data-testid="oc-fila">
                  <div className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[2.75rem_9rem_1fr_6rem_8rem_8rem]">
                    <button type="button" onClick={() => alternar(o.ocId)} aria-expanded={abierta} aria-controls={panel} data-testid={`oc-detalle-boton-${o.codigo}`}
                      aria-label={`${abierta ? 'Ocultar' : 'Ver'} los productos de ${o.codigo}`}
                      className="row-span-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 md:row-span-1">
                      <ChevronRight className={`h-5 w-5 transition-transform duration-fast ${abierta ? 'rotate-90' : ''}`} aria-hidden />
                    </button>
                    <span className="font-medium text-gray-900">{o.codigo}</span>
                    <span className="col-start-2 row-start-2 min-w-0 truncate text-sm text-gray-700 md:col-start-auto md:row-start-auto">{o.proveedorNombre}</span>
                    <span className="tabular hidden text-right text-sm text-gray-800 md:block">{items.length}</span>
                    <span className="tabular hidden text-right text-sm font-medium text-gray-900 md:block">{unidades.toLocaleString('es-PE')} uds</span>
                    <span className="col-start-3 row-span-2 row-start-1 flex flex-col items-end gap-1 md:col-start-auto md:row-span-1 md:row-start-auto md:block md:text-right">
                      <span className="tabular text-xs text-gray-700 md:hidden">{items.length} prod. · {unidades.toLocaleString('es-PE')} uds</span>
                      <button type="button" role="radio" aria-checked={on} data-testid={`oc-${o.codigo}`} onClick={() => onElegir(o.ocId)}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition duration-fast ${on ? 'border-logisalud-green bg-logisalud-green text-white' : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400'}`}>
                        {on ? <><Check className="h-4 w-4" aria-hidden />Elegida</> : 'Elegir'}
                      </button>
                    </span>
                  </div>
                  {abierta && (
                    <div id={panel} className="border-t border-gray-100 bg-gray-50 px-3 py-3 md:pl-[3.75rem]" data-testid={`oc-detalle-${o.codigo}`}>
                      <table className="w-full text-sm">
                        <caption className="sr-only">Productos de {o.codigo} con saldo por recibir</caption>
                        <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-600"><th scope="col" className="py-1 pr-3 font-medium">Producto</th><th scope="col" className="py-1 text-right font-medium">Por recibir</th></tr></thead>
                        <tbody className="divide-y divide-gray-200">
                          {items.map((i) => (
                            <tr key={i.ocItemId}><td className="py-1.5 pr-3 text-gray-900">{i.descripcion}</td><td className="tabular py-1.5 text-right font-medium text-gray-900">{i.saldo.toLocaleString('es-PE')}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
