'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  cambiarActivoAction,
  guardarDatosProveedorAction,
  crearCuentaBancariaAction,
  eliminarCuentaBancariaAction,
  type EstadoAccion,
  type EstadoFormularioCuenta,
} from './acciones-unificadas'
import { useMarcarSucioAlEditar } from '@/components/formulario-sucio-provider'
import { enmascararCuenta, ETIQUETA_FUENTE_PROVEEDOR, type FuenteProveedor } from '@/domain/proveedor'
import type { DetalleProveedorUnificado, CuentaBancariaUnificada } from '@/services/proveedores-unificado'

/**
 * Ficha de proveedor compartida entre compras.proveedores y
 * servicios.proveedores_servicio (misma forma, misma UI) — cada acción
 * lleva la `fuente` para pegarle a la tabla correcta.
 */
export function DetalleProveedor({
  proveedor,
  cuentas,
  tieneMovimientos,
}: {
  proveedor: DetalleProveedorUnificado
  cuentas: CuentaBancariaUnificada[]
  tieneMovimientos: boolean
}) {
  return (
    <>
      <section className="card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg">Datos</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {ETIQUETA_FUENTE_PROVEEDOR[proveedor.fuente]}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="RUC" valor={proveedor.ruc} />
          <Dato termino="Nombre comercial" valor={proveedor.nombreComercial} />
          <Dato termino="Contacto" valor={proveedor.contactoNombre} />
          <Dato termino="Correo" valor={proveedor.contactoEmail} />
          <Dato termino="Teléfono" valor={proveedor.contactoTelefono} />
          <Dato termino="Condición de pago" valor={`${proveedor.condicionPagoDias} días`} />
          <Dato termino="Moneda" valor={proveedor.monedaPrincipal} />
          <Dato termino="Estado" valor={proveedor.activo ? 'Activo' : 'Inactivo'} />
        </dl>
      </section>

      <FormularioDatosAdicionales proveedor={proveedor} />

      <ActivarDesactivar proveedor={proveedor} tieneMovimientos={tieneMovimientos} />

      <CuentasBancarias fuente={proveedor.fuente} proveedorId={proveedor.id} cuentas={cuentas} nombreProveedor={proveedor.razonSocial} />
    </>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}

function FormularioDatosAdicionales({ proveedor }: { proveedor: DetalleProveedorUnificado }) {
  const accion = guardarDatosProveedorAction.bind(null, proveedor.fuente, proveedor.id)
  const [estado, ejecutar] = useFormState<EstadoAccion, FormData>(accion, null)
  const sucio = useMarcarSucioAlEditar()

  return (
    <form action={ejecutar} onChange={sucio.onChange} className="card mt-4 space-y-3">
      <h2 className="font-heading text-lg">Dirección y observaciones</h2>
      {estado?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
      ) : null}
      <label className="block text-sm">
        <span className="font-medium text-gray-800">Dirección fiscal</span>
        <input
          type="text" name="direccionFiscal" defaultValue={proveedor.direccionFiscal ?? ''}
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-800">Observaciones</span>
        <textarea
          name="observaciones" rows={2} defaultValue={proveedor.observaciones ?? ''}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>
      <BotonPequeno texto="Guardar" textoPending="Guardando…" />
    </form>
  )
}

function ActivarDesactivar({ proveedor, tieneMovimientos }: { proveedor: DetalleProveedorUnificado; tieneMovimientos: boolean }) {
  const [confirmando, setConfirmando] = useState(false)
  const accion = cambiarActivoAction.bind(null, proveedor.fuente, proveedor.id, !proveedor.activo, confirmando)
  const [estado, ejecutar] = useFormState<EstadoAccion, FormData>(accion, null)

  return (
    <section className="card mt-4">
      <h2 className="font-heading text-lg">Estado</h2>
      {estado?.error ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <p>{estado.error}</p>
          {tieneMovimientos ? (
            <button type="button" onClick={() => setConfirmando(true)} className="mt-2 text-sm font-medium underline">
              Sí, ya lo sé — desactivar igual
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-600">
          {proveedor.activo ? 'Este proveedor está activo — aparece en los buscadores de OC/OS/pagos.' : 'Este proveedor está inactivo — no aparece en los buscadores.'}
        </p>
      )}
      <form action={ejecutar} className="mt-3">
        <BotonPequeno texto={proveedor.activo ? 'Desactivar proveedor' : 'Reactivar proveedor'} textoPending="Guardando…" secundario />
      </form>
    </section>
  )
}

function CuentasBancarias({
  fuente, proveedorId, cuentas, nombreProveedor,
}: { fuente: FuenteProveedor; proveedorId: string; cuentas: CuentaBancariaUnificada[]; nombreProveedor: string }) {
  const [mostrarCompletas, setMostrarCompletas] = useState<Set<string>>(new Set())
  const accion = crearCuentaBancariaAction.bind(null, fuente, proveedorId)
  const [estado, ejecutar] = useFormState<EstadoFormularioCuenta, FormData>(accion, null)
  const sucio = useMarcarSucioAlEditar()

  function alternarVisible(id: string) {
    setMostrarCompletas((actual) => {
      const copia = new Set(actual)
      copia.has(id) ? copia.delete(id) : copia.add(id)
      return copia
    })
  }

  return (
    <section className="card mt-4">
      <h2 className="font-heading text-lg">Cuentas bancarias</h2>

      {cuentas.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {cuentas.map((c) => {
            const visible = mostrarCompletas.has(c.id)
            return (
              <li key={c.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-medium">
                      {c.banco} — {c.moneda}
                      {c.esPrincipal ? (
                        <span className="ml-2 rounded-full bg-logisalud-green/10 px-2 py-0.5 text-xs font-medium text-logisalud-green">
                          Principal
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-mono text-gray-600">
                      {visible ? c.numeroCuenta : enmascararCuenta(c.numeroCuenta)}
                      {c.tipoCuenta ? ` · ${c.tipoCuenta}` : ''}
                    </p>
                    <p className="font-mono text-xs text-gray-500">CCI {visible ? c.cci : enmascararCuenta(c.cci)}</p>
                    <p className="mt-0.5 text-gray-600">Titular: {c.titular}</p>
                    <button type="button" onClick={() => alternarVisible(c.id)} className="mt-1 text-xs text-logisalud-teal underline">
                      {visible ? 'Ocultar número completo' : 'Ver número completo'}
                    </button>
                  </div>
                  <form action={eliminarCuentaBancariaAction.bind(null, fuente, proveedorId, c.id)}>
                    <button type="submit" className="text-sm text-gray-500 underline">Eliminar</button>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-600">Sin cuentas registradas. Sin una cuenta no se le puede programar un pago.</p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-logisalud-teal">Agregar cuenta</summary>

        <form action={ejecutar} onChange={sucio.onChange} className="mt-3 space-y-3">
          {estado?.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
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
            <input type="text" name="cci" required minLength={20} maxLength={20} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>

          <Campo etiqueta="Titular de la cuenta">
            <input type="text" name="titular" required defaultValue={nombreProveedor} className="min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </Campo>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="esPrincipal" className="h-5 w-5" />
            Usar como cuenta principal en esta moneda
          </label>

          <BotonPequeno texto="Agregar cuenta" textoPending="Guardando…" />
        </form>
      </details>
    </section>
  )
}

function BotonPequeno({ texto, textoPending, secundario }: { texto: string; textoPending: string; secundario?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={secundario ? 'btn-secondary w-full sm:w-auto' : 'btn-primary w-full sm:w-auto'}>
      {pending ? textoPending : texto}
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
