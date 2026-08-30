'use client'

import { useState } from 'react'
// useFormState / useFormStatus y no useActionState: esta app está en React 18,
// donde useActionState todavía no existe (llegó con React 19). El build lo
// avisa como "Attempted import error", no como error, así que pasa silencioso
// hasta que el formulario revienta en el navegador.
import { useFormState, useFormStatus } from 'react-dom'
import { crearOrdenCompra, type EstadoFormulario } from './actions'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { calcularTotales } from '@/domain/orden-compra'
import { BuscadorProducto, type ProductoElegido } from '@/components/buscador-producto'
import { BuscadorProveedor, type ProveedorElegido } from '@/components/buscador-proveedor'

type Linea = { producto: ProductoElegido | null; cantidad: string; precio: string }

const LINEA_VACIA: Linea = { producto: null, cantidad: '', precio: '' }

export function FormularioOC() {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearOrdenCompra, null)
  const sucio = useMarcarSucioAlEditar()
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }])
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(null)

  // El total se calcula con la MISMA función que usa el servidor y la pantalla
  // de detalle. Si acá se sumara distinto, el número que la persona aprueba no
  // sería el que se guarda.
  const totales = calcularTotales(
    lineas.map((l) => ({
      cantidadPedida: Number(l.cantidad) || 0,
      precioUnitario: Number(l.precio) || 0,
    }))
  )

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor" error={errorDe('proveedorId')}>
          <BuscadorProveedor valor={proveedor} onElegir={setProveedor} tipo="mercaderia" />
          <input type="hidden" name="proveedorId" value={proveedor?.id ?? ''} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha de emisión" error={errorDe('fechaEmision')}>
            <input
              type="date" name="fechaEmision" required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Entrega estimada" error={errorDe('fechaEntregaEstimada')}>
            <input
              type="date" name="fechaEntregaEstimada"
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Moneda" error={errorDe('moneda')}>
            <select
              name="moneda" key={proveedor?.moneda ?? 'PEN'}
              defaultValue={proveedor?.moneda ?? 'PEN'}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            >
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
          </Campo>
          <Campo etiqueta="Días de pago" error={errorDe('condicionesPagoDias')}>
            <input
              type="number" name="condicionesPagoDias" min={0} required
              key={proveedor?.condicionPagoDias ?? 'x'}
              defaultValue={proveedor?.condicionPagoDias ?? ''}
              placeholder="0 = contado"
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
        </div>
      </section>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg">Productos</h2>
          <button
            type="button"
            onClick={() => setLineas([...lineas, { ...LINEA_VACIA }])}
            className="text-sm text-logisalud-teal underline"
          >
            Agregar línea
          </button>
        </div>

        {errorDe('lineas') ? (
          <p className="mt-2 text-sm text-red-700">{errorDe('lineas')}</p>
        ) : null}

        <ul className="mt-3 space-y-4">
          {lineas.map((linea, i) => (
            <li key={i} className="rounded-md border border-gray-200 p-3">
              <BuscadorProducto
                valor={linea.producto}
                onElegir={(p) => {
                  const copia = [...lineas]
                  copia[i] = { ...copia[i], producto: p }
                  setLineas(copia)
                }}
              />
              <input type="hidden" name="linea_producto" value={linea.producto?.id ?? ''} />
              {errorDe(`lineas.${i}.productoId`) ? (
                <p className="mt-1 text-sm text-red-700">{errorDe(`lineas.${i}.productoId`)}</p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600">Cantidad</span>
                  <input
                    type="number" name="linea_cantidad" min="0" step="any" value={linea.cantidad}
                    onChange={(e) => {
                      const copia = [...lineas]
                      copia[i] = { ...copia[i], cantidad: e.target.value }
                      setLineas(copia)
                    }}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Precio unitario</span>
                  <input
                    type="number" name="linea_precio" min="0" step="0.0001" value={linea.precio}
                    onChange={(e) => {
                      const copia = [...lineas]
                      copia[i] = { ...copia[i], precio: e.target.value }
                      setLineas(copia)
                    }}
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
              </div>

              {errorDe(`lineas.${i}.cantidadPedida`) ? (
                <p className="mt-1 text-sm text-red-700">{errorDe(`lineas.${i}.cantidadPedida`)}</p>
              ) : null}
              {errorDe(`lineas.${i}.precioUnitario`) ? (
                <p className="mt-1 text-sm text-red-700">{errorDe(`lineas.${i}.precioUnitario`)}</p>
              ) : null}

              {lineas.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                  className="mt-3 text-sm text-gray-500 underline"
                >
                  Quitar esta línea
                </button>
              ) : null}
            </li>
          ))}
        </ul>

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
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </Campo>
      </section>

      <BotonGuardar />
    </form>
  )
}

/**
 * useFormStatus solo funciona dentro de un hijo del <form>, no en el mismo
 * componente que lo declara. De ahí que el botón sea su propio componente.
 */
function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Guardar como borrador'}
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
