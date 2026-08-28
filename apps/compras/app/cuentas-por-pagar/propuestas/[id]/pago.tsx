'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { ejecutarPagoAction, type EstadoAccion } from './actions'

type CuentaBancaria = { id: string; banco: string; numero_cuenta: string; moneda: string; es_principal: boolean }

export function FormularioPago({
  propuestaId, obligacionId, cuentas, tipoCuentas,
}: {
  propuestaId: string
  obligacionId: string
  cuentas: CuentaBancaria[]
  /** A quién pertenecen `cuentas` — decide qué columna de cuentas_x_pagar.pagos
   * se llena (un proveedor y un empleado nunca comparten esa columna). */
  tipoCuentas: 'proveedor' | 'empleado'
}) {
  const accionConDatos = ejecutarPagoAction.bind(null, propuestaId)
  const [estado, accion] = useFormState<EstadoAccion, FormData>(accionConDatos, null)
  const nombreCampoCuenta = tipoCuentas === 'proveedor' ? 'cuentaBancariaProveedorId' : 'cuentaBancariaEmpleadoId'

  return (
    <form action={accion} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <input type="hidden" name="obligacionId" value={obligacionId} />
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-gray-600">Fecha de pago</span>
          <input
            type="date" name="fechaPago" required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        {cuentas.length > 0 ? (
          <label className="block text-sm">
            <span className="text-gray-600">Cuenta destino</span>
            <select
              name={nombreCampoCuenta}
              defaultValue={cuentas.find((c) => c.es_principal)?.id ?? cuentas[0]?.id}
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
            >
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.banco} — {c.numero_cuenta} ({c.moneda})</option>
              ))}
            </select>
          </label>
        ) : tipoCuentas === 'empleado' ? (
          <p className="text-xs text-amber-700 sm:col-span-2">
            {'El beneficiario todavía no cargó su cuenta bancaria en "Mi cuenta bancaria".'}
          </p>
        ) : null}
        <label className="block text-sm">
          <span className="text-gray-600">N° de voucher</span>
          <input type="text" name="numeroVoucher" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
      </div>

      <BotonPagar />
    </form>
  )
}

function BotonPagar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary">
      {pending ? 'Registrando…' : 'Registrar pago'}
    </button>
  )
}
