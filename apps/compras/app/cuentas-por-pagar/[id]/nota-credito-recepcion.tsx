'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import { netoTrasNotaCredito } from '@/domain/nota-credito-recepcion'
import { Money } from '@/components/money'
import {
  registrarNotaCreditoDeRecepcionAction, subirArchivoNotaCreditoAction, type EstadoAccion,
} from './actions'

/**
 * La única salida del Caso A: en la recepción llegó MENOS de lo que el
 * proveedor facturó, así que la obligación existe por el monto facturado
 * —eso es lo que se debe hasta que haya nota de crédito— pero no entra a
 * ninguna propuesta de pago.
 *
 * El formulario no ofrece "liberar sin NC" ni nada parecido a propósito: si
 * se pudiera saltear, el freno no serviría de nada. Lo que sí hace es decir
 * en plata cuánto va a quedar por pagar, en vivo, mientras se escribe el
 * monto — es el número que Contabilidad está tratando de conciliar.
 */
export function NotaCreditoDeRecepcion({
  obligacionId, codigo, total, moneda, observaciones,
}: {
  obligacionId: string
  codigo: string
  total: number
  moneda: string
  observaciones: string | null
}) {
  const conId = registrarNotaCreditoDeRecepcionAction.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [monto, setMonto] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) {
      setPath(null)
      setNombre(null)
      setErrorArchivo(null)
      return
    }
    if (excedeTamanoMaximo(archivo.size)) {
      setErrorArchivo(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
      setPath(null)
      setNombre(null)
      return
    }
    setSubiendo(true)
    setErrorArchivo(null)
    const datos = new FormData()
    datos.append('archivo', archivo)
    const resultado = await subirArchivoNotaCreditoAction(codigo, datos)
    setSubiendo(false)
    if ('path' in resultado) {
      setPath(resultado.path)
      setNombre(archivo.name)
    } else {
      setPath(null)
      setNombre(null)
      setErrorArchivo(resultado.error)
    }
  }

  const montoNumero = Number(monto)
  const montoValido = Number.isFinite(montoNumero) && montoNumero > 0 && montoNumero <= total
  const neto = montoValido ? netoTrasNotaCredito(total, montoNumero) : null

  return (
    <form action={dispatch} className="card-highlight space-y-3 border-amber-400">
      <div>
        <h2 className="font-heading text-lg">Falta la nota de crédito del proveedor</h2>
        <p className="mt-1 text-sm text-gray-700">
          En la recepción llegó menos mercadería de la que dice la factura, así que esta obligación
          no entra a ninguna propuesta de pago hasta que el proveedor emita la nota de crédito y la
          registres acá.
        </p>
        {observaciones ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {observaciones}
          </p>
        ) : null}
      </div>

      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <input type="hidden" name="archivoPath" value={path ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-800">N° de la nota de crédito *</span>
          <input
            type="text" name="numeroNc" required placeholder="Ej.: F001-00000123"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Fecha de emisión *</span>
          <input
            type="date" name="fechaEmision" required
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-800">Monto de la nota de crédito *</span>
          <input
            type="number" name="monto" required min="0.01" max={total} step="0.01"
            value={monto} onChange={(e) => setMonto(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3 tabular-nums"
          />
          <span className="mt-1 block text-xs text-gray-500">
            La factura dice <Money valor={total} moneda={moneda} />. La nota de crédito no puede ser mayor.
          </span>
        </label>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <p className="text-gray-500">Queda por pagar</p>
          <p className="mt-0.5 font-heading text-xl">
            {neto === null ? '—' : <Money valor={neto} moneda={moneda} />}
          </p>
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">¿Qué dice la nota de crédito? *</span>
        <textarea
          name="motivo" required rows={2}
          placeholder="Ej.: anula 20 unidades que el proveedor facturó y no despachó"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">📎 Nota de crédito (PDF o foto) *</span>
        <input
          type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => elegir(e.target.files?.[0])}
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
        />
        {subiendo ? <span className="mt-1 block text-xs text-gray-500">Subiendo…</span> : null}
        {nombre ? <span className="mt-1 block text-xs text-green-700">Subido: {nombre}</span> : null}
        {errorArchivo ? (
          <span className="mt-1 block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {errorArchivo}
          </span>
        ) : null}
      </label>

      <BotonRegistrar bloqueado={subiendo || !path} />
      <p className="text-xs text-gray-500">
        Al registrarla, la nota de crédito queda aplicada y la obligación pasa a estar disponible
        para propuesta de pago por el neto.
      </p>
    </form>
  )
}

function BotonRegistrar({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || bloqueado} className="btn-primary">
      {pending ? 'Registrando…' : 'Registrar nota de crédito'}
    </button>
  )
}
