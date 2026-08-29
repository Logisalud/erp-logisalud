'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { actualizarOrdenCompraAction, type EstadoFormulario } from './actions'
import { calcularTotales } from '@/domain/orden-compra'
import { BuscadorProducto, type ProductoElegido } from '@/components/buscador-producto'
import { BuscadorProveedor, type ProveedorElegido } from '@/components/buscador-proveedor'

type LineaMercaderia = { producto: ProductoElegido | null; cantidad: string; precio: string }
type LineaBien = { descripcion: string; cantidad: string; precio: string }

export function FormularioEditarOC({
  oc,
  proveedorActual,
}: {
  oc: {
    id: string
    tipo: 'mercaderia' | 'bien'
    fecha_emision: string
    fecha_entrega_estimada: string | null
    moneda: string
    condiciones_pago_dias: number | null
    notas: string | null
    items: {
      id: string
      producto_id: string | null
      producto: { codigo: string; descripcion: string; unidad_medida: string } | null
      descripcion_libre: string | null
      cantidad_pedida: number
      precio_unitario: number
    }[]
  }
  proveedorActual: ProveedorElegido
}) {
  const esBien = oc.tipo === 'bien'
  const accion = actualizarOrdenCompraAction.bind(null, oc.id, esBien)
  const [estado, dispatch] = useFormState<EstadoFormulario, FormData>(accion, null)
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(proveedorActual)

  const [lineasMercaderia, setLineasMercaderia] = useState<LineaMercaderia[]>(
    esBien
      ? []
      : oc.items.map((i) => ({
          producto: i.producto && i.producto_id ? { id: i.producto_id, ...i.producto } : null,
          cantidad: String(i.cantidad_pedida),
          precio: String(i.precio_unitario),
        }))
  )
  const [lineasBien, setLineasBien] = useState<LineaBien[]>(
    esBien
      ? oc.items.map((i) => ({
          descripcion: i.descripcion_libre ?? '',
          cantidad: String(i.cantidad_pedida),
          precio: String(i.precio_unitario),
        }))
      : []
  )

  const totales = calcularTotales(
    (esBien ? lineasBien : lineasMercaderia).map((l) => ({
      cantidadPedida: Number(l.cantidad) || 0,
      precioUnitario: Number(l.precio) || 0,
    }))
  )

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={dispatch} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor" error={errorDe('proveedorId')}>
          <BuscadorProveedor valor={proveedor} onElegir={setProveedor} tipo={esBien ? 'bien' : 'mercaderia'} />
          <input type="hidden" name="proveedorId" value={proveedor?.id ?? ''} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha de emisión" error={errorDe('fechaEmision')}>
            <input
              type="date" name="fechaEmision" required
              defaultValue={oc.fecha_emision}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Entrega estimada" error={errorDe('fechaEntregaEstimada')}>
            <input
              type="date" name="fechaEntregaEstimada"
              defaultValue={oc.fecha_entrega_estimada ?? ''}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Moneda" error={errorDe('moneda')}>
            <select
              name="moneda" defaultValue={oc.moneda}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            >
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
          </Campo>
          <Campo etiqueta="Días de pago" error={errorDe('condicionesPagoDias')}>
            <input
              type="number" name="condicionesPagoDias" min={0}
              defaultValue={oc.condiciones_pago_dias ?? ''}
              placeholder="0 = contado"
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
        </div>
      </section>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg">{esBien ? 'Bienes' : 'Productos'}</h2>
          <button
            type="button"
            onClick={() =>
              esBien
                ? setLineasBien([...lineasBien, { descripcion: '', cantidad: '', precio: '' }])
                : setLineasMercaderia([...lineasMercaderia, { producto: null, cantidad: '', precio: '' }])
            }
            className="text-sm text-logisalud-teal underline"
          >
            Agregar línea
          </button>
        </div>

        {errorDe('lineas') ? (
          <p className="mt-2 text-sm text-red-700">{errorDe('lineas')}</p>
        ) : null}

        {esBien ? (
          <ul className="mt-3 space-y-4">
            {lineasBien.map((linea, i) => (
              <li key={i} className="rounded-md border border-gray-200 p-3">
                <label className="block text-sm">
                  <span className="text-gray-600">Descripción del bien</span>
                  <input
                    type="text" name="linea_descripcion" value={linea.descripcion}
                    placeholder="Ej: Impresora láser, Escritorio de oficina…"
                    onChange={(e) => {
                      const copia = [...lineasBien]
                      copia[i] = { ...copia[i], descripcion: e.target.value }
                      setLineasBien(copia)
                    }}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
                {errorDe(`lineas.${i}.descripcionLibre`) ? (
                  <p className="mt-1 text-sm text-red-700">{errorDe(`lineas.${i}.descripcionLibre`)}</p>
                ) : null}
                <LineaCantidadPrecio
                  cantidad={linea.cantidad}
                  precio={linea.precio}
                  onCantidad={(v) => {
                    const copia = [...lineasBien]
                    copia[i] = { ...copia[i], cantidad: v }
                    setLineasBien(copia)
                  }}
                  onPrecio={(v) => {
                    const copia = [...lineasBien]
                    copia[i] = { ...copia[i], precio: v }
                    setLineasBien(copia)
                  }}
                  errorCantidad={errorDe(`lineas.${i}.cantidadPedida`)}
                  errorPrecio={errorDe(`lineas.${i}.precioUnitario`)}
                />
                {lineasBien.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLineasBien(lineasBien.filter((_, j) => j !== i))}
                    className="mt-3 text-sm text-gray-500 underline"
                  >
                    Quitar esta línea
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-3 space-y-4">
            {lineasMercaderia.map((linea, i) => (
              <li key={i} className="rounded-md border border-gray-200 p-3">
                <BuscadorProducto
                  valor={linea.producto}
                  onElegir={(p) => {
                    const copia = [...lineasMercaderia]
                    copia[i] = { ...copia[i], producto: p }
                    setLineasMercaderia(copia)
                  }}
                />
                <input type="hidden" name="linea_producto" value={linea.producto?.id ?? ''} />
                {errorDe(`lineas.${i}.productoId`) ? (
                  <p className="mt-1 text-sm text-red-700">{errorDe(`lineas.${i}.productoId`)}</p>
                ) : null}
                <LineaCantidadPrecio
                  cantidad={linea.cantidad}
                  precio={linea.precio}
                  onCantidad={(v) => {
                    const copia = [...lineasMercaderia]
                    copia[i] = { ...copia[i], cantidad: v }
                    setLineasMercaderia(copia)
                  }}
                  onPrecio={(v) => {
                    const copia = [...lineasMercaderia]
                    copia[i] = { ...copia[i], precio: v }
                    setLineasMercaderia(copia)
                  }}
                  errorCantidad={errorDe(`lineas.${i}.cantidadPedida`)}
                  errorPrecio={errorDe(`lineas.${i}.precioUnitario`)}
                />
                {lineasMercaderia.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLineasMercaderia(lineasMercaderia.filter((_, j) => j !== i))}
                    className="mt-3 text-sm text-gray-500 underline"
                  >
                    Quitar esta línea
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Fila termino="Subtotal" valor={totales.subtotal} />
          <Fila termino="IGV 18%" valor={totales.igv} />
          <Fila termino="Total" valor={totales.total} destacado />
        </dl>
      </section>

      <section className="card">
        <Campo etiqueta="Notas para el proveedor">
          <textarea
            name="notas" rows={3}
            defaultValue={oc.notas ?? ''}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </Campo>
      </section>

      <BotonGuardar />
    </form>
  )
}

function LineaCantidadPrecio({
  cantidad, precio, onCantidad, onPrecio, errorCantidad, errorPrecio,
}: {
  cantidad: string
  precio: string
  onCantidad: (v: string) => void
  onPrecio: (v: string) => void
  errorCantidad?: string
  errorPrecio?: string
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Cantidad</span>
          <input
            type="number" name="linea_cantidad" min="0" step="any" value={cantidad}
            onChange={(e) => onCantidad(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Precio unitario</span>
          <input
            type="number" name="linea_precio" min="0" step="0.0001" value={precio}
            onChange={(e) => onPrecio(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
      </div>
      {errorCantidad ? <p className="mt-1 text-sm text-red-700">{errorCantidad}</p> : null}
      {errorPrecio ? <p className="mt-1 text-sm text-red-700">{errorPrecio}</p> : null}
    </>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )
}

function Campo({
  etiqueta, error, children,
}: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}

function Fila({ termino, valor, destacado }: { termino: string; valor: number; destacado?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${destacado ? 'border-t border-gray-200 pt-1 font-semibold' : ''}`}>
      <dt className={destacado ? '' : 'text-gray-500'}>{termino}</dt>
      <dd className="tabular-nums">
        S/ {valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </dd>
    </div>
  )
}
