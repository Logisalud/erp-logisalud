'use client'

import { useEffect, useMemo, useRef } from 'react'
import { CheckCircle2, CircleAlert, Loader2, Plus, Trash2 } from 'lucide-react'
import { lotesParaSalidaAccion, validarLineaConLoteAccion } from '@/app/acciones-salida-manual'
import { MOTIVOS_B, lotesPreferibles, propuestaFefo, type LoteParaSalida, type ProductoHallado } from '@/domain/salida-manual'
import { ETIQUETA_MOTIVO_SALIDA, mesAnio, type MotivoSalida } from '@/domain/salidas'
import { SelectorProductoSalida } from './selector-producto-salida'

export type ModoLinea = 'A' | 'B' | 'MUESTRA' | 'DEVOLUCION'

export interface ValidacionLinea { estado: 'pendiente' | 'validando' | 'ok' | 'error'; mensaje?: string; campo?: string; vence?: string | null; loteId?: string }
export interface LineaForm {
  clave: number
  producto: ProductoHallado | null
  cantidad: string
  /** B y devolución al proveedor: el lote como está en la guía. */
  loteCodigo: string
  /** B: cada línea trae su motivo. */
  motivo: MotivoSalida | ''
  /** A: el lote que se prefirió en lugar del que propone FEFO ('' = el propuesto). */
  eleccion: string
  lotes: LoteParaSalida[] | null
  validacion: ValidacionLinea
}
export const lineaVacia = (clave: number): LineaForm => ({ clave, producto: null, cantidad: '', loteCodigo: '', motivo: '', eleccion: '', lotes: null, validacion: { estado: 'pendiente' } })

const normal = (s: string) => s.trim().toLowerCase()
const fechaCorta = (v: string | null | undefined) => (v ? mesAnio(v) : 'sin fecha')

export interface ContextoLineas { modo: ModoLinea; propietarioId: string; hoy: string; errores: Record<string, string> }

/** Cuánto piden de un mismo lote las líneas anteriores (para que varias líneas de un lote no se pasen del disponible). */
export function yaPedidoDelLote(lineas: readonly LineaForm[], indice: number): number {
  const l = lineas[indice]
  if (!l.producto || !l.loteCodigo.trim()) return 0
  return lineas.slice(0, indice).filter((x) => x.producto?.id === l.producto!.id && normal(x.loteCodigo) === normal(l.loteCodigo)).reduce((t, x) => t + (Number(x.cantidad) || 0), 0)
}

function Estado({ v }: { v: ValidacionLinea }) {
  if (v.estado === 'validando') return <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600" role="status" data-testid="validacion-linea" data-estado="validando"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Revisando el lote…</p>
  if (v.estado === 'ok') return <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-green-800" role="status" data-testid="validacion-linea" data-estado="ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />El lote sirve para esta salida</p>
  if (v.estado === 'error') return <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-red-800" role="alert" data-testid="validacion-linea" data-estado="error"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{v.mensaje}</span></p>
  return null
}

function FilaLinea({ l, i, ctx, ya, actualizar, quitar, puedeQuitar }: {
  l: LineaForm; i: number; ctx: ContextoLineas; ya: number; actualizar: (clave: number, parche: Partial<LineaForm>) => void; quitar: (clave: number) => void; puedeQuitar: boolean
}) {
  const { modo, propietarioId, hoy } = ctx
  const conLote = modo === 'B' || modo === 'DEVOLUCION'
  const version = useRef(0)
  const cantidad = Number(l.cantidad)
  const err = (k: string) => ctx.errores[`${k}-${l.clave}`]

  // Los lotes del producto (para proponer FEFO o sugerir el lote de la guía)
  useEffect(() => {
    if (!l.producto || !propietarioId) { if (l.lotes) actualizar(l.clave, { lotes: null }); return }
    let vivo = true
    lotesParaSalidaAccion(propietarioId, l.producto.id).then((r) => { if (vivo) actualizar(l.clave, { lotes: r }) })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.producto?.id, propietarioId])

  // La validación inmediata del lote (el dominio puro dice lo mismo que la base de datos)
  const motivoEfectivo: MotivoSalida | '' = modo === 'B' ? l.motivo : modo === 'DEVOLUCION' ? 'DEVOLUCION_PROVEEDOR' : ''
  const clave = `${l.producto?.id}|${l.loteCodigo}|${l.cantidad}|${motivoEfectivo}|${propietarioId}|${ya}`
  useEffect(() => {
    if (!conLote) return
    if (!l.producto || !l.loteCodigo.trim() || !(cantidad > 0) || !motivoEfectivo) { actualizar(l.clave, { validacion: { estado: 'pendiente' } }); return }
    const n = ++version.current
    actualizar(l.clave, { validacion: { estado: 'validando' } })
    const t = setTimeout(async () => {
      const r = await validarLineaConLoteAccion({ propietarioId, productoId: l.producto!.id, loteCodigo: l.loteCodigo, cantidad, motivo: motivoEfectivo, yaPedidoDelLote: ya })
      if (n === version.current) actualizar(l.clave, { validacion: r.ok ? { estado: 'ok', vence: r.vence, loteId: r.lote.loteId } : { estado: 'error', mensaje: r.mensaje, campo: r.campo } })
    }, 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, conLote])

  const propuesta = useMemo(() => (!conLote && l.lotes && cantidad > 0 ? propuestaFefo(modo === 'A' ? 'DISTRIBUCION' : 'MUESTRA', cantidad, hoy, l.lotes) : null), [conLote, l.lotes, cantidad, modo, hoy])
  const preferibles = useMemo(() => (modo === 'A' && l.lotes && cantidad > 0 ? lotesPreferibles(cantidad, hoy, l.lotes) : []), [modo, l.lotes, cantidad, hoy])
  const elegido = preferibles.find((x) => x.loteId === l.eleccion)

  const celda = 'block py-1.5 md:table-cell md:px-2 md:py-2.5 md:align-top'
  const et = (t: string) => <span className="etiqueta md:hidden">{t}</span>
  const campoCantidad = (
    <>
      {et('Cantidad')}
      <label htmlFor={`cant-${l.clave}`} className="sr-only">Cantidad de la línea {i + 1}</label>
      <input id={`cant-${l.clave}`} className={`campo tabular md:w-24 ${err('cantidad') || (l.validacion.estado === 'error' && l.validacion.campo === 'cantidad') ? '!border-red-500' : ''}`} inputMode="numeric" value={l.cantidad} autoComplete="off"
        onChange={(e) => actualizar(l.clave, { cantidad: e.target.value.replace(/[^\d]/g, '') })} data-testid="cantidad-linea-orden" />
      {err('cantidad') && <p role="alert" className="mt-1 text-xs text-red-700">{err('cantidad')}</p>}
    </>
  )

  return (
    <tr className="mb-3 block rounded-lg border border-gray-200 bg-gray-50 p-3 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0" data-testid="fila-linea-orden">
      <td className={`${celda} md:w-[28%]`}>
        {et(`Producto ${i + 1}`)}
        <SelectorProductoSalida id={`prod-${l.clave}`} valor={l.producto} propietarioId={modo === 'B' ? propietarioId : undefined} error={err('producto')}
          onElegir={(p) => actualizar(l.clave, { producto: p, lotes: null, eleccion: '', validacion: { estado: 'pendiente' } })} />
        {err('producto') && <p role="alert" className="mt-1 text-xs text-red-700">{err('producto')}</p>}
      </td>

      {conLote ? (
        <>
          <td className={`${celda} md:w-[22%]`}>
            {et('Lote de la guía')}
            <label htmlFor={`lote-${l.clave}`} className="sr-only">Lote de la línea {i + 1}, como está en la guía</label>
            <input id={`lote-${l.clave}`} className={`campo ${l.validacion.estado === 'error' && l.validacion.campo === 'lote' ? '!border-red-500' : ''}`} value={l.loteCodigo} list={`lotes-${l.clave}`} autoComplete="off" placeholder="Como está en la guía"
              onChange={(e) => actualizar(l.clave, { loteCodigo: e.target.value })} data-testid="lote-linea-orden" />
            <datalist id={`lotes-${l.clave}`}>{(l.lotes ?? []).map((x) => <option key={x.loteId} value={x.codigo}>{`vence ${fechaCorta(x.vence)}`}</option>)}</datalist>
            <Estado v={l.validacion} />
          </td>
          <td className={`${celda} md:w-[10%]`}>
            {et('Vence')}
            <p className="tabular py-2 text-sm text-gray-900" data-testid="vence-linea-orden">{l.validacion.estado === 'ok' ? fechaCorta(l.validacion.vence) : <span className="text-gray-500">Se completa al elegir el lote</span>}</p>
          </td>
          <td className={`${celda} md:w-[10%]`}>{campoCantidad}</td>
          {modo === 'B' && (
            <td className={`${celda} md:w-[16%]`}>
              {et('Motivo')}
              <label htmlFor={`motivo-${l.clave}`} className="sr-only">Motivo de la línea {i + 1}</label>
              <select id={`motivo-${l.clave}`} className={`campo ${err('motivo') ? '!border-red-500' : ''}`} value={l.motivo} onChange={(e) => actualizar(l.clave, { motivo: e.target.value as MotivoSalida })} data-testid="motivo-linea-orden">
                <option value="">Elige…</option>
                {MOTIVOS_B.map((m) => <option key={m} value={m}>{ETIQUETA_MOTIVO_SALIDA[m]}</option>)}
              </select>
              {err('motivo') && <p role="alert" className="mt-1 text-xs text-red-700">{err('motivo')}</p>}
            </td>
          )}
        </>
      ) : (
        <>
          <td className={`${celda} md:w-[12%]`}>{campoCantidad}</td>
          <td className={`${celda}`}>
            {et('Lote y vencimiento')}
            {!l.producto || !(cantidad > 0) ? <p className="py-2 text-sm text-gray-500">Elige el producto y la cantidad: el sistema propone el lote por vencimiento.</p>
              : !l.lotes ? <p className="flex items-center gap-1.5 py-2 text-sm text-gray-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Buscando lotes…</p>
              : propuesta?.ok ? (
                <div data-testid="propuesta-fefo">
                  <p className="text-xs font-medium text-gray-600">{elegido ? 'Lote que elegiste' : 'Propuesta por vencimiento (FEFO)'}</p>
                  <ul className="mt-0.5 space-y-0.5 text-sm text-gray-900">
                    {(elegido ? [{ loteId: elegido.loteId, codigo: elegido.codigo, vence: elegido.vence, cantidad }] : propuesta.asignaciones).map((a) => (
                      <li key={a.loteId} className="tabular">{a.codigo} <span className="text-gray-600">· vence {fechaCorta(a.vence)}</span> × <strong>{a.cantidad.toLocaleString('es-PE')}</strong></li>
                    ))}
                  </ul>
                  {modo === 'A' && preferibles.length > 0 && (
                    <div className="mt-2">
                      <label htmlFor={`eleccion-${l.clave}`} className="text-xs font-medium text-gray-700">¿Prefieres otro lote?</label>
                      <select id={`eleccion-${l.clave}`} className="campo mt-0.5" value={l.eleccion} onChange={(e) => actualizar(l.clave, { eleccion: e.target.value })} data-testid="elegir-lote-linea">
                        <option value="">El que propone el sistema</option>
                        {preferibles.map((x) => <option key={x.loteId} value={x.loteId}>{x.codigo} · vence {fechaCorta(x.vence)} · {x.disponibleAprobado.toLocaleString('es-PE')} disponibles</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <p className="flex items-start gap-1.5 py-1 text-sm text-amber-900" role="status" data-testid="sin-stock-linea"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{propuesta?.mensaje}. La orden se crea igual y queda «Sin stock»: {modo === 'A' ? 'decide el vendedor del pedido.' : 'espera el ingreso de stock.'}</span></p>
              )}
          </td>
        </>
      )}

      <td className={`${celda} md:w-12 md:text-right`}>
        {puedeQuitar && <button type="button" onClick={() => quitar(l.clave)} aria-label={`Quitar la línea ${i + 1}`} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-200" data-testid="quitar-linea-orden"><Trash2 className="h-5 w-5" aria-hidden /></button>}
      </td>
    </tr>
  )
}

/** La tabla de líneas: tabla en PC y tablet; en el teléfono cada línea es una tarjeta (mismas funciones, otra presentación). */
export function TablaLineasOrden({ lineas, ctx, actualizar, quitar, agregar }: {
  lineas: LineaForm[]; ctx: ContextoLineas; actualizar: (clave: number, parche: Partial<LineaForm>) => void; quitar: (clave: number) => void; agregar: () => void
}) {
  const { modo } = ctx
  const cabeza = modo === 'B' || modo === 'DEVOLUCION'
    ? ['Producto', 'Lote de la guía', 'Vence', 'Cantidad', ...(modo === 'B' ? ['Motivo'] : [])]
    : ['Producto', 'Cantidad', 'Lote y vencimiento']
  return (
    <div className="space-y-3" data-testid="lineas-orden">
      <table className="block w-full text-sm md:table">
        <caption className="sr-only">Productos de la orden de salida</caption>
        <thead className="hidden border-b border-gray-200 text-left text-gray-700 md:table-header-group">
          <tr>{cabeza.map((c) => <th key={c} scope="col" className="px-2 py-2 font-medium">{c}</th>)}<th scope="col" className="px-2 py-2"><span className="sr-only">Quitar</span></th></tr>
        </thead>
        <tbody className="block md:table-row-group">
          {lineas.map((l, i) => (
            <FilaLinea key={l.clave} l={l} i={i} ctx={ctx} ya={yaPedidoDelLote(lineas, i)} actualizar={actualizar} quitar={quitar} puedeQuitar={lineas.length > 1} />
          ))}
        </tbody>
      </table>
      {ctx.errores.lineas && <p role="alert" className="text-sm text-red-700" data-testid="error-lineas-orden">{ctx.errores.lineas}</p>}
      <button type="button" className="btn-secondary btn-sm" onClick={agregar} data-testid="agregar-linea-orden"><Plus className="h-4 w-4" aria-hidden />Agregar otra línea</button>
    </div>
  )
}
