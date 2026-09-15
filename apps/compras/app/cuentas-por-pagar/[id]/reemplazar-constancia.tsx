'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import { ARCHIVOS_REEMPLAZABLES, ETIQUETA_ARCHIVO } from '@/domain/reemplazo-constancia'
import {
  reemplazarConstanciaAction, subirVoucherHistoricoAction, type EstadoAccion,
} from './actions'

/**
 * Reemplazar el archivo de la constancia de un pago ya registrado — solo el
 * archivo, ningún dato financiero.
 *
 * El formulario no tiene campos de fecha, monto ni cuenta, y el servicio
 * tampoco los recibe: no hay forma de tocarlos desde acá. Lo que sí pide es
 * un MOTIVO obligatorio, porque cambiar el respaldo documental de una salida
 * de dinero sin dejar rastro es lo que separa "corregir" de "alterar".
 */
export function BotonReemplazarConstancia({
  obligacionId, codigo, tieneDetraccion,
}: { obligacionId: string; codigo: string; tieneDetraccion: boolean }) {
  const conId = reemplazarConstanciaAction.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)
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
    const resultado = await subirVoucherHistoricoAction(codigo, datos)
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

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-3">
        Reemplazar constancia…
      </button>
    )
  }

  // Sin detracción cargada no hay nada que reemplazar ahí: se omite la
  // opción en vez de ofrecer algo que va a fallar.
  const opciones = ARCHIVOS_REEMPLAZABLES.filter((a) => a !== 'detraccion' || tieneDetraccion)

  return (
    <form action={dispatch} className="card mt-3 w-full space-y-3 border-amber-300">
      <p className="text-sm text-gray-700">
        Esto cambia <strong>solo el archivo</strong>. La fecha, el monto, el N° de operación y la
        cuenta quedan exactamente como están. El archivo anterior no se borra: queda guardado
        junto con el registro de este reemplazo.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}

      <input type="hidden" name="archivoPath" value={path ?? ''} />

      <label className="block text-sm">
        <span className="font-medium text-gray-800">¿Qué archivo reemplazas? *</span>
        <select
          name="cual" required defaultValue="voucher"
          className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
        >
          {opciones.map((a) => (
            <option key={a} value={a}>{ETIQUETA_ARCHIVO[a]}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">📎 Archivo nuevo *</span>
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

      <label className="block text-sm">
        <span className="font-medium text-gray-800">¿Por qué lo reemplazas? *</span>
        <textarea
          name="motivo" required rows={2}
          placeholder="Ej.: subí la foto equivocada"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-gray-500">
          Queda visible en la ficha junto a tu nombre y la fecha.
        </span>
      </label>

      <div className="flex gap-2">
        <BotonConfirmar bloqueado={subiendo || !path} />
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
      className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {pending ? 'Reemplazando…' : 'Confirmar reemplazo'}
    </button>
  )
}
