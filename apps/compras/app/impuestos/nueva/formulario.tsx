'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { cargarObligacionesTributariasAction, type EstadoFormulario } from './actions'
import { totalDeCarga } from '@/domain/impuestos'

type TipoImpuesto = { id: string; nombre: string }

type LineaUI = { tipoImpuestoId: string; monto: string; fechaVencimiento: string }

const LINEA_VACIA: LineaUI = { tipoImpuestoId: '', monto: '', fechaVencimiento: '' }

/**
 * Carga de VARIAS líneas en un solo envío. Arlette copia esto del reporte
 * PLAME de BUK, que agrupa varios impuestos del mismo periodo (Essalud, ONP,
 * AFP, Renta 5ta…) en un solo documento — cargarlos de a uno no reflejaba
 * cómo llega la información real.
 *
 * Dos campos que NO son lo mismo y por eso viven en lugares distintos:
 *  - "Fuente del dato" (BUK / SUNAT / manual) va en el ENCABEZADO, una vez.
 *    Dice de dónde vino la información.
 *  - "Tipo de impuesto" va por LÍNEA y sale del catálogo. Dice qué tributo
 *    es. BUK nunca aparece acá: no es un impuesto.
 */
export function FormularioImpuesto({ tipos }: { tipos: TipoImpuesto[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(cargarObligacionesTributariasAction, null)
  const sucio = useMarcarSucioAlEditar(estado)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  const hoy = new Date()
  const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const [lineas, setLineas] = useState<LineaUI[]>([{ ...LINEA_VACIA }])

  const cambiar = (i: number, campo: keyof LineaUI, valor: string) =>
    setLineas((previas) => previas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))
  const agregar = () => setLineas((previas) => [...previas, { ...LINEA_VACIA }])
  const quitar = (i: number) =>
    setLineas((previas) => (previas.length === 1 ? previas : previas.filter((_, j) => j !== i)))

  const total = totalDeCarga(lineas.map((l) => ({ tipoImpuestoId: l.tipoImpuestoId, monto: Number(l.monto) || 0 })))

  return (
    <form action={accion} onChange={sucio.onChange} onSubmit={sucio.onSubmit} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Datos del periodo</h2>
        <p className="text-sm text-gray-600">
          Todas las líneas de este envío son del mismo periodo. Si necesitas cargar otro mes, es
          otro envío.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Periodo *" error={errorDe('periodo')}>
            <input
              type="month" name="periodo" defaultValue={periodoActual} required
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>
          <Campo etiqueta="Fuente del dato *" error={errorDe('fuente')}>
            <select name="fuente" defaultValue="BUK" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="BUK">BUK (planilla)</option>
              <option value="SUNAT">SUNAT</option>
              <option value="manual">Carga manual</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">De dónde salió la información, no qué impuesto es.</p>
          </Campo>
          <Campo etiqueta="Vencimiento *" error={errorDe('fechaVencimiento')}>
            <input
              type="date" name="fechaVencimiento" required
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">Se aplica a todas las líneas, salvo las que traigan el suyo.</p>
          </Campo>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg">Impuestos del periodo</h2>
          <span className="text-sm text-gray-600">
            {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'} · total{' '}
            <strong className="tabular-nums">{total.toFixed(2)}</strong>
          </span>
        </div>

        {errorDe('lineas') ? <p className="text-sm text-red-700">{errorDe('lineas')}</p> : null}

        <div className="space-y-3">
          {lineas.map((linea, i) => (
            <div key={i} className="rounded-md border border-gray-200 p-3">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Campo etiqueta="Tipo de impuesto *" error={errorDe(`lineas.${i}.tipoImpuestoId`)}>
                  <select
                    name="linea_tipo" value={linea.tipoImpuestoId}
                    onChange={(e) => cambiar(i, 'tipoImpuestoId', e.target.value)}
                    className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
                  >
                    <option value="">Elige uno…</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Monto *" error={errorDe(`lineas.${i}.monto`)}>
                  <input
                    type="number" name="linea_monto" min="0" step="0.01" value={linea.monto}
                    onChange={(e) => cambiar(i, 'monto', e.target.value)}
                    className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                </Campo>
                {/* AFP vence por AFPnet, en fecha distinta del cronograma
                    SUNAT que rige Essalud/ONP/Renta 5ta — y las tres llegan
                    en el MISMO reporte PLAME. De ahí el override por línea. */}
                <Campo etiqueta="Vencimiento propio">
                  <input
                    type="date" name="linea_vencimiento" value={linea.fechaVencimiento}
                    onChange={(e) => cambiar(i, 'fechaVencimiento', e.target.value)}
                    className="min-h-12 w-full rounded-md border border-gray-300 px-3"
                  />
                  <p className="mt-1 text-xs text-gray-500">Opcional — vacío usa el del periodo.</p>
                </Campo>
                <div className="flex items-end">
                  <button
                    type="button" onClick={() => quitar(i)} disabled={lineas.length === 1}
                    className="min-h-12 rounded-md border border-gray-300 px-3 text-sm text-gray-600 disabled:opacity-40"
                    aria-label={`Quitar línea ${i + 1}`}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={agregar} className="btn-secondary">
          + Agregar línea
        </button>
      </section>

      <BotonGuardar cantidad={lineas.length} />
    </form>
  )
}

function BotonGuardar({ cantidad }: { cantidad: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending
        ? 'Cargando…'
        : `Cargar ${cantidad} ${cantidad === 1 ? 'impuesto' : 'impuestos'}`}
    </button>
  )
}

function Campo({
  etiqueta,
  error,
  children,
}: {
  etiqueta: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <span className="mt-1 block">{children}</span>
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  )
}
