'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { crearSolicitudAction, type EstadoFormulario } from './actions'
import { TIPOS_SOLICITUD, ETIQUETA_TIPO, type TipoSolicitud } from '@/domain/gasto'

type CategoriaGasto = { id: string; nombre: string }

export function FormularioSolicitud({ categorias }: { categorias: CategoriaGasto[] }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearSolicitudAction, null)
  const [tipo, setTipo] = useState<TipoSolicitud>('gasto_directo')

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Tipo" error={errorDe('tipo')}>
          <select
            name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            {TIPOS_SOLICITUD.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Categoría" error={errorDe('categoriaId')}>
          <select name="categoriaId" required className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Elegí una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Moneda" error={errorDe('moneda')}>
            <select name="moneda" defaultValue="PEN" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
          </Campo>
          <Campo etiqueta="Monto" error={errorDe('montoSolicitado')}>
            <input type="number" name="montoSolicitado" min="0" step="0.01" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        </div>

        <Campo etiqueta="Descripción" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>

        {tipo === 'anticipo' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Destino (opcional)">
              <input type="text" name="destino" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
            </Campo>
            <Campo etiqueta="Fecha de inicio">
              <input type="date" name="fechaInicio" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
            </Campo>
            <Campo etiqueta="Fecha de fin" error={errorDe('fechaFin')}>
              <input type="date" name="fechaFin" className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
            </Campo>
          </div>
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
      {pending ? 'Enviando…' : 'Enviar solicitud'}
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
