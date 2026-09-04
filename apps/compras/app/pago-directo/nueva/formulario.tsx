'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { registrarPagoDirectoAction, type EstadoFormulario } from './actions'
import {
  calcularDetraccionSugerida,
  CONDICIONES_PAGO_DIAS,
  etiquetaCondicionPago,
  igvDeBase,
} from '@/domain/obligacion'
import { BuscadorProveedor, type ProveedorElegido } from '@/components/buscador-proveedor'

type CategoriaOpcion = { id: string; nombre: string }
type TasaDetraccion = { id: string; categoria: string; porcentaje: number; anexo_sunat: string | null }

const fmt = (n: number) => n.toFixed(2)

export function FormularioPagoDirecto({
  categorias, tasasDetraccion,
}: {
  categorias: CategoriaOpcion[]
  tasasDetraccion: TasaDetraccion[]
}) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(registrarPagoDirectoAction, null)
  const sucio = useMarcarSucioAlEditar()
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(null)
  const [moneda, setMoneda] = useState('PEN')
  const [categoriaId, setCategoriaId] = useState('')
  const [baseImponible, setBaseImponible] = useState('')
  const [tasaDetraccionId, setTasaDetraccionId] = useState('')
  const [montoDetraccion, setMontoDetraccion] = useState('')
  const [pendienteFactura, setPendienteFactura] = useState(false)
  const [condicionPagoDias, setCondicionPagoDias] = useState<number | null>(null)

  const tasaElegida = tasasDetraccion.find((t) => t.id === tasaDetraccionId)
  const detraccionSugerida = tasaElegida ? calcularDetraccionSugerida(Number(baseImponible) || 0, tasaElegida.porcentaje) : null

  // Pieza B1: el IGV no es editable, pero sí tiene que verse mientras se
  // escribe la base — antes había que guardar para descubrir el total.
  const base = Number(baseImponible) || 0
  const igv = igvDeBase(base)
  const total = base + igv

  // Pieza F: se propone la condición del proveedor y se puede ajustar. El
  // `??` mira el estado local primero para no pisar lo que la persona eligió
  // a mano al cambiar de proveedor.
  const condicionEfectiva = condicionPagoDias ?? proveedor?.condicionPagoDias ?? 30

  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  // Pieza G: registrar en dólares es la excepción, no un ítem más de un
  // desplegable — el cambio de moneda pide confirmación explícita.
  const elegirMoneda = (nueva: string) => {
    if (nueva === 'USD' && moneda !== 'USD') {
      const ok = window.confirm('¿Estás seguro? Vas a registrar este pago en dólares.')
      if (!ok) return
    }
    setMoneda(nueva)
  }

  return (
    <form action={accion} onChange={sucio.onChange} className="space-y-4">
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      {/* El aviso por correo (Pieza D) necesita los nombres, no los ids. */}
      <input type="hidden" name="proveedorNombre" value={proveedor?.nombre ?? ''} />
      <input type="hidden" name="categoriaNombre" value={categorias.find((c) => c.id === categoriaId)?.nombre ?? ''} />

      <section className="card space-y-3">
        <Campo etiqueta="Proveedor *" error={errorDe('proveedorId')}>
          <BuscadorProveedor valor={proveedor} onElegir={setProveedor} />
          <input type="hidden" name="proveedorId" value={proveedor?.id ?? ''} />
        </Campo>

        <Campo etiqueta="Categoría *" error={errorDe('categoriaId')}>
          <select
            name="categoriaId" required value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="" disabled>Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Para qué es este gasto *" error={errorDe('descripcion')}>
          <textarea name="descripcion" rows={2} required className="w-full rounded-md border border-gray-300 px-3 py-2" />
        </Campo>
      </section>

      <section className="card space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox" name="pendienteFactura" value="si"
            checked={pendienteFactura}
            onChange={(e) => setPendienteFactura(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="font-medium text-gray-800">El proveedor todavía no emitió la factura</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Registra el compromiso con la cotización y queda <strong>pendiente de factura</strong>. No se puede
              pagar hasta completar los datos reales del comprobante.
            </span>
          </span>
        </label>

        {pendienteFactura ? (
          <Campo etiqueta="📎 Cotización que sustenta el monto">
            <input
              type="file" name="cotizacion" accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
            />
          </Campo>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="N° de factura *" error={errorDe('numeroFactura')}>
              <input type="text" name="numeroFactura" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
            </Campo>
            <Campo etiqueta="Fecha de factura *" error={errorDe('fechaFactura')}>
              <input
                type="date" name="fechaFactura" required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="min-h-12 w-full rounded-md border border-gray-300 px-3"
              />
            </Campo>
          </div>
        )}
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Moneda *" error={errorDe('moneda')}>
          <div className="flex gap-2">
            {['PEN', 'USD'].map((m) => (
              <button
                key={m} type="button" onClick={() => elegirMoneda(m)}
                aria-pressed={moneda === m}
                className={`min-h-12 flex-1 rounded-md border px-3 font-medium ${
                  moneda === m
                    ? 'border-logisalud-green bg-logisalud-green text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                {m === 'PEN' ? 'S/ Soles' : 'US$ Dólares'}
              </button>
            ))}
          </div>
          <input type="hidden" name="moneda" value={moneda} />
        </Campo>

        <Campo etiqueta="Condición de pago *" error={errorDe('condicionPagoDias')}>
          <select
            name="condicionPagoDias" value={condicionEfectiva}
            onChange={(e) => setCondicionPagoDias(Number(e.target.value))}
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            {CONDICIONES_PAGO_DIAS.map((d) => (
              <option key={d} value={d}>{etiquetaCondicionPago(d)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {proveedor
              ? `Propuesta del proveedor: ${etiquetaCondicionPago(proveedor.condicionPagoDias)}. El vencimiento se cuenta desde la fecha de factura.`
              : 'El vencimiento del pago se cuenta desde la fecha de factura.'}
          </p>
        </Campo>

        {moneda === 'USD' ? (
          <Campo etiqueta="Tipo de cambio *" error={errorDe('tipoCambio')}>
            <input type="number" name="tipoCambio" min="0" step="0.0001" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>
        ) : null}

        <Campo etiqueta="Base imponible (sin IGV) *" error={errorDe('baseImponible')}>
          <input
            type="number" name="baseImponible" min="0" step="0.01" required
            value={baseImponible}
            onChange={(e) => setBaseImponible(e.target.value)}
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </Campo>

        <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Base imponible</span><span className="tabular-nums">{fmt(base)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">IGV (18%)</span><span className="tabular-nums">{fmt(igv)}</span></div>
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-heading text-lg">Detracción</h2>
        <Campo etiqueta="Categoría">
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
