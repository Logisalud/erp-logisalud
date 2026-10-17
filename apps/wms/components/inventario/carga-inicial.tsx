'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, FileUp, Hourglass, ShieldCheck, Ban } from 'lucide-react'
import { confirmarCargaInicialAccion, crearCargaInicialAccion, validarCargaInicialAccion } from '@/app/acciones-inventario'
import { parsearCargaInicial, type CargaInicialVista, type ErrorFilaCarga, type FilaCargaInicial } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { resumenCarga } from '@/domain/carga-inicial'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { CHIP_NEUTRO, CHIP_OK } from '@/components/estilos-opcion'

const EJEMPLO = 'producto;lote;vence;propietario;posicion;estado;cantidad\nDEMO-001;L2401;31/12/2028;LOGISSA;A-6;APROBADO;120'

const nUnidades = (n: number) => n.toLocaleString('es-PE')
/** «120 aprobadas, 40 en cuarentena, 5 a bajas» (solo lo que tiene unidades). */
function textoResumen(filas?: FilaCargaInicial[], p?: { aprobado: number; cuarentena: number; bajas: number }): string {
  const r = p ?? resumenCarga(filas ?? [])
  const partes = [r.aprobado && `${nUnidades(r.aprobado)} aprobadas`, r.cuarentena && `${nUnidades(r.cuarentena)} en cuarentena`, r.bajas && `${nUnidades(r.bajas)} a bajas`].filter(Boolean)
  return partes.join(', ') || 'sin unidades'
}

/**
 * Carga inicial como cambio de sistema (OS-7, D-99): el stock de Odoo entra directo a su estado y ubicación, sin acta organoléptica.
 * Administración sube y revisa; Dirección Técnica (Katia) valida con UNA sola confirmación.
 */
export function CargaInicial({ cargas, puedeCargar, puedeConfirmar }: { cargas: CargaInicialVista[]; puedeCargar: boolean; puedeConfirmar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState('')
  const [filas, setFilas] = useState<FilaCargaInicial[]>([])
  const [errores, setErrores] = useState<ErrorFilaCarga[]>([])
  const [revisado, setRevisado] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [confirmada, setConfirmada] = useState<string | null>(null)

  async function revisar(t: string) {
    setRevisando(true)
    const r = parsearCargaInicial(t)
    let e: ErrorFilaCarga[] = r.errores
    if (e.length === 0 || r.filas.length > 0) e = [...e, ...(await validarCargaInicialAccion(r.filas))]
    setFilas(r.filas); setErrores(e.sort((a, b) => a.fila - b.fila)); setRevisado(true); setRevisando(false)
  }
  async function archivo(f: File | undefined) {
    if (!f) return
    const t = await f.text()
    setTexto(t)
    await revisar(t)
  }
  const errorDe = (fila: number) => errores.filter((e) => e.fila === fila).map((e) => e.error)

  return (
    <div className="space-y-6">
      <section className="card space-y-3" aria-labelledby="como-entra" data-testid="como-entra-carga">
        <h2 id="como-entra" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cómo entra el stock de Odoo</h2>
        <p className="text-sm text-gray-700">Es un cambio de sistema, no una recepción: <strong>no hace falta acta organoléptica</strong>. Cada fila entra con el estado y la ubicación que tenía en Odoo. Dirección Técnica valida toda la carga con <strong>una sola confirmación</strong>.</p>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><span><strong>Aprobados</strong> quedan en su ubicación.</span></li>
          <li className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-indigo-900"><Hourglass className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><span><strong>Cuarentena</strong> se queda en Cuarentena.</span></li>
          <li className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"><Ban className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><span><strong>Bajas</strong> van a Bajas.</span></li>
        </ul>
        <p className="text-sm text-gray-600">En el Kardex y en la historia de cada lote se ve el recorrido: <em>ingreso por carga inicial en Cuarentena → liberación → ubicación final</em>. Todo lote necesita código de lote y fecha de vencimiento.</p>
      </section>

      {puedeCargar && (
        <section className="card space-y-4" aria-labelledby="subir" data-testid="subir-carga">
          <div>
            <h2 id="subir" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cargar el inventario general</h2>
            <p className="mt-1 text-sm text-gray-600">Archivo CSV (coma, punto y coma o tabulación) con las columnas <code className="tabular">producto, lote, vence, propietario, posicion, estado, cantidad</code>. Primero se revisa: nada se guarda hasta que corrijas los errores. El estado va como <em>Aprobado</em>, <em>Cuarentena</em> o <em>Bajas</em>.</p>
          </div>
          <div>
            <label htmlFor="archivo-carga" className="btn-secondary cursor-pointer"><FileUp className="h-5 w-5" aria-hidden />Elegir un archivo CSV</label>
            <input id="archivo-carga" type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => archivo(e.target.files?.[0])} data-testid="archivo-carga" />
          </div>
          <div>
            <label htmlFor="texto-carga" className="etiqueta">…o pega las filas aquí</label>
            <textarea id="texto-carga" rows={5} className="campo tabular !min-h-32 py-2 text-sm" value={texto} onChange={(e) => { setTexto(e.target.value); setRevisado(false) }} placeholder={EJEMPLO} data-testid="texto-carga" />
          </div>
          <button type="button" className="btn-secondary" disabled={revisando || !texto.trim()} onClick={() => revisar(texto)} data-testid="revisar-carga">{revisando ? 'Revisando…' : 'Revisar la carga'}</button>

          {revisado && (
            <div className="space-y-3" data-testid="vista-previa-carga">
              {errores.length === 0 && filas.length > 0 ? <Aviso tipo="ok" testid="carga-sin-errores">{filas.length} filas listas, {resumenCarga(filas).total.toLocaleString('es-PE')} unidades ({textoResumen(filas)}). Se guardan como borrador y Dirección Técnica las confirma.</Aviso>
                : <Aviso tipo="error" testid="carga-con-errores">Hay {new Set(errores.map((e) => e.fila)).size || errores.length} {errores.length === 1 ? 'problema' : 'problemas'} para corregir antes de guardar.</Aviso>}
              {filas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <caption className="sr-only">Vista previa de la carga</caption>
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600"><tr>{['#', 'Producto', 'Lote', 'Vence', 'Propietario', 'Ubicación', 'Estado', 'Cant.', 'Revisión'].map((c) => <th key={c} scope="col" className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {filas.slice(0, 200).map((f, i) => { const err = errorDe(i + 1); return (
                        <tr key={i} className={err.length ? 'bg-red-50' : ''} data-testid="fila-previa">
                          <td className="tabular px-3 py-2">{i + 1}</td><td className="tabular px-3 py-2">{f.producto}</td><td className="tabular px-3 py-2">{f.lote}</td><td className="tabular px-3 py-2">{f.vence || '—'}</td>
                          <td className="px-3 py-2">{f.propietario}</td><td className="tabular px-3 py-2">{f.posicion}</td><td className="px-3 py-2">{f.estado}</td><td className="tabular px-3 py-2 text-right">{f.cantidad}</td>
                          <td className="px-3 py-2">{err.length ? <span className="text-red-800">{err.join('; ')}</span> : <span className="inline-flex items-center gap-1 text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Bien</span>}</td>
                        </tr>) })}
                    </tbody>
                  </table>
                </div>
              )}
              {errores.filter((e) => e.fila === 0).map((e, i) => <p key={i} role="alert" className="text-sm text-red-800">{e.error}</p>)}
              <div>
                <label htmlFor="nota-carga" className="etiqueta">Nota (opcional)</label>
                <input id="nota-carga" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: inventario general de octubre" autoComplete="off" />
              </div>
              <button type="button" className="btn-primary" disabled={pendiente || errores.length > 0 || filas.length === 0} onClick={() => ejecutar(() => crearCargaInicialAccion(filas, nota.trim() || undefined), { exito: puedeConfirmar ? 'Carga guardada como borrador. Sigue: confírmala abajo para que el stock entre al inventario.' : 'Carga guardada como borrador. Sigue: avisa a Dirección Técnica para que la confirme; hasta entonces no entra stock.', alExito: () => { setTexto(''); setFilas([]); setErrores([]); setRevisado(false) } })} data-testid="guardar-carga">Guardar como borrador</button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="cargas">
        <h2 id="cargas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cargas <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{cargas.length}</span></h2>
        {cargas.length === 0 ? <p className="mt-2 text-sm text-gray-600" data-testid="sin-cargas">Todavía no hay cargas.</p> : (
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-cargas">
            {cargas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="tabular font-heading text-lg font-semibold tracking-wide">{c.numero}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${c.estado === 'CONFIRMADA' ? CHIP_OK : CHIP_NEUTRO}`}>{c.estado === 'CONFIRMADA' ? 'Confirmada' : c.estado === 'BORRADOR' ? 'Borrador' : 'Anulada'}</span>
                <span className="min-w-0 flex-1 text-sm text-gray-700">{c.filas} filas · {c.unidades.toLocaleString('es-PE')} unidades ({textoResumen(undefined, c.porEstado)}) · subió {c.creadoPor} · {formatoFechaHora(c.creadoEn)}{c.confirmadoPor && c.confirmadoEn ? ` · confirmó ${c.confirmadoPor} · ${formatoFechaHora(c.confirmadoEn)}` : ''}{c.nota ? ` · ${c.nota}` : ''}</span>
                {c.estado === 'BORRADOR' && (puedeConfirmar
                  ? <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => confirmarCargaInicialAccion(c.id), { exito: `Carga ${c.numero} confirmada.`, alExito: () => setConfirmada(c.numero) })} data-testid="confirmar-carga">{pendiente ? 'Confirmando…' : 'Confirmar la carga'}</button>
                  : <span className="text-sm text-gray-600" data-testid="espera-confirmacion">Falta la confirmación de Dirección Técnica.</span>)}
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmada && (
        <Aviso tipo="ok" testid="carga-confirmada">
          <p><strong>Carga {confirmada} confirmada.</strong> El stock ya está en su estado y ubicación, sin acta organoléptica. El recorrido quedó en el Kardex y en la historia de cada lote.</p>
          <p className="mt-1">Sigue: <Link href="/kardex" className="inline-flex items-center gap-1 font-medium underline">revisa el Kardex<ArrowRight className="h-4 w-4" aria-hidden /></Link> o mira el stock en el <Link href="/almacen" className="font-medium underline">mapa del almacén</Link>.</p>
        </Aviso>
      )}
      {mensaje && !(mensaje.tipo === 'ok' && confirmada) && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
