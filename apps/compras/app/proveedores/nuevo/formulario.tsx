'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearProveedorAction, type EstadoFormulario } from './actions'
import { SelectorCondicionPago } from '@/components/selector-condicion-pago'

export function FormularioProveedor({ tipoInicial, volver }: { tipoInicial: 'mercaderia' | 'bien' | 'ambos'; volver?: string }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearProveedorAction, null)
  const sucio = useMarcarSucioAlEditar()
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} onChange={sucio.onChange} className="card space-y-3">
      {volver ? <input type="hidden" name="volver" value={volver} /> : null}
      {errorDe('general') ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          {errorDe('general')}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Qué le compramos a este proveedor</span>
        <select
          name="tipo" defaultValue={tipoInicial}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
        >
          <option value="mercaderia">Mercadería (productos que revendemos)</option>
          <option value="bien">Bienes que NO revendemos (equipos, muebles)</option>
          <option value="ambos">Ambos</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">RUC</span>
          <input
            type="text" name="ruc" required maxLength={11} inputMode="numeric"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          {errorDe('ruc') ? <p className="mt-1 text-red-700">{errorDe('ruc')}</p> : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-800">Razón social</span>
          <input
            type="text" name="razonSocial" required
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          {errorDe('razonSocial') ? <p className="mt-1 text-red-700">{errorDe('razonSocial')}</p> : null}
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Nombre comercial (opcional)</span>
        <input
          type="text" name="nombreComercial"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Contacto (opcional)</span>
          <input
            type="text" name="contactoNombre"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Correo (opcional)</span>
          <input
            type="email" name="contactoEmail"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Teléfono (opcional)</span>
          <input
            type="tel" name="contactoTelefono"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Condición de pago (días)</span>
          <div className="mt-1">
            <SelectorCondicionPago name="condicionPagoDias" defaultValue={30} required />
          </div>
          {errorDe('condicionPagoDias') ? <p className="mt-1 text-red-700">{errorDe('condicionPagoDias')}</p> : null}
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Moneda principal</span>
          <select name="monedaPrincipal" defaultValue="PEN" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="PEN">PEN — Soles</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </label>
      </div>

      <BotonGuardar />
    </form>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Registrando…' : 'Registrar proveedor'}
    </button>
  )
}
