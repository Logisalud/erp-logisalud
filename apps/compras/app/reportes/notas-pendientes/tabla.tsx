'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Money } from '@/components/money'
import { excedeTamanoMaximo, mensajeArchivoDemasiadoGrande } from '@/domain/archivo'
import { hoyLima } from '@/domain/fecha'
import {
  ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE, ETIQUETA_TIPO_NOTA,
  type FilaNotaPendiente, type TipoDocumentoExcedente,
} from '@/domain/notas-pendientes-proveedor'
import { registrarDocumentoExcedenteAction, subirDocumentoExcedenteAction } from './actions'

/**
 * La tabla del reporte. Lo único que se hace desde acá es cerrar un
 * EXCEDENTE con la factura o nota de débito del proveedor: la nota de
 * crédito se registra en la ficha de la deuda, porque es lo que la libera
 * para pago — la fila lleva directo ahí.
 */
export function TablaNotasPendientes({
  filas, puedeRegistrar,
}: { filas: FilaNotaPendiente[]; puedeRegistrar: boolean }) {
  const [recepcionAbierta, setRecepcionAbierta] = useState<string | null>(null)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => descargarCSV(filas)} className="btn-secondary">
          Descargar CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">OC / recepción</th>
              <th className="px-3 py-2 font-medium">Factura</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">Facturado</th>
              <th className="px-3 py-2 text-right font-medium">Llegó</th>
              <th className="px-3 py-2 text-right font-medium">Monto estimado</th>
              <th className="px-3 py-2 font-medium">Qué se debe</th>
              <th className="px-3 py-2 text-right font-medium">Días</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <Fila
                key={f.lineaId} fila={f} puedeRegistrar={puedeRegistrar}
                abierta={recepcionAbierta === f.recepcionId}
                onAbrir={() => setRecepcionAbierta(f.recepcionId)}
                onCerrar={() => setRecepcionAbierta(null)}
                lineasDeLaRecepcion={filas.filter((x) =>
                  x.recepcionId === f.recepcionId && x.tipo === 'factura_o_debito' && x.estado === 'pendiente')}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Fila({
  fila: f, puedeRegistrar, abierta, onAbrir, onCerrar, lineasDeLaRecepcion,
}: {
  fila: FilaNotaPendiente
  puedeRegistrar: boolean
  abierta: boolean
  onAbrir: () => void
  onCerrar: () => void
  lineasDeLaRecepcion: FilaNotaPendiente[]
}) {
  // El formulario se abre debajo de la PRIMERA línea pendiente de esa
  // recepción, y cubre todas: un mismo documento suele cerrar varias.
  const esPrimera = lineasDeLaRecepcion[0]?.lineaId === f.lineaId
  return (
    <>
      <tr className="border-b border-gray-100 align-top last:border-0">
        <td className="px-3 py-2">
          {f.proveedor}
          {f.ruc ? <span className="block text-xs text-gray-500">RUC {f.ruc}</span> : null}
        </td>
        <td className="px-3 py-2">
          <Link href={`/almacen/recepciones/${f.recepcionId}`} className="text-logisalud-teal underline">{f.ocCodigo}</Link>
          <span className="block text-xs text-gray-500">
            llegó {f.fechaRecepcion}{f.recibidoPor ? ` · ${f.recibidoPor}` : ''}
          </span>
        </td>
        <td className="px-3 py-2">
          {f.numeroFactura ?? '—'}
          {f.obligacionId ? (
            <Link href={`/cuentas-por-pagar/${f.obligacionId}`} className="block text-xs text-logisalud-teal underline">
              deuda {f.obligacionCodigo}
            </Link>
          ) : null}
        </td>
        <td className="px-3 py-2">
          {f.producto ?? '—'}
          {f.observaciones ? <span className="block text-xs text-gray-500">{f.observaciones}</span> : null}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{f.cantidadFactura}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {f.cantidadFisica}
          <span className={`block text-xs ${f.tipo === 'nota_credito' ? 'text-amber-800' : 'text-sky-800'}`}>
            {f.tipo === 'nota_credito' ? `faltan ${f.diferencia}` : `${f.diferencia} de más`}
          </span>
        </td>
        <td className="px-3 py-2 text-right"><Money valor={f.montoEstimado} moneda={f.moneda} /></td>
        <td className="px-3 py-2">{ETIQUETA_TIPO_NOTA[f.tipo]}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${f.estado === 'pendiente' && f.dias > 30 ? 'font-medium text-amber-800' : ''}`}>
          {f.dias}
        </td>
        <td className="px-3 py-2">
          {f.estado === 'recibida' ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{f.documento}</span>
          ) : (
            <>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Pendiente</span>
              {f.tipo === 'nota_credito' && f.obligacionId ? (
                <Link href={`/cuentas-por-pagar/${f.obligacionId}`} className="mt-1 block text-xs text-logisalud-teal underline">
                  Registrar la NC en la deuda
                </Link>
              ) : null}
              {f.tipo === 'factura_o_debito' && puedeRegistrar && esPrimera && !abierta ? (
                <button type="button" onClick={onAbrir} className="mt-1 block text-xs text-logisalud-teal underline">
                  Registrar documento recibido
                </button>
              ) : null}
            </>
          )}
        </td>
      </tr>
      {abierta && esPrimera ? (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={10} className="px-3 py-3">
            <FormularioDocumento lineas={lineasDeLaRecepcion} ocCodigo={f.ocCodigo} onCerrar={onCerrar} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function FormularioDocumento({
  lineas, ocCodigo, onCerrar,
}: { lineas: FilaNotaPendiente[]; ocCodigo: string; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoDocumentoExcedente>('factura')
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(hoyLima())
  const [path, setPath] = useState<string | null>(null)
  const [elegidas, setElegidas] = useState<string[]>(lineas.map((l) => l.lineaId))
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, iniciar] = useTransition()

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return
    if (excedeTamanoMaximo(archivo.size)) { setError(mensajeArchivoDemasiadoGrande(archivo.name, archivo.size)); return }
    setError(null)
    setSubiendo(true)
    const datos = new FormData()
    datos.append('archivo', archivo)
    const r = await subirDocumentoExcedenteAction(ocCodigo, datos)
    setSubiendo(false)
    if ('path' in r) setPath(r.path)
    else setError(r.error)
  }

  const guardar = () => {
    setError(null)
    iniciar(async () => {
      const r = await registrarDocumentoExcedenteAction({ tipo, numero, fechaEmision: fecha, storagePath: path, lineas: elegidas })
      if (r?.error) setError(r.error)
      else onCerrar()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">Documento del proveedor por lo que llegó de más ({ocCodigo})</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="text-gray-600">Qué es</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoExcedente)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            {Object.entries(ETIQUETA_TIPO_DOCUMENTO_EXCEDENTE).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Número</span>
          <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="F001-00012345"
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Fecha de emisión</span>
          <input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">📎 Su archivo</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => subir(e.target.files?.[0])}
            className="mt-1 block w-full text-sm file:mr-3 file:min-h-12 file:rounded-md file:border-0 file:bg-logisalud-green file:px-3 file:text-white" />
          {subiendo ? <span className="mt-1 block text-xs text-gray-500">Subiendo…</span> : null}
          {path && !subiendo ? <span className="mt-1 block text-xs text-green-700">Subido</span> : null}
        </label>
      </div>
      {lineas.length > 1 ? (
        <fieldset className="text-sm">
          <legend className="text-gray-600">Qué productos cubre</legend>
          {lineas.map((l) => (
            <label key={l.lineaId} className="mt-1 flex items-center gap-2">
              <input
                type="checkbox" className="h-5 w-5"
                checked={elegidas.includes(l.lineaId)}
                onChange={(e) => setElegidas((prev) => e.target.checked ? [...prev, l.lineaId] : prev.filter((x) => x !== l.lineaId))}
              />
              {l.producto ?? '—'} — {l.diferencia} de más
            </label>
          ))}
        </fieldset>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={guardar}
          disabled={pending || subiendo || !numero.trim() || !path || elegidas.length === 0}
          className="btn-secondary">
          {pending ? 'Guardando…' : 'Registrar documento'}
        </button>
        <button type="button" onClick={onCerrar} className="text-sm text-gray-600 underline">Cancelar</button>
      </div>
    </div>
  )
}

function descargarCSV(filas: FilaNotaPendiente[]) {
  const encabezado = ['Proveedor', 'RUC', 'OC', 'Llegó el', 'Recibió', 'Factura', 'Deuda', 'Producto', 'Facturado', 'Llegó',
    'Diferencia', 'Moneda', 'Monto estimado', 'Qué se debe', 'Días', 'Estado', 'Documento', 'Observaciones']
  const cuerpo = filas.map((f) => [
    f.proveedor, f.ruc ?? '', f.ocCodigo, f.fechaRecepcion, f.recibidoPor ?? '', f.numeroFactura ?? '', f.obligacionCodigo ?? '',
    f.producto ?? '', f.cantidadFactura, f.cantidadFisica, f.diferencia, f.moneda, f.montoEstimado.toFixed(2),
    ETIQUETA_TIPO_NOTA[f.tipo], f.dias, f.estado === 'pendiente' ? 'Pendiente' : 'Recibida', f.documento ?? '', f.observaciones ?? '',
  ])
  const texto = [encabezado, ...cuerpo].map((fila) => fila.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `notas-pendientes-proveedores-${hoyLima()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(valor: string | number): string {
  const s = String(valor)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
