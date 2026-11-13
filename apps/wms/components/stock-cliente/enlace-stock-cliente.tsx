'use client'

import { useState } from 'react'
import { Check, Copy, Link2, ShieldAlert } from 'lucide-react'
import { crearEnlaceStockClienteAccion, revocarEnlaceStockClienteAccion } from '@/app/acciones-stock-cliente'
import { formatoFechaHora } from '@/domain/fechas'
import { direccionDeStockCliente, ETIQUETA_ESTADO_ENLACE, VIGENCIAS_ENLACE, type EnlaceStockVista } from '@/domain/stock-cliente'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const COLOR_ESTADO = { VIGENTE: 'border-green-200 bg-green-50 text-green-800', VENCIDO: 'border-gray-200 bg-gray-100 text-gray-700', REVOCADO: 'border-red-200 bg-red-50 text-red-800' } as const

/** En «Propietarios», por cliente: generar el enlace de su página de stock (solo lectura), copiarlo la única vez que se muestra y revocar los que ya no deben valer. */
export function EnlaceStockCliente({ propietarioId, cliente, enlaces, prefijo }: { propietarioId: string; cliente: string; enlaces: EnlaceStockVista[]; prefijo: string }) {
  const { ejecutar, pendiente, mensaje } = useAccion()
  const [dias, setDias] = useState(90)
  const [etiqueta, setEtiqueta] = useState('')
  const [nuevo, setNuevo] = useState<{ url: string; venceEn: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const generar = () => ejecutar(() => crearEnlaceStockClienteAccion(propietarioId, dias, etiqueta), {
    alExito: (r) => { setNuevo({ url: direccionDeStockCliente(window.location.origin, prefijo, r.token), venceEn: r.venceEn }); setEtiqueta(''); setCopiado(false) },
  })
  const copiar = async () => { if (!nuevo) return; try { await navigator.clipboard.writeText(nuevo.url); setCopiado(true) } catch { setCopiado(false) } }

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4" data-testid={`enlace-stock-${propietarioId}`}>
      <h3 className="flex items-center gap-2 font-heading text-lg font-medium tracking-wide text-gray-900"><Link2 className="h-5 w-5 text-gray-600" aria-hidden />Enlace de stock de {cliente}</h3>
      <p className="mt-1 max-w-3xl text-sm text-gray-700">Con este enlace el cliente ve su stock por producto y lote (sin ubicaciones), lo que vence y descarga su Kardex. Solo lectura: no puede crear ni cambiar nada. Cada enlace se puede revocar.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`et-${propietarioId}`} className="etiqueta">Para quién es (opcional)</label>
          <input id={`et-${propietarioId}`} className="campo" value={etiqueta} maxLength={80} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Por ejemplo: Compras de AJR" autoComplete="off" data-testid="enlace-etiqueta" />
        </div>
        <div>
          <label htmlFor={`vig-${propietarioId}`} className="etiqueta">Vale por</label>
          <select id={`vig-${propietarioId}`} className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))} data-testid="enlace-vigencia">
            {VIGENCIAS_ENLACE.map((v) => <option key={v.dias} value={v.dias}>{v.texto}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={generar} disabled={pendiente} data-testid="enlace-generar"><Link2 className="h-5 w-5" aria-hidden />{pendiente ? 'Generando…' : 'Generar enlace'}</button>
      </div>

      {mensaje?.tipo === 'error' && <div className="mt-3"><Aviso tipo="error" testid="enlace-error">{mensaje.texto}</Aviso></div>}

      {nuevo && (
        <div className="mt-3 space-y-2 rounded-md border border-green-200 bg-white p-3" role="status" data-testid="enlace-nuevo">
          <p className="flex items-center gap-2 text-sm font-medium text-green-900"><Check className="h-4 w-4" aria-hidden />Enlace listo. Vale hasta el {formatoFechaHora(nuevo.venceEn)}.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={nuevo.url} className="campo tabular min-w-0 flex-1 text-sm" aria-label="Enlace de stock del cliente" onFocus={(e) => e.currentTarget.select()} data-testid="enlace-url" />
            <button type="button" className="btn-secondary" onClick={copiar} data-testid="enlace-copiar"><Copy className="h-5 w-5" aria-hidden />{copiado ? 'Copiado' : 'Copiar enlace'}</button>
          </div>
          <p className="flex items-start gap-2 text-sm text-amber-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Cópialo ahora: por seguridad no se vuelve a mostrar. Si lo pierdes, genera otro y revoca este.</p>
        </div>
      )}

      {enlaces.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm" data-testid="enlaces-lista">
            <caption className="sr-only">Enlaces de stock de {cliente}</caption>
            <thead className="text-xs uppercase tracking-wide text-gray-600"><tr>
              <th scope="col" className="py-2 pr-3 font-semibold">Enlace</th><th scope="col" className="py-2 pr-3 font-semibold">Estado</th><th scope="col" className="py-2 pr-3 font-semibold">Vale hasta</th><th scope="col" className="py-2 pr-3 font-semibold">Última vez abierto</th><th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {enlaces.map((e) => (
                <tr key={e.id} data-testid={`enlace-${e.estado}`}>
                  <td className="py-2 pr-3 text-gray-900">{e.etiqueta ?? 'Sin nombre'}<span className="block text-xs text-gray-600">Creado {formatoFechaHora(e.creadoEn)}</span></td>
                  <td className="py-2 pr-3"><span className={`${chip} ${COLOR_ESTADO[e.estado]}`}>{ETIQUETA_ESTADO_ENLACE[e.estado]}</span></td>
                  <td className="tabular py-2 pr-3">{formatoFechaHora(e.venceEn)}</td>
                  <td className="tabular py-2 pr-3">{e.ultimaVistaEn ? formatoFechaHora(e.ultimaVistaEn) : 'Todavía no lo abrió'}</td>
                  <td className="py-2 text-right">{e.estado === 'VIGENTE' && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => revocarEnlaceStockClienteAccion(e.id), { exito: 'Enlace revocado: ya no abre.' })} data-testid="enlace-revocar">Revocar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
