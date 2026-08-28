'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearFraccionamientoAction, type EstadoFormulario } from './actions'
import { CuotasInput } from '@/components/cuotas-input'

export function FormularioFraccionamiento() {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearFraccionamientoAction, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="N° de expediente" error={errorDe('numeroExpediente')}>
          <input type="text" name="numeroExpediente" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo (opcional)">
            <input type="text" name="tipo" placeholder="IGV Justo, REFT…" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Fecha de resolución (opcional)">
            <input type="date" name="fechaResolucion" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Deuda original" error={errorDe('deudaOriginal')}>
            <input type="number" name="deudaOriginal" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Tasa interés moratorio % (opcional)">
            <input type="number" name="tasaInteresMoratorio" min="0" step="0.001" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>
      </section>

      <section className="card">
        <h2 className="font-heading mb-2 text-lg">Cronograma de cuotas</h2>
        <p className="mb-3 text-sm text-gray-600">
          Transcribí cada cuota tal como figura en la resolución de SUNAT.
        </p>
        <CuotasInput error={errorDe('cuotas')} />
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Registrar fraccionamiento'}
    </button>
  )
}

function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-red-700">{error}</p> : null}
    </label>
  )
}
