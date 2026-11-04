'use client'

import { useState, useTransition } from 'react'
import { VerVoucher } from '@/app/cuentas-por-pagar/[id]/ver-voucher'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import type { TipoPapel } from '@/domain/recepcion-tres-columnas'
import { ETIQUETA_TIPO_PAPEL } from '@/domain/correccion-papeles-recepcion'
import { corregirPapelAction, subirPapelAction, verArchivoGuiaAction } from './actions'

type Papel = { id: string; numero: string; storage_path: string }

/**
 * Las guías y facturas de una recepción, con su archivo al lado — y, para
 * Almacén y Contabilidad, la forma de corregirlas después de registrar
 * (0088): agregar la que faltó, quitar la que no era, o pasar a factura la
 * que se subió como guía (y al revés). Funciona aunque la OC ya esté cerrada.
 *
 * Los controles quedan detrás de "Corregir papeles": lo normal es solo mirar,
 * y una ficha llena de botones de borrar invita a tocar lo que está bien.
 */
export function PapelesRecepcion({
  recepcionId, ocCodigo, guias, facturas, puedeCorregir,
}: {
  recepcionId: string
  ocCodigo: string
  guias: Papel[]
  facturas: Papel[]
  puedeCorregir: boolean
}) {
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, iniciar] = useTransition()

  const corregir = (cambio: Parameters<typeof corregirPapelAction>[1], alTerminar?: () => void) => {
    setError(null)
    iniciar(async () => {
      const r = await corregirPapelAction(recepcionId, cambio)
      if (r?.error) setError(r.error)
      else alTerminar?.()
    })
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <Lista
        tipo="guia" papeles={guias} corrigiendo={corrigiendo} pending={pending}
        onCambio={(c) => corregir(c)}
      />
      <Lista
        tipo="factura" papeles={facturas} corrigiendo={corrigiendo} pending={pending}
        onCambio={(c) => corregir(c)}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {puedeCorregir && !corrigiendo ? (
        <button type="button" onClick={() => setCorrigiendo(true)} className="text-sm text-logisalud-teal underline">
          Corregir papeles
        </button>
      ) : null}

      {corrigiendo ? (
        <AgregarPapel
          ocCodigo={ocCodigo} pending={pending}
          onAgregar={(tipo, numero, storagePath, limpiar) =>
            corregir({ accion: 'agregar', tipo, numero, storagePath }, limpiar)
          }
          onCerrar={() => { setCorrigiendo(false); setError(null) }}
        />
      ) : null}
    </div>
  )
}

function Lista({
  tipo, papeles, corrigiendo, pending, onCambio,
}: {
  tipo: TipoPapel
  papeles: Papel[]
  corrigiendo: boolean
  pending: boolean
  onCambio: (c: { accion: 'quitar' | 'reclasificar'; tipo: TipoPapel; id: string; motivo: string }) => void
}) {
  const plural = tipo === 'guia' ? 'Guías de remisión' : 'Facturas'
  const singular = tipo === 'guia' ? 'Guía de remisión' : 'Factura'
  return (
    <div className="text-sm">
      <p className="text-gray-500">{papeles.length === 1 ? singular : plural}:</p>
      {papeles.length === 0 ? <p>—</p> : (
        <ul className="mt-1 space-y-1.5">
          {papeles.map((p) => (
            <FilaPapel key={p.id} tipo={tipo} papel={p} corrigiendo={corrigiendo} pending={pending} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilaPapel({
  tipo, papel, corrigiendo, pending, onCambio,
}: {
  tipo: TipoPapel
  papel: Papel
  corrigiendo: boolean
  pending: boolean
  onCambio: (c: { accion: 'quitar' | 'reclasificar'; tipo: TipoPapel; id: string; motivo: string }) => void
}) {
  const [accion, setAccion] = useState<'quitar' | 'reclasificar' | null>(null)
  const [motivo, setMotivo] = useState('')
  const otro: TipoPapel = tipo === 'guia' ? 'factura' : 'guia'

  return (
    <li className="rounded-md border border-gray-200 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">{papel.numero}</span>
        <VerVoucher storagePath={papel.storage_path} etiqueta="ver" accion={verArchivoGuiaAction} />
        {corrigiendo && !accion ? (
          <>
            <button type="button" onClick={() => setAccion('reclasificar')} className="text-sm text-logisalud-teal underline">
              Es {ETIQUETA_TIPO_PAPEL[otro]}, no {ETIQUETA_TIPO_PAPEL[tipo]}
            </button>
            <button type="button" onClick={() => setAccion('quitar')} className="text-sm text-red-700 underline">
              Quitar
            </button>
          </>
        ) : null}
      </div>
      {accion ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm">
            <span className="text-gray-600">
              {accion === 'quitar' ? '¿Por qué se quita?' : `¿Por qué pasa a ${ETIQUETA_TIPO_PAPEL[otro]}?`}
            </span>
            <input
              type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={accion === 'quitar' ? 'No era de esta entrega' : `Se subió en el lugar de la ${ETIQUETA_TIPO_PAPEL[tipo]}`}
              className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button" disabled={pending || !motivo.trim()}
              onClick={() => onCambio({ accion, tipo, id: papel.id, motivo })}
              className="btn-secondary"
            >
              {pending ? 'Guardando…' : accion === 'quitar' ? 'Quitar' : `Pasar a ${ETIQUETA_TIPO_PAPEL[otro]}`}
            </button>
            <button type="button" onClick={() => { setAccion(null); setMotivo('') }} className="text-sm text-gray-600 underline">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function AgregarPapel({
  ocCodigo, pending, onAgregar, onCerrar,
}: {
  ocCodigo: string
  pending: boolean
  onAgregar: (tipo: TipoPapel, numero: string, storagePath: string, limpiar: () => void) => void
  onCerrar: () => void
}) {
  const [tipo, setTipo] = useState<TipoPapel>('factura')
  const [numero, setNumero] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [claveArchivo, setClaveArchivo] = useState(0)

  const limpiar = () => { setNumero(''); setPath(null); setClaveArchivo((k) => k + 1) }

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return
    if (excedeTamanoMaximo(archivo.size)) {
      setErrorArchivo(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size))
      return
    }
    setErrorArchivo(null)
    setSubiendo(true)
    const datos = new FormData()
    datos.append('archivo', archivo)
    const r = await subirPapelAction(ocCodigo, tipo, datos)
    setSubiendo(false)
    if ('path' in r) setPath(r.path)
    else setErrorArchivo(r.error)
  }

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-800">Agregar un papel que faltó</p>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_2fr] sm:items-end">
        <label className="block text-sm">
          <span className="text-gray-600">Qué es</span>
          <select
            value={tipo} onChange={(e) => { setTipo(e.target.value as TipoPapel); limpiar() }}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          >
            <option value="factura">Factura</option>
            <option value="guia">Guía de remisión</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Número</span>
          <input
            type="text" value={numero} onChange={(e) => setNumero(e.target.value)}
            placeholder={tipo === 'factura' ? 'F001-00012345' : 'T001-000123'}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">📎 Su archivo</span>
          <input
            key={claveArchivo}
            type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => subir(e.target.files?.[0])}
            className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white"
          />
          {subiendo ? <span className="mt-1 block text-xs text-gray-500">Subiendo…</span> : null}
          {path && !subiendo ? <span className="mt-1 block text-xs text-green-700">Subido</span> : null}
        </label>
      </div>
      {errorArchivo ? <p className="text-sm text-amber-900">{errorArchivo}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || subiendo || !numero.trim() || !path}
          onClick={() => path && onAgregar(tipo, numero, path, limpiar)}
          className="btn-secondary"
        >
          {pending ? 'Guardando…' : `Agregar ${ETIQUETA_TIPO_PAPEL[tipo]}`}
        </button>
        <button type="button" onClick={onCerrar} className="text-sm text-gray-600 underline">
          Listo
        </button>
      </div>
    </div>
  )
}
