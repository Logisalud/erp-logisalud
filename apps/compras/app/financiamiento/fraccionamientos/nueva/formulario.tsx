'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearFraccionamientoAction, type EstadoFormulario } from './actions'
import { CuotasInput } from '@/components/cuotas-input'

type TipoImpuesto = { id: string; nombre: string }

export function FormularioFraccionamiento({ tiposImpuesto }: { tiposImpuesto: TipoImpuesto[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearFraccionamientoAction, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje
  // Errores por fila/columna del cronograma (manual o Excel) — cada uno ya
  // trae el número de fila y la columna exacta en el mensaje (ver
  // domain/financiamiento.ts::validarCuotas y lib/excel-cuotas.ts).
  const erroresCuotas = (estado?.errores ?? []).filter((e) => e.campo.startsWith('cuotas.') || e.campo === 'archivoCuotas')

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
          <Campo etiqueta="Impuesto que se fracciona (opcional)">
            <select name="tipoImpuestoId" defaultValue="" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="">— sin especificar —</option>
              {tiposImpuesto.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Modalidad (opcional)">
            <input type="text" name="tipo" placeholder="IGV Justo, REFT…" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha de resolución SUNAT (opcional)">
            <input type="date" name="fechaResolucion" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Fecha de resolución obligatoria (opcional)">
            <input type="date" name="fechaResolucionObligatoria" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
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
          Transcribí cada cuota tal como figura en la resolución de SUNAT — subí un Excel, generá N
          cuotas iguales, o llená la tabla a mano.
        </p>
        <CuotasInput error={errorDe('cuotas')} permitirExcel plantillaHref="/financiamiento/fraccionamientos/nueva/plantilla-cuotas" />
        {erroresCuotas.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            {erroresCuotas.map((e, i) => <li key={i}>{e.mensaje}</li>)}
          </ul>
        ) : null}
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
