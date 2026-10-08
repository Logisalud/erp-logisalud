'use client'

import { useState } from 'react'
import { CheckCircle2, FileUp, ShieldCheck } from 'lucide-react'
import { confirmarCargaInicialAccion, crearCargaInicialAccion, decidirEstadoCargaInicialAccion, validarCargaInicialAccion } from '@/app/acciones-inventario'
import { parsearCargaInicial, type CargaInicialVista, type ErrorFilaCarga, type FilaCargaInicial } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const EJEMPLO = 'producto;lote;vence;propietario;posicion;estado;cantidad\nDEMO-001;L2401;31/12/2028;LOGISSA;A-6;CUARENTENA;120'

/** Administración sube el inventario general; no se confirma hasta que Dirección Técnica decida el estado del stock inicial (D-09). */
export function CargaInicial({ decision, cargas, puedeCargar, puedeDecidir }: { decision: string; cargas: CargaInicialVista[]; puedeCargar: boolean; puedeDecidir: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState('')
  const [filas, setFilas] = useState<FilaCargaInicial[]>([])
  const [errores, setErrores] = useState<ErrorFilaCarga[]>([])
  const [revisado, setRevisado] = useState(false)
  const [revisando, setRevisando] = useState(false)

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
      <section className="card space-y-3" aria-labelledby="decision" data-testid="decision-carga">
        <h2 id="decision" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Estado del stock inicial</h2>
        {decision ? <p className="flex items-center gap-2 text-gray-900" data-testid="decision-vigente"><ShieldCheck className="h-5 w-5 text-green-700" aria-hidden />Dirección Técnica decidió: el stock inicial se carga como <strong>{decision === 'APROBADO' ? 'Aprobado' : 'Cuarentena'}</strong>.</p>
          : <Aviso tipo="atencion" testid="sin-decision">Dirección Técnica todavía no decidió en qué estado entra el stock del inventario general (D-09). Sin esa decisión no se puede confirmar ninguna carga.</Aviso>}
        {puedeDecidir && (
          <div className="flex flex-wrap gap-2">
            {(['APROBADO', 'CUARENTENA'] as const).map((e) => <button key={e} type="button" className={decision === e ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} disabled={pendiente} onClick={() => ejecutar(() => decidirEstadoCargaInicialAccion(e), { exito: `Decidido: el stock inicial entra como ${e === 'APROBADO' ? 'Aprobado' : 'Cuarentena'}.` })} data-testid={`decidir-${e}`}>{e === 'APROBADO' ? 'Entra como Aprobado' : 'Entra como Cuarentena'}</button>)}
          </div>
        )}
      </section>

      {puedeCargar && (
        <section className="card space-y-4" aria-labelledby="subir" data-testid="subir-carga">
          <div>
            <h2 id="subir" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cargar el inventario general</h2>
            <p className="mt-1 text-sm text-gray-600">Archivo CSV (coma, punto y coma o tabulación) con las columnas <code className="tabular">producto, lote, vence, propietario, posicion, estado, cantidad</code>. Primero se revisa: nada se guarda hasta que corrijas los errores.</p>
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
              {errores.length === 0 && filas.length > 0 ? <Aviso tipo="ok" testid="carga-sin-errores">{filas.length} filas listas, {filas.reduce((n, f) => n + Number(f.cantidad), 0).toLocaleString('es-PE')} unidades. Se guardan como borrador y se confirman aparte.</Aviso>
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
              <button type="button" className="btn-primary" disabled={pendiente || errores.length > 0 || filas.length === 0} onClick={() => ejecutar(() => crearCargaInicialAccion(filas, nota.trim() || undefined), { exito: 'Carga guardada como borrador. Confírmala abajo cuando Dirección Técnica haya decidido el estado.', alExito: () => { setTexto(''); setFilas([]); setErrores([]); setRevisado(false) } })} data-testid="guardar-carga">Guardar como borrador</button>
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
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${c.estado === 'CONFIRMADA' ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-300 bg-gray-100 text-gray-800'}`}>{c.estado === 'CONFIRMADA' ? 'Confirmada' : c.estado === 'BORRADOR' ? 'Borrador' : 'Anulada'}</span>
                <span className="min-w-0 flex-1 text-sm text-gray-700">{c.filas} filas · {c.unidades.toLocaleString('es-PE')} unidades · {c.creadoPor} · {formatoFechaHora(c.creadoEn)}{c.nota ? ` · ${c.nota}` : ''}</span>
                {c.estado === 'BORRADOR' && puedeCargar && <button type="button" className="btn-primary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => confirmarCargaInicialAccion(c.id), { exito: 'Carga confirmada: el inventario ya existe y quedó en el Kardex.' })} data-testid="confirmar-carga">Confirmar la carga</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
