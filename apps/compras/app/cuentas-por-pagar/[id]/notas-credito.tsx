'use client'

import { useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { registrarNotaCreditoAction, aplicarNotaCreditoAction, type EstadoAccion } from './actions'
import { Money } from '@/components/money'

type NotaCredito = { id: string; numero_nc: string | null; monto: number; motivo: string; aplicada: boolean }

export function NotasCredito({
  obligacionId, moneda, notasCredito,
}: { obligacionId: string; moneda: string; notasCredito: NotaCredito[] }) {
  const accionConObligacion = registrarNotaCreditoAction.bind(null, obligacionId)
  const [estado, accion] = useFormState<EstadoAccion, FormData>(accionConObligacion, null)

  return (
    <div className="mt-3 space-y-3">
      {notasCredito.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay ninguna.</p>
      ) : (
        <ul className="space-y-2">
          {notasCredito.map((nc) => (
            <li key={nc.id} className="flex items-center justify-between rounded-md border border-gray-200 p-3 text-sm">
              <div>
                <p className="font-medium">
                  {nc.numero_nc ? `${nc.numero_nc} — ` : ''}<Money valor={nc.monto} moneda={moneda} />
                </p>
                <p className="text-gray-600">{nc.motivo}</p>
              </div>
              {nc.aplicada ? (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Aplicada</span>
              ) : (
                <BotonAplicar obligacionId={obligacionId} notaCreditoId={nc.id} />
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={accion} className="rounded-md border border-gray-200 p-3">
        {estado?.error ? <p className="mb-2 text-sm text-red-700">{estado.error}</p> : null}
        <p className="mb-2 text-sm font-medium text-gray-800">Registrar nueva nota de crédito</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-gray-600">N° de NC (opcional)</span>
            <input type="text" name="numeroNc" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Monto</span>
            <input type="number" name="monto" min="0" step="0.01" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="text-gray-600">Motivo</span>
            <input type="text" name="motivo" className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          </label>
        </div>
        <BotonRegistrar />
      </form>
    </div>
  )
}

function BotonRegistrar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-secondary mt-3">
      {pending ? 'Guardando…' : 'Registrar'}
    </button>
  )
}

function BotonAplicar({ obligacionId, notaCreditoId }: { obligacionId: string; notaCreditoId: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const resultado = await aplicarNotaCreditoAction(obligacionId, notaCreditoId)
          if (resultado?.error) alert(resultado.error)
        })
      }
      className="shrink-0 text-sm text-logisalud-teal underline"
    >
      {pending ? 'Aplicando…' : 'Aplicar'}
    </button>
  )
}
