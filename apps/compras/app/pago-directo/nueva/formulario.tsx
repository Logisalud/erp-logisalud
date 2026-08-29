'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { registrarPagoDirectoAction, type EstadoFormulario } from './actions'
import { calcularDetraccionSugerida } from '@/domain/obligacion'

type ProveedorOpcion = { id: string; nombre: string }
type CategoriaOpcion = { id: string; nombre: string }
type TasaDetraccion = { id: string; categoria: string; porcentaje: number; anexo_sunat: string | null }

export function FormularioPagoDirecto({
  proveedores, categorias, tasasDetraccion,
}: {
  proveedores: ProveedorOpcion[]
  categorias: CategoriaOpcion[]
  tasasDetraccion: TasaDetraccion[]
}) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(registrarPagoDirectoAction, null)
  const [moneda, setMoneda] = useState('PEN')
  const [baseImponible, setBaseImponible] = useState('')
  const [tasaDetraccionId, setTasaDetraccionId] = useState('')
  const [montoDetraccion, setMontoDetraccion] = useState('')

  const tasaElegida = tasasDetraccion.find((t) => t.id === tasaDetraccionId)
  const detraccionSugerida = tasaElegida ? calcularDetraccionSugerida(Number(baseImponible) || 0, tasaElegida.porcentaje) : null

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor" error={errorDe('proveedorId')}>
          <select name="proveedorId" required defaultValue="" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="" disabled>Elige uno…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Categoría" error={errorDe('categoriaId')}>
          <select name="categoriaId" required defaultValue="" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="" disabled>Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Para qué es este gasto" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={2} required className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>
      </section>

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
        <Campo etiqueta="Moneda" error={errorDe('moneda')}>
          <select
            name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </Campo>
        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio" error={errorDe('tipoCambio')}>
            <input type="number" name="tipoCambio" min="0" step="0.0001" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}
        <Campo etiqueta="Base imponible (sin IGV)" error={errorDe('baseImponible')}>
          <input
            type="number" name="baseImponible" min="0" step="0.01" required
            value={baseImponible}
            onChange={(e) => setBaseImponible(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <p className="mt-1 text-xs text-gray-500">El IGV (18%) se calcula solo sobre esta base.</p>
        </Campo>
      </section>

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Detracción</h2>
        <Campo etiqueta="Categoría (opcional)">
          <select
            name="tasaDetraccionId"
            value={tasaDetraccionId}
            onChange={(e) => { setTasaDetraccionId(e.target.value); setMontoDetraccion('') }}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="">Sin detracción</option>
            {tasasDetraccion.map((t) => (
              <option key={t.id} value={t.id}>{t.categoria} — {t.porcentaje}%</option>
            ))}
          </select>
        </Campo>
        {tasaElegida ? (
          <Campo etiqueta="Monto de detracción" error={errorDe('montoDetraccion')}>
            <input
              type="number" name="montoDetraccion" min="0" step="0.01"
              value={montoDetraccion || (detraccionSugerida != null ? String(detraccionSugerida) : '')}
              onChange={(e) => setMontoDetraccion(e.target.value)}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            <p className="mt-1 text-xs text-gray-500">
              Sugerido: {detraccionSugerida} (base + IGV × {tasaElegida.porcentaje}%) — se puede ajustar.
            </p>
          </Campo>
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
      {pending ? 'Registrando…' : 'Registrar pago directo'}
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
