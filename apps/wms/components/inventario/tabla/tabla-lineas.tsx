'use client'

import { Plus, X } from 'lucide-react'
import type { CeldaDeProducto } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'
import { ChipEstado, ChipPropietario } from '../mover/piezas'
import { ListaDestinos, ListaOrigenes, ListaProductos, MensajeDeLinea } from './selectores'
import type { LineaCalculada, usarMovimientoTablaTipo } from './tabla-tipos'

const COLUMNAS = 'grid-cols-[32px_minmax(170px,2fr)_minmax(140px,1.5fr)_82px_96px_100px_88px_minmax(140px,1.5fr)_100px_40px]'
const ENCABEZADOS = ['#', 'Producto', 'Origen · lote', 'Vence', 'Propietario', 'Estado', 'Disponible', 'Destino', 'Cantidad', '']

const boton = 'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-[13px] text-gray-900 hover:border-gray-400'

/** El modo tabla (PC y tablet): una fila por producto, con producto, origen, destino y cantidad editables en la misma fila. */
export function TablaLineas({ m }: { m: usarMovimientoTablaTipo }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-labelledby="h-lineas-tabla" data-testid="tabla-creacion">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-200 px-5 py-3.5">
        <h2 id="h-lineas-tabla" className="font-heading text-xl font-medium tracking-wide text-gray-900">Líneas</h2>
        <p className="text-sm text-gray-700">Cada línea tiene su propio origen y destino. Lote, vencimiento, propietario y estado se completan solos.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1026px]" role="table" aria-label="Líneas del movimiento">
          <div role="row" className={`grid ${COLUMNAS} bg-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-800`}>
            {ENCABEZADOS.map((c, i) => <div key={i} role="columnheader" className="px-2 py-2.5">{c || <span className="sr-only">Quitar</span>}</div>)}
          </div>
          {m.calculadas.map((c) => <Fila key={c.linea.id} c={c} m={m} />)}
        </div>
      </div>
      <div className="border-t border-gray-200 px-5 py-3">
        <button type="button" onClick={() => m.agregar()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-gray-400 bg-white px-4 text-sm text-gray-900 hover:border-gray-500 hover:bg-gray-50" data-testid="anadir-producto">
          <Plus className="h-4 w-4" aria-hidden />Añadir un producto
        </button>
      </div>
    </section>
  )
}

function Fila({ c, m }: { c: LineaCalculada; m: usarMovimientoTablaTipo }) {
  const l = c.linea
  const celda = l.celda
  const libreDe = (x: CeldaDeProducto) => m.libreDe(l.id, x)
  const errorCantidad = c.mensaje?.tipo === 'error' && !!celda && c.cantidadNum > c.disponible
  return (
    <div className="border-t border-gray-200" role="row" data-testid="fila-creacion" data-lista={c.lista ? 'si' : 'no'}>
      <div className={`grid ${COLUMNAS} items-start`}>
        <div role="cell" className="px-2 py-3.5 text-sm text-gray-700">{c.num}</div>

        <div role="cell" className="flex flex-col gap-1.5 p-2">
          {l.producto ? (
            <button type="button" onClick={() => m.alternar(l.id, 'producto')} className="flex flex-col gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-gray-50" data-testid="celda-producto" aria-expanded={l.abierto === 'producto'}>
              <strong className="text-[13px] font-semibold text-gray-900">{l.producto.descripcion}</strong>
              <span className="tabular text-xs text-gray-700">[{l.producto.codigo}]{l.producto.presentacion ? ` ${l.producto.presentacion}` : ''}</span>
            </button>
          ) : (
            <>
              <label className="sr-only" htmlFor={`prod-${l.id}`}>Buscar producto en la línea {c.num}</label>
              <input id={`prod-${l.id}`} type="search" autoComplete="off" className="campo !min-h-10 text-[13px]" placeholder="Buscar nombre, código o lote" value={l.consulta} data-testid="buscar-producto"
                onChange={(e) => m.actualizar(l.id, { consulta: e.target.value, abierto: 'producto' })} onFocus={() => m.actualizar(l.id, { abierto: 'producto' })} />
            </>
          )}
          {l.abierto === 'producto' && (
            <div className="space-y-1.5">
              {l.producto && <input type="search" autoComplete="off" autoFocus aria-label="Cambiar de producto" className="campo !min-h-10 text-[13px]" placeholder="Buscar otro producto" value={l.consulta} onChange={(e) => m.actualizar(l.id, { consulta: e.target.value })} data-testid="buscar-producto" />}
              <ListaProductos consulta={l.consulta} alElegir={(p) => void m.elegirProducto(l.id, p)} />
            </div>
          )}
        </div>

        <div role="cell" className="flex flex-col gap-1.5 p-2">
          {l.producto ? (
            <button type="button" onClick={() => m.alternar(l.id, 'origen')} aria-expanded={l.abierto === 'origen'} className={`${boton} ${celda ? 'border-gray-300' : 'border-teal-600'}`} data-testid="celda-origen">
              <span className="truncate">{celda ? `${celda.posicion} · ${celda.lote}` : 'Elegir de dónde sale'}</span>
            </button>
          ) : <span className="px-1.5 py-2.5 text-gray-400">—</span>}
          {l.abierto === 'origen' && l.producto && <ListaOrigenes celdas={l.celdas ?? []} seleccionada={celda?.clave} libreDe={libreDe} alElegir={(x) => void m.elegirOrigen(l.id, x)} />}
        </div>

        <div role="cell" className="tabular px-2 py-3.5 text-[13px] text-gray-900">{celda ? formatoFecha(celda.vence) : '—'}</div>
        <div role="cell" className="px-2 py-3">{celda ? <ChipPropietario codigo={celda.propietario} /> : <span className="text-gray-400">—</span>}</div>
        <div role="cell" className="px-2 py-2.5">{celda ? <ChipEstado e={celda.estado} /> : <span className="text-gray-400">—</span>}</div>
        <div role="cell" className="tabular px-2 py-3.5 text-[13px] text-gray-900" data-testid="celda-disponible">{celda ? `${Math.max(c.disponible, 0)} u` : '—'}</div>

        <div role="cell" className="flex flex-col gap-1.5 p-2">
          {celda ? (
            <button type="button" onClick={() => m.alternar(l.id, 'destino')} aria-expanded={l.abierto === 'destino'}
              className={`${boton} ${c.mensaje?.tipo === 'error' && l.destino && !errorCantidad ? 'border-red-600' : l.destino ? 'border-gray-300' : 'border-teal-600'}`} data-testid="celda-destino">
              <span className="truncate">{l.destino ? `${l.destino.codigo} · ${l.destino.area}` : 'Elegir a dónde va'}</span>
            </button>
          ) : <span className="px-1.5 py-2.5 text-gray-400">—</span>}
          {l.abierto === 'destino' && celda && (
            <ListaDestinos linea={m.comoChequeo(l)} seleccionado={l.destino?.posicionId} alElegir={(d) => m.elegirDestino(l.id, d)} autoFoco />
          )}
        </div>

        <div role="cell" className="flex flex-col gap-1 p-2">
          <label className="sr-only" htmlFor={`cant-${l.id}`}>Cantidad de la línea {c.num}</label>
          <input id={`cant-${l.id}`} type="text" inputMode="numeric" pattern="[0-9]*" className={`campo tabular !min-h-10 text-[13px] ${errorCantidad ? '!border-red-600' : ''}`} value={l.cantidad} aria-invalid={errorCantidad || undefined}
            onChange={(e) => m.actualizar(l.id, { cantidad: e.target.value.replace(/\D/g, '') })} data-testid="celda-cantidad" />
          {celda && <button type="button" onClick={() => m.usarTodo(l.id)} className="self-start text-xs text-teal-800 underline underline-offset-2" data-testid="usar-todo">Todo ({Math.max(c.disponible, 0)})</button>}
        </div>

        <div role="cell" className="p-2">
          <button type="button" onClick={() => m.quitar(l.id)} aria-label={`Quitar la línea ${c.num}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" data-testid="quitar-linea"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      <MensajeDeLinea m={c.mensaje} lista={c.lista} className="mx-3 mb-3 ml-12" />
    </div>
  )
}
