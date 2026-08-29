'use client'

import { useFormState, useFormStatus } from 'react-dom'
import {
  crearCuentaBancariaProveedorAction,
  eliminarCuentaBancariaProveedorAction,
  type EstadoFormularioCuenta,
} from './actions'
import type { CuentaBancaria } from '@/services/proveedores'

export function FormularioCuentaBancariaProveedor({
  proveedorId, cuentas, nombreProveedor,
}: {
  proveedorId: string
  cuentas: CuentaBancaria[]
  nombreProveedor: string
}) {
  const accionConProveedor = crearCuentaBancariaProveedorAction.bind(null, proveedorId)
  const [estado, accion] = useFormState<EstadoFormularioCuenta, FormData>(accionConProveedor, null)

  return (
    <section className="card mt-4">
      <h2 className="font-heading text-lg">Cuentas bancarias</h2>

      {cuentas.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {cuentas.map((c) => (
            <li key={c.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {c.banco} — {c.moneda}
                    {c.es_principal ? (
                      <span className="ml-2 rounded-full bg-logisalud-green/10 px-2 py-0.5 text-xs font-medium text-logisalud-green">
                        Principal
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-gray-600">
                    {c.numero_cuenta}{c.tipo_cuenta ? ` · ${c.tipo_cuenta}` : ''}
                  </p>
                  <p className="font-mono text-xs text-gray-500">CCI {c.cci}</p>
                  <p className="mt-0.5 text-gray-600">Titular: {c.titular}</p>
                </div>
                <form action={eliminarCuentaBancariaProveedorAction.bind(null, proveedorId, c.id)}>
                  <button type="submit" className="text-sm text-gray-500 underline">
                    Eliminar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-600">
          Sin cuentas registradas. Sin una cuenta no se le puede programar un pago.
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-logisalud-teal">
          Agregar cuenta
        </summary>

        <form action={accion} className="mt-3 space-y-3">
          {estado?.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
              {estado.error}
            </p>
          ) : null}

          <Campo etiqueta="Banco">
            <input type="text" name="banco" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Tipo de cuenta">
              <select name="tipoCuenta" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
                <option value="ahorros">Ahorros</option>
                <option value="corriente">Corriente</option>
              </select>
            </Campo>
            <Campo etiqueta="Moneda">
              <select name="moneda" className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
                <option value="PEN">PEN — Soles</option>
                <option value="USD">USD — Dólares</option>
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Número de cuenta">
            <input type="text" name="numeroCuenta" required className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>

          <Campo etiqueta="CCI (20 dígitos)">
            <input
              type="text" name="cci" required minLength={20} maxLength={20}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>

          <Campo etiqueta="Titular de la cuenta">
            <input
              type="text" name="titular" required defaultValue={nombreProveedor}
              className="min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </Campo>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="esPrincipal" className="h-5 w-5" />
            Usar como cuenta principal en esta moneda
          </label>

          <BotonGuardar />
        </form>
      </details>
    </section>
  )
}

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? 'Guardando…' : 'Agregar cuenta'}
    </button>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-800">{etiqueta}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
