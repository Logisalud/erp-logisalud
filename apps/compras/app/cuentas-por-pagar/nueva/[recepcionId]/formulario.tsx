'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { registrarObligacionAction, type EstadoFormulario } from './actions'
import { redondear } from '@/domain/obligacion'

type ItemParaObligar = {
  ocItemId: string
  cantidadPedida: number
  cantidadRecibida: number
  cantidadYaFacturada: number
  precioUnitario: number
  producto: { codigo: string; descripcion: string; unidad_medida: string } | null
}

// Sin sección de Detracción acá: por decisión de negocio (Sebas), la
// detracción solo aplica a Servicios (ver
// app/servicios/[id]/registrar-obligacion/formulario.tsx) — una compra de
// mercadería o de un bien nunca la lleva.
export function FormularioObligacion({
  recepcionId, moneda, items, storagePathGuia, storagePathFactura,
}: {
  recepcionId: string
  moneda: string
  items: ItemParaObligar[]
  storagePathGuia: string | null
  storagePathFactura: string | null
}) {
  const accionConRecepcion = registrarObligacionAction.bind(null, recepcionId)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConRecepcion, null)
  const sucio = useMarcarSucioAlEditar()

  const [lineas, setLineas] = useState<Record<string, { cantidad: string; precio: string }>>(
    Object.fromEntries(
      items.map((i) => [
        i.ocItemId,
        {
          cantidad: String(i.cantidadRecibida - i.cantidadYaFacturada),
          precio: String(i.precioUnitario),
        },
      ])
    )
  )

  const baseImponible = redondear(
    Object.values(lineas).reduce((acc, l) => acc + redondear((Number(l.cantidad) || 0) * (Number(l.precio) || 0)), 0)
  )

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}
      {errorDe('lineas') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('lineas')}
        </p>
      ) : null}

      {storagePathGuia || storagePathFactura ? (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Guía y factura ya quedaron subidas por Almacén al registrar la recepción — no hace
          falta volver a pedirlas.
        </p>
      ) : null}

      <input type="hidden" name="moneda" value={moneda} />

      <section className="card grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="N° de factura" error={errorDe('numeroFactura')}>
          <input type="text" name="numeroFactura" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </Campo>
        <Campo etiqueta="Fecha de factura" error={errorDe('fechaFactura')}>
          <input
            type="date" name="fechaFactura" required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>
        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio" error={errorDe('tipoCambio')}>
            <input type="number" name="tipoCambio" min="0" step="0.0001" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}
      </section>

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Líneas facturadas</h2>
        {items.map((item, i) => {
          const pendiente = item.cantidadRecibida - item.cantidadYaFacturada
          return (
            <div key={item.ocItemId} className="rounded-md border border-gray-200 p-3">
              <p className="font-medium">
                <span className="font-mono text-xs text-gray-500">{item.producto?.codigo ?? '—'}</span>
                {' '}{item.producto?.descripcion ?? 'producto no legible'}
              </p>
              <p className="text-sm text-gray-500">
                Recibido y pendiente de facturar: {pendiente} {item.producto?.unidad_medida ?? ''} · precio pactado {item.precioUnitario}
              </p>
              <input type="hidden" name="linea_ocItemId" value={item.ocItemId} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600">Cant. facturada</span>
                  <input
                    type="number" name="linea_cantidadFacturada" min="0" step="any"
                    value={lineas[item.ocItemId]?.cantidad ?? ''}
                    onChange={(e) =>
                      setLineas((prev) => ({ ...prev, [item.ocItemId]: { ...prev[item.ocItemId], cantidad: e.target.value } }))
                    }
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  {errorDe(`lineas.${i}.cantidadFacturada`) ? (
                    <p className="mt-1 text-red-700">{errorDe(`lineas.${i}.cantidadFacturada`)}</p>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Precio facturado</span>
                  <input
                    type="number" name="linea_precioFacturado" min="0" step="0.0001"
                    value={lineas[item.ocItemId]?.precio ?? ''}
                    onChange={(e) =>
                      setLineas((prev) => ({ ...prev, [item.ocItemId]: { ...prev[item.ocItemId], precio: e.target.value } }))
                    }
                    className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </label>
              </div>
            </div>
          )
        })}
      </section>

      <p className="text-sm text-gray-600">
        Base imponible: <span className="font-medium tabular-nums">{baseImponible.toFixed(2)}</span> {moneda}
      </p>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Registrar obligación'}
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
