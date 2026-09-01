'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearOSAction, type EstadoFormulario } from './actions'
import { SelectorCondicionPago } from '@/components/selector-condicion-pago'

type ProveedorServicio = { id: string; razon_social: string }

export function FormularioOS({ proveedores }: { proveedores: ProveedorServicio[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearOSAction, null)
  const sucio = useMarcarSucioAlEditar()
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{errorDe('general')}</p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor de servicio" error={errorDe('proveedorServicioId')}>
          <select name="proveedorServicioId" required className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Elige uno…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.razon_social}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Descripción del servicio" error={errorDe('descripcionServicio')}>
          <textarea name="descripcionServicio" rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Monto estimado" error={errorDe('montoEstimado')}>
            <input type="number" name="montoEstimado" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
          <Campo etiqueta="Moneda">
            <select name="moneda" defaultValue="PEN" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Condición de pago en días">
            <SelectorCondicionPago name="condicionesPagoDias" required />
          </Campo>
          <Campo etiqueta="Fecha de entrega estimada (opcional)">
            <input type="date" name="fechaEntregaEstimada" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
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
      {pending ? 'Enviando…' : 'Crear orden de servicio'}
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
