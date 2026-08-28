'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { cargarObligacionTributariaAction, type EstadoFormulario } from './actions'

type TipoImpuesto = { id: string; nombre: string }

export function FormularioImpuesto({ tipos }: { tipos: TipoImpuesto[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(cargarObligacionTributariaAction, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  const hoy = new Date()
  const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Tipo de impuesto" error={errorDe('tipoImpuestoId')}>
          <select name="tipoImpuestoId" required className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Elige uno…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Periodo (AAAA-MM)" error={errorDe('periodo')}>
            <input type="month" name="periodo" defaultValue={periodoActual} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Fecha de vencimiento" error={errorDe('fechaVencimiento')}>
            <input type="date" name="fechaVencimiento" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Monto" error={errorDe('monto')}>
            <input type="number" name="monto" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Fuente">
            <select name="fuente" defaultValue="BUK" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="BUK">BUK</option>
              <option value="SUNAT">SUNAT</option>
              <option value="manual">Manual</option>
            </select>
          </Campo>
        </div>
      </section>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Cargar obligación tributaria'}
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
