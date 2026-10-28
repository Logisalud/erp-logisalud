'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  anularConstanciaAction, registrarConstanciaAction, verConstanciaAction, type EstadoConstancia,
} from './acciones-constancias'
import type { FuenteProveedor } from '@/domain/proveedor'

export function FormularioConstancia({ fuente, proveedorId }: { fuente: FuenteProveedor; proveedorId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [estado, accion] = useFormState<EstadoConstancia, FormData>(
    registrarConstanciaAction.bind(null, fuente, proveedorId),
    null,
  )
  if (!abierto || (estado && 'ok' in estado)) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary w-full sm:w-auto">
        Registrar constancia de suspensión
      </button>
    )
  }
  return (
    <form action={accion} className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="text-sm text-gray-600">
        Con la constancia registrada, a sus recibos de ese año no se les retiene el 8%. Sin el documento adjunto no
        se puede guardar: es el respaldo ante SUNAT.
      </p>
      {estado && 'error' in estado ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{estado.error}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">N° de constancia *</span>
          <input type="text" name="numero" required className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Fecha de emisión *</span>
          <input type="date" name="fechaEmision" required className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
          <span className="mt-1 block text-xs text-gray-500">Vale para los recibos de ese año, desde esta fecha.</span>
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium text-gray-800">📎 Constancia (PDF o imagen) *</span>
        <input
          type="file" name="archivo" required accept="application/pdf,image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
      </label>
      <div className="flex gap-2">
        <Guardar />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">Cancelar</button>
      </div>
    </form>
  )
}

function Guardar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Guardar constancia'}
    </button>
  )
}

export function BotonAnularConstancia({
  fuente, proveedorId, constanciaId,
}: { fuente: FuenteProveedor; proveedorId: string; constanciaId: string }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-gray-500 underline">
        Anular
      </button>
    )
  }
  return (
    <form action={anularConstanciaAction.bind(null, fuente, proveedorId, constanciaId)} className="flex items-center gap-2">
      <input type="text" name="motivo" required placeholder="Motivo" className="min-h-10 rounded-md border border-gray-300 px-2 text-xs" />
      <button type="submit" className="text-xs text-red-700 underline">Confirmar</button>
    </form>
  )
}

export function BotonVerConstancia({ storagePath }: { storagePath: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const url = await verConstanciaAction(storagePath)
        if (url) window.open(url, '_blank', 'noopener')
      }}
      className="text-xs text-logisalud-teal underline"
    >
      Ver documento
    </button>
  )
}
