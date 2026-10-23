'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, FileUp, Loader2, Truck, X } from 'lucide-react'
import { registrarEntregaTransportistaAccion, subirCargoEntregaAccion } from '@/app/acciones-salida-manual'
import { puedeEntregarAlTransportistaCliente, validarEntrega } from '@/domain/entrega-transportista'
import type { SalidaVista } from '@/domain/despacho'
import { formatoFechaHora } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** Hora de Lima (UTC-5, sin horario de verano) como la pide `datetime-local`: «AAAA-MM-DDTHH:MM». */
const ahoraLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 16)
const aIso = (local: string) => (local ? new Date(`${local}:00-05:00`).toISOString() : '')

/**
 * Tipo B (por cuenta de un cliente de almacenamiento): no va en una ruta de Logisalud ni lleva guía del WMS. Se entrega al transportista del cliente: quién recoge, a qué hora y
 * quién entrega por el almacén (el cargo firmado es opcional). Al registrarlo la salida se confirma y el stock baja.
 */
export function EntregaTransportista({ salida, roles, usuario }: { salida: SalidaVista; roles: readonly Rol[]; usuario: string }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [transportista, setTransportista] = useState('')
  const [placa, setPlaca] = useState('')
  const [dni, setDni] = useState('')
  const [hora, setHora] = useState('')
  const [entrega, setEntrega] = useState(usuario)
  const [nota, setNota] = useState('')
  const [cargo, setCargo] = useState<{ ref: string; nombre: string } | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  useEffect(() => { setHora(ahoraLima()) }, [])
  if (salida.tipo !== 'CLIENTE' || salida.estado === 'CANCELADA') return null

  const e = salida.entrega
  if (e) {
    return (
      <section aria-labelledby="h-entrega" className="rounded-lg border border-green-200 bg-green-50 p-4" id="entrega-transportista" data-testid="entrega-registrada">
        <h2 id="h-entrega" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden />Entregada al transportista del cliente</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-600">Transportista o quien recogió</dt><dd className="text-gray-900">{e.transportista}</dd></div>
          {e.placa && <div><dt className="text-gray-600">Placa</dt><dd className="tabular text-gray-900">{e.placa}</dd></div>}
          {e.documentoRecoge && <div><dt className="text-gray-600">DNI de quien recoge</dt><dd className="tabular text-gray-900">{e.documentoRecoge}</dd></div>}
          <div><dt className="text-gray-600">Hora de la entrega</dt><dd className="text-gray-900">{formatoFechaHora(e.entregadoEn)}</dd></div>
          <div><dt className="text-gray-600">Entregó por el almacén</dt><dd className="text-gray-900">{e.entregaAlmacen}</dd></div>
          <div><dt className="text-gray-600">Registrada por</dt><dd className="text-gray-900">{e.registradaPor}</dd></div>
          {e.cargoArchivo && <div><dt className="text-gray-600">Cargo firmado</dt><dd><Link href={`/salidas/${salida.id}/cargo`} className="text-green-800 underline" target="_blank" data-testid="ver-cargo">{e.cargoNombre ?? 'Ver el cargo'}</Link></dd></div>}
          {e.nota && <div className="sm:col-span-2"><dt className="text-gray-600">Nota</dt><dd className="text-gray-900">{e.nota}</dd></div>}
        </dl>
        <p className="mt-3 text-sm text-gray-800">La salida quedó confirmada y el stock ya bajó. Si algo vuelve, entra como devolución.</p>
      </section>
    )
  }

  const lista = salida.etapa === 'LISTA_PARA_CARGA' || salida.etapa === 'CARGADA'
  const puede = puedeEntregarAlTransportistaCliente(roles)
  if (salida.estado !== 'ABIERTA') return null
  if (!lista) {
    return (
      <section aria-labelledby="h-entrega" className="rounded-lg border border-gray-200 bg-white p-4" id="entrega-transportista" data-testid="entrega-pendiente">
        <h2 id="h-entrega" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><Truck className="h-5 w-5 text-gray-600" aria-hidden />Entrega al transportista del cliente</h2>
        <p className="mt-1 text-sm text-gray-700">Esta orden no va en una ruta de Logisalud: la recoge el transportista del cliente. Cuando tenga la conformidad, la GRE del cliente, el paquete documental y el embalaje, aquí registras quién la recoge.</p>
      </section>
    )
  }

  async function elegirArchivo(f: File | undefined) {
    if (!f) return
    setSubiendo(true); setErrores((x) => ({ ...x, cargo: '' }))
    const fd = new FormData(); fd.append('archivo', f)
    const r = await subirCargoEntregaAccion(fd)
    setSubiendo(false)
    if (r.ok) setCargo({ ref: r.ref, nombre: r.nombre }); else setErrores((x) => ({ ...x, cargo: r.errores?.cargo ?? r.mensaje }))
  }
  function enviar() {
    const entrada = { salidaId: salida.id, transportista, placa, documento: dni, hora: aIso(hora), entregaAlmacen: entrega, cargoRef: cargo?.ref, cargoNombre: cargo?.nombre, nota }
    const errs = validarEntrega(entrada, new Date().toISOString())
    setErrores(errs)
    if (Object.keys(errs).length) return
    ejecutar(() => registrarEntregaTransportistaAccion(entrada), { exito: 'Entrega registrada: la salida quedó confirmada y el stock bajó.' })
  }
  const err = (k: string) => errores[k]
  const campo = (id: string, etiqueta: string, k: string, valor: string, set: (v: string) => void, extra: { ayuda?: string; type?: string; inputMode?: 'numeric'; maxLength?: number; tabular?: boolean; testid: string }) => (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <input id={id} type={extra.type ?? 'text'} inputMode={extra.inputMode} maxLength={extra.maxLength} className={`campo ${extra.tabular ? 'tabular' : ''} ${err(k) ? '!border-red-500' : ''}`} value={valor} onChange={(ev) => { set(ev.target.value); if (errores[k] || (k === 'placa' && errores.documento)) setErrores((x) => ({ ...x, [k]: '', ...(k === 'documento' ? { placa: '' } : {}), ...(k === 'placa' ? { documento: '' } : {}) })) }} autoComplete="off" data-testid={extra.testid} aria-invalid={!!err(k)} aria-describedby={err(k) ? `${id}-error` : undefined} />
      {extra.ayuda && !err(k) && <p className="mt-1 text-xs text-gray-600">{extra.ayuda}</p>}
      {err(k) && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{err(k)}</p>}
    </div>
  )

  return (
    <section aria-labelledby="h-entrega" className="space-y-4 rounded-lg border border-gray-200 bg-white p-4" id="entrega-transportista" data-testid="entrega-form">
      <h2 id="h-entrega" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><Truck className="h-5 w-5 text-gray-600" aria-hidden />Entrega al transportista del cliente</h2>
      <Aviso tipo="info">Esta orden la recoge el transportista del cliente: no lleva ruta ni guía del WMS (se despacha con la GRE del cliente). Al registrar la entrega, la salida se confirma y el stock baja.</Aviso>
      {!puede ? <Aviso tipo="atencion">Solo el Jefe de Transporte o el Jefe de Almacén registran esta entrega.</Aviso> : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {campo('entrega-transportista-nombre', 'Transportista (o quien recoge)', 'transportista', transportista, setTransportista, { testid: 'entrega-transportista' })}
            {campo('entrega-placa', 'Placa del vehículo', 'placa', placa, (v) => setPlaca(v.toUpperCase()), { tabular: true, ayuda: 'Pon la placa o el DNI de quien recoge (basta uno).', testid: 'entrega-placa' })}
            {campo('entrega-dni', 'DNI de quien recoge (8 números)', 'documento', dni, (v) => setDni(v.replace(/\D/g, '')), { inputMode: 'numeric', maxLength: 8, tabular: true, testid: 'entrega-dni' })}
            {campo('entrega-hora', 'Hora de la entrega', 'hora', hora, setHora, { type: 'datetime-local', testid: 'entrega-hora' })}
            {campo('entrega-almacen', 'Quién entrega por el almacén', 'entregaAlmacen', entrega, setEntrega, { testid: 'entrega-almacen' })}
            {campo('entrega-nota', 'Nota (opcional)', 'nota', nota, setNota, { testid: 'entrega-nota' })}
          </div>
          <div>
            <p className="etiqueta">Cargo firmado (opcional)</p>
            {cargo ? (
              <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3" data-testid="cargo-adjunto">
                <span className="flex min-w-0 items-center gap-2 text-sm text-gray-900"><FileUp className="h-4 w-4 shrink-0 text-green-700" aria-hidden /><span className="truncate">{cargo.nombre}</span></span>
                <button type="button" onClick={() => setCargo(null)} aria-label="Quitar el cargo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" aria-hidden /></button>
              </div>
            ) : (
              <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-white px-3 text-sm text-gray-800 hover:bg-gray-50 ${err('cargo') ? 'border-red-500' : 'border-gray-400'}`}>
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
                {subiendo ? 'Subiendo el archivo…' : 'Adjuntar una foto o un PDF (hasta 10 MB)'}
                <input type="file" accept="image/jpeg,image/png,application/pdf,.pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(ev) => { void elegirArchivo(ev.target.files?.[0]); ev.target.value = '' }} data-testid="entrega-cargo-archivo" />
              </label>
            )}
            {err('cargo') && <p role="alert" className="mt-1 text-sm text-red-700">{err('cargo')}</p>}
          </div>
          {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="error-entrega">{mensaje.texto}</Aviso>}
          {mensaje?.tipo === 'ok' && <Aviso tipo="ok" testid="ok-entrega">{mensaje.texto}</Aviso>}
          <button type="button" className="btn-primary" disabled={pendiente || subiendo} onClick={enviar} data-testid="registrar-entrega"><Truck className="h-5 w-5" aria-hidden />{pendiente ? 'Registrando…' : 'Registrar la entrega'}</button>
        </>
      )}
    </section>
  )
}
