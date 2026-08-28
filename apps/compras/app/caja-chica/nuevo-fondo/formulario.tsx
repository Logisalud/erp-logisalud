'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { crearFondoAction, type EstadoFormulario } from './actions'

type Usuario = { id: string; nombre: string; area: string }

export function FormularioFondo({ usuarios }: { usuarios: Usuario[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearFondoAction, null)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="card space-y-3">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Custodio</span>
        <select name="custodioId" required defaultValue="" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
          <option value="" disabled>Elegí quién lo va a administrar…</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre} — {u.area}</option>
          ))}
        </select>
        {errorDe('custodioId') ? <p className="mt-1 text-red-700">{errorDe('custodioId')}</p> : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Área del fondo</span>
        <input
          type="text" name="area" required defaultValue="almacen"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
        {errorDe('area') ? <p className="mt-1 text-red-700">{errorDe('area')}</p> : null}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Monto fijo</span>
          <input
            type="number" name="montoFijo" min="0" step="0.01" required
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          {errorDe('montoFijo') ? <p className="mt-1 text-red-700">{errorDe('montoFijo')}</p> : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-800">Moneda</span>
          <select name="moneda" defaultValue="PEN" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Descripción (opcional)</span>
        <input
          type="text" name="descripcion"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Abriendo…' : 'Abrir fondo'}
    </button>
  )
}
