'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { registrarMovimientoAction, type EstadoFormulario } from './actions'
import type { TipoComprobanteMovimiento } from '@/domain/caja-chica'

type CategoriaGasto = { id: string; nombre: string }

const SUGERENCIA_IGV = 0.18
const HOY = new Date().toISOString().slice(0, 10)

export function FormularioMovimiento({ fondoId, categorias }: { fondoId: string; categorias: CategoriaGasto[] }) {
  const accionConFondo = registrarMovimientoAction.bind(null, fondoId)
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(accionConFondo, null)
  const sucio = useMarcarSucioAlEditar()
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobanteMovimiento>('boleta')
  const [base, setBase] = useState('')
  const [igv, setIgv] = useState('')
  const [igvEditadoAMano, setIgvEditadoAMano] = useState(false)

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  const cambiarBase = (valor: string) => {
    setBase(valor)
    if (!igvEditadoAMano) {
      const n = Number(valor)
      setIgv(n > 0 ? (Math.round(n * SUGERENCIA_IGV * 100) / 100).toString() : '')
    }
  }

  const hayComprobante = tipoComprobante !== 'sin_comprobante'
  const total = hayComprobante ? (Number(base) || 0) + (Number(igv) || 0) : null

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Categoría" error={errorDe('categoriaId')}>
          <select name="categoriaId" required className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha" error={errorDe('fecha')}>
            <input type="date" name="fecha" defaultValue={HOY} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Placa del vehículo (opcional)">
            <input type="text" name="placaVehiculo" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>

        <Campo etiqueta="Descripción (opcional)">
          <input type="text" name="descripcion" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </Campo>
      </section>

      <section className="card space-y-3">
        <p className="text-sm text-gray-600">
          Sube primero la foto o PDF de tu boleta/factura y después completa la base y el IGV tal
          como figuran ahí — mirando el comprobante al lado.
        </p>

        <Campo etiqueta="Foto o PDF del comprobante (opcional por ahora)">
          <input
            type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp"
            className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo de comprobante">
            <select
              name="tipoComprobante" value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value as TipoComprobanteMovimiento)}
              className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              <option value="factura">Factura</option>
              <option value="boleta">Boleta</option>
              <option value="sin_comprobante">Sin comprobante</option>
            </select>
          </Campo>
          <Campo etiqueta="Monto" error={errorDe('monto')}>
            <input type="number" name="monto" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>

        {hayComprobante ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="N° (opcional)">
                <input type="text" name="numero" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
              <Campo etiqueta="RUC emisor (opcional)">
                <input type="text" name="rucEmisor" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
              </Campo>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Base imponible" error={errorDe('baseImponible')}>
                <input
                  type="number" name="baseImponible" min="0" step="0.01" value={base}
                  onChange={(e) => cambiarBase(e.target.value)}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
              </Campo>
              <Campo etiqueta="IGV" error={errorDe('igv')}>
                <input
                  type="number" name="igv" min="0" step="0.01" value={igv}
                  onChange={(e) => { setIgv(e.target.value); setIgvEditadoAMano(true) }}
                  className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Sugerido en 18% de la base — cambialo si tu comprobante trae otro valor (por
                  ejemplo, 0 en boletas de un régimen que no discrimina IGV).
                </p>
              </Campo>
            </div>

            {total !== null ? <p className="text-sm text-gray-700">Total del comprobante: {total.toFixed(2)}</p> : null}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Sin comprobante: el gasto queda registrado igual, marcado como no sustentable
            (alerta visual, no bloquea nada).
          </p>
        )}
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Registrar gasto'}
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
