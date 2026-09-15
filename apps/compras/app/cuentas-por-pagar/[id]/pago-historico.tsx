'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import {
  registrarPagoHistoricoAction, subirVoucherHistoricoAction, type EstadoAccion,
} from './actions'

/**
 * "Registrar pago ya realizado" — solo para el backlog anterior al ERP.
 *
 * Acá el archivo no es una factura pendiente: es la CONSTANCIA de que el
 * pago ya ocurrió. Por eso la obligación pasa directo a `pagada`, sin
 * conformidad ni propuesta — no hay nada que aprobar sobre un desembolso de
 * hace ocho meses.
 *
 * La constancia se sube AL ELEGIRLA, en su propio request: si viajara en el
 * mismo submit que la cotización ya adjunta, dos fotos de celular pasarían
 * del límite de body y el envío se rechazaría sin dejar error que mostrar.
 */
export function BotonPagoHistorico({
  obligacionId, codigo,
}: { obligacionId: string; codigo: string }) {
  const conId = registrarPagoHistoricoAction.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)
  const [voucherPath, setVoucherPath] = useState<string | null>(null)
  const [voucherNombre, setVoucherNombre] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) {
      setVoucherPath(null)
      setVoucherNombre(null)
      setErrorArchivo(null)
      return
    }
    if (excedeTamanoMaximo(archivo.size)) {
      setErrorArchivo(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
      setVoucherPath(null)
      setVoucherNombre(null)
      return
    }
    setSubiendo(true)
    setErrorArchivo(null)
    const form = new FormData()
    form.append('archivo', archivo)
    const resultado = await subirVoucherHistoricoAction(codigo, form)
    setSubiendo(false)
    if ('path' in resultado) {
      setVoucherPath(resultado.path)
      setVoucherNombre(archivo.name)
    } else {
      setVoucherPath(null)
      setVoucherNombre(null)
      setErrorArchivo(`${resultado.error} Puedes registrar el pago igual y subir la constancia después.`)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-primary mt-4">
        Registrar pago ya realizado
      </button>
    )
  }

  return (
    <form action={dispatch} className="card mt-4 w-full space-y-3 border-logisalud-green">
      <p className="text-sm text-gray-700">
        Esto documenta un pago del backlog que <strong>ya ocurrió</strong>. La obligación pasa
        directo a &ldquo;Pagada&rdquo;: no va a pedir conformidad ni entrar a una propuesta,
        porque no hay nada que aprobar sobre algo ya desembolsado.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <input type="hidden" name="voucherPath" value={voucherPath ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Fecha real del pago *</span>
          {/* Obligatoria y nunca `now()`: son pagos de hace meses, y con la
              fecha de hoy el historial y los reportes por período quedarían
              inservibles. */}
          <input
            type="date" name="fechaPago" required
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          <span className="mt-1 block text-xs text-gray-500">
            La que figura en el voucher, no la de hoy.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">N° de operación</span>
          <input
            type="text" name="numeroOperacion"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">📎 Constancia del pago</span>
        <input
          type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
        {subiendo ? <span className="mt-1 block text-xs text-gray-500">Subiendo…</span> : null}
        {voucherNombre ? (
          <span className="mt-1 block text-xs text-green-700">Subida: {voucherNombre}</span>
        ) : null}
        {errorArchivo ? (
          <span className="mt-1 block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {errorArchivo}
          </span>
        ) : null}
      </label>

      <div className="flex gap-2">
        <BotonConfirmar bloqueado={subiendo} />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmar({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending || bloqueado}
      className="rounded-md bg-logisalud-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Registrando…' : 'Confirmar pago realizado'}
    </button>
  )
}
