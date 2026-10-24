'use client'

import { useState } from 'react'
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, FileText, XCircle } from 'lucide-react'
import { informeCargaAccion } from '@/app/acciones-inventario'
import { ETIQUETA_CATEGORIA, ETIQUETA_ESTADO_LINEA, type EstadoLineaInforme, type InformeCarga } from '@/domain/informe-carga'
import { ETIQUETA_ESTADO_CARGA } from '@/domain/carga-inicial'
import { Aviso } from '../entradas/aviso'
import { CHIP_AVISO, CHIP_OK } from '../estilos-opcion'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const ESTILO: Record<EstadoLineaInforme, { cls: string; I: typeof CheckCircle2 }> = { LISTA: { cls: CHIP_OK, I: CheckCircle2 }, ADVERTENCIA: { cls: CHIP_AVISO, I: CircleAlert }, ERROR: { cls: ROJO, I: XCircle } }
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** Informe de la carga de ensayo para Dirección Técnica y la Gerencia: veredicto, totales por estado, qué corregir en cada línea y descarga en CSV o Excel. No guarda nada. */
export function InformeCarga({ texto }: { texto: string }) {
  const [informe, setInforme] = useState<InformeCarga | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bajando, setBajando] = useState<'csv' | 'xlsx' | null>(null)
  const [soloProblemas, setSoloProblemas] = useState(true)

  async function generar() {
    setCargando(true); setError(null)
    try {
      const r = await informeCargaAccion(texto)
      if (r.ok) setInforme(r.informe); else { setInforme(null); setError(r.mensaje) }
    } catch { setError('No se pudo armar el informe. Vuelve a intentarlo.') }
    setCargando(false)
  }
  async function descargar(formato: 'csv' | 'xlsx') {
    setBajando(formato); setError(null)
    try {
      const res = await fetch(`${base}/carga-inicial/informe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, formato }) })
      if (!res.ok) throw new Error(await res.text())
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url; a.download = `Informe carga de ensayo.${formato}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error && e.message ? e.message : 'No se pudo descargar el informe.') }
    setBajando(null)
  }

  const lineas = informe ? (soloProblemas ? informe.lineas.filter((l) => l.resultado !== 'LISTA') : informe.lineas) : []

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="h-informe" data-testid="informe-carga">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="h-informe" className="font-medium text-gray-900">Informe de la carga</h3>
          <p className="text-sm text-gray-700">Para Sebas y Katia: qué pasa en cada línea, qué hay que corregir y si la carga está lista. No guarda nada.</p>
        </div>
        <button type="button" className="btn-secondary" disabled={cargando || !texto.trim()} onClick={generar} data-testid="armar-informe"><FileText className="h-5 w-5" aria-hidden />{cargando ? 'Armando el informe…' : informe ? 'Armar de nuevo' : 'Armar el informe'}</button>
      </div>
      {error && <Aviso tipo="error" testid="informe-error">{error}</Aviso>}
      {!informe && !cargando && !error && <p className="text-sm text-gray-600" data-testid="informe-vacio">Todavía no hay informe. Revisa la carga y pulsa «Armar el informe».</p>}
      {informe && (
        <div className="space-y-4" aria-live="polite">
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${informe.veredicto === 'LISTA' ? CHIP_OK : ROJO}`} data-testid="veredicto" data-veredicto={informe.veredicto}>
            {informe.veredicto === 'LISTA' ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />}
            <div><p className="font-heading text-lg font-semibold uppercase tracking-wide">{informe.veredicto === 'LISTA' ? 'Lista para cargar' : 'No lista para cargar'}</p><p className="text-sm" data-testid="veredicto-texto">{informe.veredictoTexto}</p></div>
          </div>

          <ul className="grid gap-2 sm:grid-cols-3" data-testid="totales-informe">
            {(['LISTA', 'ADVERTENCIA', 'ERROR'] as const).map((k) => {
              const n = k === 'LISTA' ? informe.totales.listas : k === 'ADVERTENCIA' ? informe.totales.conAdvertencia : informe.totales.conError
              const e = ESTILO[k]
              return <li key={k} className={`flex items-center gap-3 rounded-lg border p-3 ${e.cls}`} data-testid={`total-${k.toLowerCase()}`}><e.I className="h-5 w-5 shrink-0" aria-hidden /><span><strong className="tabular text-xl">{n.toLocaleString('es-PE')}</strong> <span className="text-sm">{k === 'LISTA' ? (n === 1 ? 'línea lista' : 'líneas listas') : k === 'ADVERTENCIA' ? (n === 1 ? 'con advertencia' : 'con advertencia') : (n === 1 ? 'con error' : 'con error')}</span></span></li>
            })}
          </ul>
          <p className="text-sm text-gray-700">{informe.totales.total.toLocaleString('es-PE')} líneas · {informe.unidades.total.toLocaleString('es-PE')} unidades: {informe.unidades.aprobado.toLocaleString('es-PE')} aprobadas, {informe.unidades.cuarentena.toLocaleString('es-PE')} en cuarentena, {informe.unidades.bajas.toLocaleString('es-PE')} a bajas.</p>

          {informe.porCategoria.length > 0 && (
            <div data-testid="por-tema">
              <p className="text-sm font-medium text-gray-900">Qué hay que mirar, por tema</p>
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">{informe.porCategoria.map((c) => <li key={c.categoria} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-800">{ETIQUETA_CATEGORIA[c.categoria]}: <strong className="tabular">{c.errores + c.advertencias}</strong></li>)}</ul>
            </div>
          )}

          {informe.generales.length > 0 && <Aviso tipo="error" testid="informe-generales">{informe.generales.map((g, k) => <p key={k}><strong>{g.que_pasa}.</strong> {g.que_corregir}</p>)}</Aviso>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary btn-sm" disabled={!!bajando} onClick={() => descargar('xlsx')} data-testid="bajar-xlsx"><FileSpreadsheet className="h-4 w-4" aria-hidden />{bajando === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}</button>
            <button type="button" className="btn-secondary btn-sm" disabled={!!bajando} onClick={() => descargar('csv')} data-testid="bajar-csv"><Download className="h-4 w-4" aria-hidden />{bajando === 'csv' ? 'Descargando…' : 'Descargar CSV'}</button>
            <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-gray-800"><input type="checkbox" className="h-4 w-4" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} data-testid="solo-problemas" />Mostrar solo lo que hay que mirar</label>
          </div>

          {lineas.length === 0 ? <p className="text-sm text-green-800" data-testid="informe-sin-problemas"><CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />No hay líneas con problemas.</p> : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="lineas-informe">
              {lineas.slice(0, 300).map((l) => {
                const e = ESTILO[l.resultado]
                return (
                  <li key={l.fila} className="space-y-1 px-3 py-3" data-testid="linea-informe" data-resultado={l.resultado}>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="tabular font-medium text-gray-900">Fila {l.fila}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${e.cls}`}><e.I className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_LINEA[l.resultado]}</span>
                      <span className="tabular text-gray-700">{l.producto || '—'} · lote {l.lote || '—'} · vence {l.vence || '—'} · {l.posicion || '—'} · {ETIQUETA_ESTADO_CARGA[l.estado] ?? (l.estado || '—')} · {l.cantidad} u</span>
                    </p>
                    {l.problemas.length === 0 ? <p className="text-sm text-gray-600">Todo bien.</p> : (
                      <ul className="space-y-1 text-sm">{l.problemas.map((p, k) => <li key={k} className="text-gray-900"><span className="font-medium">{p.que_pasa}.</span> <span className="text-gray-700">{p.que_corregir}</span></li>)}</ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {informe.lineas.length > 300 && <p className="text-sm text-gray-600">Se muestran las primeras 300 líneas; el Excel trae todas.</p>}
        </div>
      )}
    </section>
  )
}
