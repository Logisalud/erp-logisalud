'use client'

import { useEffect } from 'react'
import { ArrowRight, Check, ChevronRight, Plus, X } from 'lucide-react'
import { formatoFecha } from '@/domain/fechas'
import { PASO_ACTIVO, PASO_INACTIVO } from '../../estilos-opcion'
import { ChipEstado, ChipPropietario } from '../mover/piezas'
import { ListaDestinos, ListaOrigenes, ListaProductos, MensajeDeLinea } from './selectores'
import type { LineaCalculada, usarMovimientoTablaTipo } from './tabla-tipos'

/** Teléfono: cada línea es una fila compacta (producto, origen → destino, cantidad y su mensaje); se edita en una hoja inferior. */
export function LineasMovil({ m, editando, alEditar }: { m: usarMovimientoTablaTipo; editando: number | null; alEditar: (id: number | null) => void }) {
  const actual = m.calculadas.find((c) => c.linea.id === editando)
  return (
    <section aria-labelledby="h-lineas-movil" data-testid="lineas-movil">
      <h2 id="h-lineas-movil" className="mb-2 font-heading text-xl font-medium tracking-wide text-gray-900">Líneas</h2>
      <ul className="space-y-2">
        {m.calculadas.map((c) => <FilaMovil key={c.linea.id} c={c} abrir={() => alEditar(c.linea.id)} quitar={() => m.quitar(c.linea.id)} />)}
      </ul>
      <button type="button" onClick={() => { const id = m.agregar(); alEditar(id) }} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-400 bg-white px-4 text-gray-900 active:bg-gray-50" data-testid="anadir-producto-movil">
        <Plus className="h-5 w-5" aria-hidden />Añadir un producto
      </button>
      {actual && <Hoja c={actual} m={m} cerrar={() => alEditar(null)} />}
    </section>
  )
}

function FilaMovil({ c, abrir, quitar }: { c: LineaCalculada; abrir: () => void; quitar: () => void }) {
  const l = c.linea
  return (
    <li className="rounded-xl border border-gray-200 bg-white" data-testid="fila-movil" data-lista={c.lista ? 'si' : 'no'}>
      <div className="flex items-stretch">
        <button type="button" onClick={abrir} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-3 text-left active:bg-gray-50" data-testid="editar-linea">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-800">{c.num}</span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[15px] font-semibold text-gray-900">{l.producto ? l.producto.descripcion : 'Sin producto todavía'}</strong>
            <span className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-gray-700">
              {l.celda ? l.celda.posicion : 'Origen'}<ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />{l.destino ? l.destino.codigo : 'Destino'}
              <span className="ml-auto font-medium text-gray-900">{c.cantidadNum > 0 ? `${c.cantidadNum} u` : '— u'}</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
        </button>
        <button type="button" onClick={quitar} aria-label={`Quitar la línea ${c.num}`} className="flex w-12 shrink-0 items-center justify-center rounded-r-xl border-l border-gray-100 text-gray-700 active:bg-gray-50" data-testid="quitar-linea-movil"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <MensajeDeLinea m={c.mensaje} lista={c.lista} className="mx-3 mb-3" />
    </li>
  )
}

const PASOS = [{ k: 'producto', t: 'Producto' }, { k: 'origen', t: 'Origen' }, { k: 'destino', t: 'Destino' }, { k: 'cantidad', t: 'Cantidad' }] as const

function Hoja({ c, m, cerrar }: { c: LineaCalculada; m: usarMovimientoTablaTipo; cerrar: () => void }) {
  const l = c.linea
  const paso = l.abierto ?? 'cantidad'
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [cerrar])
  const habilitado = (k: typeof PASOS[number]['k']) => k === 'producto' || (k === 'origen' && !!l.producto) || (k === 'destino' && !!l.celda) || (k === 'cantidad' && !!l.celda)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-gray-900/40" role="dialog" aria-modal="true" aria-label={`Línea ${c.num}`} data-testid="hoja-linea">
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <h3 className="font-heading text-lg font-medium tracking-wide text-gray-900">Línea {c.num}</h3>
          <button type="button" onClick={cerrar} className="btn-primary btn-sm" data-testid="hoja-listo"><Check className="h-4 w-4" aria-hidden />Listo</button>
        </div>
        <ol className="grid grid-cols-4 gap-1 border-b border-gray-200 px-3 py-2" aria-label="Pasos de la línea">
          {PASOS.map((p, i) => (
            <li key={p.k}>
              <button type="button" disabled={!habilitado(p.k)} aria-current={paso === p.k ? 'step' : undefined} onClick={() => m.actualizar(l.id, { abierto: p.k === 'cantidad' ? null : p.k })} data-testid={`paso-${p.k}`}
                className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-lg px-0.5 text-[13px] ${paso === p.k ? PASO_ACTIVO : PASO_INACTIVO}`}>
                {i + 1}. {p.t}
              </button>
            </li>
          ))}
        </ol>
        <div className="space-y-3 overflow-y-auto px-4 py-4">
          {paso === 'producto' && (
            <div className="space-y-2">
              <label htmlFor={`hoja-prod-${l.id}`} className="etiqueta">Producto</label>
              <input id={`hoja-prod-${l.id}`} type="search" autoComplete="off" autoFocus className="campo" placeholder="Nombre, código o lote" value={l.consulta} data-testid="buscar-producto"
                onChange={(e) => m.actualizar(l.id, { consulta: e.target.value })} />
              <ListaProductos consulta={l.consulta} alElegir={(p) => void m.elegirProducto(l.id, p)} />
            </div>
          )}
          {paso === 'origen' && l.producto && (
            <div className="space-y-2">
              <p className="text-sm text-gray-800"><strong>{l.producto.descripcion}</strong> · ¿de dónde sale?</p>
              <ListaOrigenes celdas={l.celdas ?? []} seleccionada={l.celda?.clave} libreDe={(x) => m.libreDe(l.id, x)} alElegir={(x) => void m.elegirOrigen(l.id, x)} />
            </div>
          )}
          {paso === 'destino' && l.celda && (
            <div className="space-y-2">
              <p className="text-sm text-gray-800">Sale de <strong className="tabular">{l.celda.posicion}</strong> · ¿a dónde va?</p>
              <ListaDestinos linea={m.comoChequeo(l)} seleccionado={l.destino?.posicionId} alElegir={(d) => m.elegirDestino(l.id, d)} />
            </div>
          )}
          {paso === 'cantidad' && l.celda && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-gray-50 p-3 text-sm">
                <div><dt className="text-gray-700">Lote</dt><dd className="tabular font-medium text-gray-900">{l.celda.lote}</dd></div>
                <div><dt className="text-gray-700">Vence</dt><dd className="tabular font-medium text-gray-900">{formatoFecha(l.celda.vence)}</dd></div>
                <div><dt className="text-gray-700">Propietario</dt><dd><ChipPropietario codigo={l.celda.propietario} /></dd></div>
                <div><dt className="text-gray-700">Estado</dt><dd><ChipEstado e={l.celda.estado} /></dd></div>
              </dl>
              <label htmlFor={`hoja-cant-${l.id}`} className="etiqueta">Cantidad · disponible {Math.max(c.disponible, 0)} u</label>
              <div className="flex gap-2">
                <input id={`hoja-cant-${l.id}`} type="text" inputMode="numeric" pattern="[0-9]*" className="campo tabular" value={l.cantidad} data-testid="celda-cantidad" onChange={(e) => m.actualizar(l.id, { cantidad: e.target.value.replace(/\D/g, '') })} />
                <button type="button" onClick={() => m.usarTodo(l.id)} className="btn-secondary whitespace-nowrap" data-testid="usar-todo">Todo ({Math.max(c.disponible, 0)})</button>
              </div>
            </div>
          )}
          <MensajeDeLinea m={c.mensaje} lista={c.lista} />
        </div>
      </div>
    </div>
  )
}
