'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { crearProveedorAction, type EstadoFormulario } from './actions'
import { SelectorCondicionPago } from '@/components/selector-condicion-pago'
import type { TipoProveedorUnificado } from '@/domain/proveedor'

export function FormularioProveedor({ tipoInicial, volver }: { tipoInicial: TipoProveedorUnificado; volver?: string }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(crearProveedorAction, null)
  const sucio = useMarcarSucioAlEditar(estado)
  const errorDe = (campo: string) => estado?.errores.find((e) => e.campo === campo)?.mensaje

  return (
    <form action={accion} onChange={sucio.onChange} onSubmit={sucio.onSubmit} className="card space-y-3">
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
          <option value="servicio">Servicio (notaría, seguros, courier…)</option>
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

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Dirección fiscal</span>
        <input
          type="text" name="direccionFiscal"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>

      {/* Antes la cuenta bancaria solo se podía cargar DESPUÉS, desde la
          ficha del proveedor — y así quedaban proveedores a los que no se
          les podía pagar, cosa que recién se descubría el día del pago. */}
      <fieldset className="rounded-md border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium text-gray-800">Cuenta bancaria para pagarle</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-700">Banco</span>
            <input
              type="text" name="banco" required
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            {errorDe('banco') ? <p className="mt-1 text-red-700">{errorDe('banco')}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Tipo de cuenta (opcional)</span>
            <select name="tipoCuenta" defaultValue="" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="">Sin especificar</option>
              <option value="ahorros">Ahorros</option>
              <option value="corriente">Corriente</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-700">Número de cuenta</span>
            <input
              type="text" name="numeroCuenta" required inputMode="numeric"
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            {errorDe('numeroCuenta') ? <p className="mt-1 text-red-700">{errorDe('numeroCuenta')}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">CCI (20 dígitos)</span>
            <input
              type="text" name="cci" required maxLength={20} inputMode="numeric"
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            {errorDe('cci') ? <p className="mt-1 text-red-700">{errorDe('cci')}</p> : null}
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-700">Titular de la cuenta</span>
            <input
              type="text" name="titular" required
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
            {errorDe('titular') ? <p className="mt-1 text-red-700">{errorDe('titular')}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Moneda de la cuenta</span>
            <select name="monedaCuenta" defaultValue="PEN" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
            </select>
            {errorDe('monedaCuenta') ? <p className="mt-1 text-red-700">{errorDe('monedaCuenta')}</p> : null}
          </label>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Si todavía no tenés el CCI a mano, podés crear el proveedor desde el buscador de una orden
          y completar la cuenta después — va a quedar marcado como incompleto hasta entonces.
        </p>
      </fieldset>

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
