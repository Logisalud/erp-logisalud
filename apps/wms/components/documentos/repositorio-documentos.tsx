'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, History, Plus, RefreshCw, SearchX, Upload, X } from 'lucide-react'
import { buscarAlcanceAccion, subirDocumentoAccion } from '@/app/acciones-documentos'
import {
  DE_QUE_ES, ETIQUETA_ESTADO_DOCUMENTO, ETIQUETA_TIPO_DOCUMENTO, TIPOS_DOCUMENTO, filtrarDocumentos, motivoNoPuedeSubir, puedeCargarCoaEnBloque, puedeDefinirPerfiles,
  type DocumentoVista, type EstadoDocumento, type OpcionAlcance, type PanoramaDocumentos, type TipoDocumento,
} from '@/domain/documentos'
import type { Rol } from '@/domain/tipos'
import { formatoFechaHora } from '@/domain/fechas'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK, PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { Buscador } from '../inventario/mover/piezas'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const CHIP_ROJO = 'border-red-200 bg-red-50 text-red-800'
const fecha = (iso?: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Sin vencimiento')
const tam = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Estado con texto + ícono (nunca solo color). */
export function ChipDocumento({ estado }: { estado: EstadoDocumento }) {
  const m = {
    VIGENTE: { cls: CHIP_OK, Icono: CheckCircle2 }, POR_VENCER: { cls: CHIP_AVISO, Icono: AlertTriangle },
    VENCIDO: { cls: CHIP_ROJO, Icono: AlertTriangle }, REEMPLAZADO: { cls: CHIP_NEUTRO, Icono: History },
  }[estado]
  return <span className={`${base} ${m.cls}`} data-testid="chip-estado-documento"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_DOCUMENTO[estado]}</span>
}

interface Destino { tipo: TipoDocumento; alcance?: OpcionAlcance; reemplaza?: DocumentoVista }

/** Subir un documento nuevo, o una versión nueva de uno existente (la anterior queda en el historial). */
function FormSubida({ roles, destino, panorama, onCerrar, onGuardado }: { roles: readonly Rol[]; destino: Destino; panorama: PanoramaDocumentos; onCerrar: () => void; onGuardado: (texto: string) => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [tipo, setTipo] = useState<TipoDocumento>(destino.tipo)
  const [alcance, setAlcance] = useState<OpcionAlcance | undefined>(destino.alcance)
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState<OpcionAlcance[]>([])
  const [archivo, setArchivo] = useState<File | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState('')
  const seq = useRef(0)
  const reemplaza = destino.reemplaza
  const hayVigente = !!reemplaza || (alcance !== undefined && panorama.documentos.some((d) => d.tipo === tipo && d.alcanceId === alcance.id && d.estado !== 'REEMPLAZADO'))
  const noPuede = motivoNoPuedeSubir(roles, tipo, hayVigente)
  const errores = mensaje?.errores ?? {}

  async function buscar(texto: string) {
    setQ(texto)
    const n = ++seq.current
    if (texto.trim().length < 2) { setOpciones([]); return }
    const r = await buscarAlcanceAccion(tipo, texto)
    if (n === seq.current) setOpciones(r)
  }
  function enviar() {
    if (!alcance || !archivo) return
    const f = new FormData()
    f.set('tipo', tipo); f.set('alcanceId', alcance.id); f.set('archivo', archivo)
    if (desde) f.set('vigenteDesde', desde)
    if (hasta) f.set('vigenteHasta', hasta)
    if (reemplaza) f.set('reemplazaA', reemplaza.id)
    else if (hayVigente) {
      const v = panorama.documentos.find((d) => d.tipo === tipo && d.alcanceId === alcance.id && d.estado !== 'REEMPLAZADO')
      if (v) f.set('reemplazaA', v.id)
    }
    if (motivo) f.set('motivo', motivo)
    const hayAnterior = hayVigente
    ejecutar(() => subirDocumentoAccion(f), { alExito: () => { onGuardado(hayAnterior ? 'Versión nueva guardada; la anterior quedó en el historial.' : 'Documento guardado.'); onCerrar() } })
  }
  const tiposPermitidos = TIPOS_DOCUMENTO

  return (
    <section className="space-y-4 rounded-lg border-2 border-green-700 bg-white p-4 md:p-5" aria-labelledby="titulo-subida" data-testid="form-subida">
      <div className="flex items-start justify-between gap-3">
        <h2 id="titulo-subida" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">{reemplaza ? `Versión nueva de ${ETIQUETA_TIPO_DOCUMENTO[tipo]}` : 'Subir un documento'}</h2>
        <button type="button" className="btn-secondary btn-sm" onClick={onCerrar} aria-label="Cerrar" data-testid="subida-cerrar"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {!reemplaza && (
        <div role="group" aria-label="Qué documento es" className="flex flex-wrap gap-2">
          {tiposPermitidos.map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => { setTipo(t); setAlcance(undefined); setOpciones([]); setQ('') }}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${tipo === t ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid={`subida-tipo-${t}`}>{ETIQUETA_TIPO_DOCUMENTO[t]}<span className="ml-1 text-xs font-normal text-gray-600">{DE_QUE_ES[t]}</span></button>
          ))}
        </div>
      )}
      {alcance ? (
        <p className="text-sm text-gray-800" data-testid="subida-alcance"><span className="font-medium">{ETIQUETA_TIPO_DOCUMENTO[tipo]} {DE_QUE_ES[tipo]}: </span>{alcance.etiqueta}{alcance.detalle ? <span className="text-gray-600"> · {alcance.detalle}</span> : null}
          {!reemplaza && <button type="button" className="ml-2 text-sm font-medium text-green-800 underline" onClick={() => setAlcance(undefined)}>Cambiar</button>}</p>
      ) : (
        <div>
          <Buscador id="q-alcance" etiqueta={tipo === 'COA' ? '¿De qué lote es?' : tipo === 'REGISTRO_SANITARIO' ? '¿De qué producto es?' : '¿De qué fabricante es?'} ayuda="Escribe al menos 2 letras o números."
            valor={q} onCambio={buscar} testid="subida-buscar" autoFoco />
          {opciones.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200" data-testid="subida-opciones">
              {opciones.map((o) => <li key={o.id}><button type="button" className="flex min-h-12 w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50" onClick={() => setAlcance(o)} data-testid="subida-opcion"><span className="font-medium text-gray-900">{o.etiqueta}</span>{o.detalle && <span className="text-xs text-gray-600">{o.detalle}</span>}</button></li>)}
            </ul>
          )}
          {q.trim().length >= 2 && opciones.length === 0 && <p className="mt-2 text-sm text-gray-600">No encontramos nada con eso.</p>}
        </div>
      )}
      <div>
        <label htmlFor="subida-archivo" className="etiqueta">Archivo PDF</label>
        <input id="subida-archivo" type="file" accept="application/pdf,.pdf" className="campo" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} data-testid="subida-archivo" aria-invalid={!!errores.archivo} />
        {errores.archivo && <p className="mt-1 text-sm text-red-800">{errores.archivo}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="subida-desde" className="etiqueta">Vigente desde <span className="font-normal text-gray-600">(opcional)</span></label><input id="subida-desde" type="date" className="campo" value={desde} onChange={(e) => setDesde(e.target.value)} data-testid="subida-desde" /></div>
        <div><label htmlFor="subida-hasta" className="etiqueta">Vence el <span className="font-normal text-gray-600">(vacío si no vence)</span></label><input id="subida-hasta" type="date" className="campo" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="subida-hasta" aria-invalid={!!errores.vigenteHasta} />
          {errores.vigenteHasta && <p className="mt-1 text-sm text-red-800">{errores.vigenteHasta}</p>}</div>
      </div>
      {hayVigente && <div><label htmlFor="subida-motivo" className="etiqueta">¿Por qué se reemplaza? <span className="font-normal text-gray-600">(opcional)</span></label><input id="subida-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="subida-motivo" /></div>}
      {noPuede && <Aviso tipo="atencion" testid="subida-no-puede">{noPuede}.</Aviso>}
      {mensaje?.tipo === 'error' && !mensaje.errores && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || !alcance || !archivo || !!noPuede} onClick={enviar} data-testid="subida-guardar"><Upload className="h-5 w-5" aria-hidden />{pendiente ? 'Guardando…' : hayVigente ? 'Guardar versión nueva' : 'Guardar documento'}</button>
        <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
      </div>
    </section>
  )
}

function Historial({ d, todos }: { d: DocumentoVista; todos: readonly DocumentoVista[] }) {
  const cadena: DocumentoVista[] = []
  for (let a: DocumentoVista | undefined = d; a; a = a.reemplazaA ? todos.find((x) => x.id === a!.reemplazaA) : undefined) cadena.push(a)
  return (
    <ol className="space-y-2 px-4 py-3 text-sm md:px-6" data-testid="historial-documento" aria-label="Versiones del documento">
      {cadena.map((v, i) => (
        <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-gray-900">{i === 0 ? 'Versión actual' : 'Versión anterior'}</span>
          <Link href={`/documentos/archivo/${v.id}`} target="_blank" className="font-medium text-green-800 underline">{v.nombreArchivo}</Link>
          <span className="text-gray-700">{tam(v.bytes)} · subido por {v.subidoPorNombre} el {formatoFechaHora(v.subidoEn)} · {v.vigenteHasta ? `vencía el ${fecha(v.vigenteHasta)}` : 'sin vencimiento'}</span>
          {v.motivoReemplazo && <span className="text-gray-700">Motivo: {v.motivoReemplazo}</span>}
        </li>
      ))}
    </ol>
  )
}

const FILTRO_ESTADOS: EstadoDocumento[] = ['VENCIDO', 'POR_VENCER', 'VIGENTE']

export function RepositorioDocumentosVista({ panorama, roles }: { panorama: PanoramaDocumentos; roles: readonly Rol[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<'' | TipoDocumento>('')
  const [estado, setEstado] = useState<'' | EstadoDocumento>('')
  const [historial, setHistorial] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [subida, setSubida] = useState<Destino | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)
  const { resumen } = panorama
  const visibles = useMemo(() => filtrarDocumentos(panorama.documentos, { q, tipo, estado, historial }), [panorama.documentos, q, tipo, estado, historial])
  const reemplazados = new Set(panorama.documentos.map((d) => d.reemplazaA).filter(Boolean))
  const puedeAlgo = roles.some((r) => r === 'direccion_tecnica' || r === 'jefe_almacen' || r === 'auxiliar' || r === 'asistente_dt')
  const tarjetas = [
    { k: 'vencidos', titulo: 'Vencidos', n: resumen.vencidos, e: 'VENCIDO' as const, cls: resumen.vencidos ? 'border-red-300' : 'border-gray-200' },
    { k: 'porVencer', titulo: 'Por vencer (30 días)', n: resumen.porVencer, e: 'POR_VENCER' as const, cls: resumen.porVencer ? 'border-amber-300' : 'border-gray-200' },
    { k: 'vigentes', titulo: 'Vigentes', n: resumen.vigentes, e: 'VIGENTE' as const, cls: 'border-gray-200' },
  ]

  return (
    <div className="space-y-4" data-testid="repositorio-documentos">
      <div className="grid grid-cols-3 gap-3" data-testid="resumen-documentos">
        {tarjetas.map((t) => (
          <button key={t.k} type="button" aria-pressed={estado === t.e} onClick={() => setEstado(estado === t.e ? '' : t.e)} className={`rounded-lg border-2 bg-white p-3 text-left md:p-4 ${estado === t.e ? 'border-green-700' : t.cls}`} data-testid={`resumen-${t.k}`}>
            <span className="tabular block font-heading text-2xl font-semibold text-gray-900 md:text-3xl">{t.n}</span><span className="text-xs text-gray-700 md:text-sm">{t.titulo}</span>
          </button>
        ))}
      </div>

      {resumen.lotesSinCoa > 0 && (
        <Aviso tipo="atencion" testid="aviso-sin-coa">
          <p><strong className="font-medium">{resumen.lotesSinCoa} {resumen.lotesSinCoa === 1 ? 'lote con stock no tiene' : 'lotes con stock no tienen'} COA.</strong> No se podrán incluir en un paquete de despacho hasta que se adjunte.</p>
          <ul className="mt-1 space-y-0.5" data-testid="lista-sin-coa">
            {panorama.lotesSinCoa.slice(0, 5).map((l) => (
              <li key={l.loteId} className="flex flex-wrap items-center gap-x-2"><span className="tabular font-medium">{l.lote}</span><span>{l.producto}</span>
                <button type="button" className="font-medium underline" onClick={() => setSubida({ tipo: 'COA', alcance: { id: l.loteId, etiqueta: `Lote ${l.lote}`, detalle: l.producto } })} data-testid="adjuntar-coa">Adjuntar COA</button></li>
            ))}
          </ul>
          {panorama.lotesSinCoa.length > 5 && <p className="mt-1">Y {panorama.lotesSinCoa.length - 5} más: usa «Cargar COA en bloque» para subir varios a la vez.</p>}
        </Aviso>
      )}
      {resumen.porRevisar > 0 && <Aviso tipo="info" testid="aviso-por-revisar"><p>{resumen.porRevisar} {resumen.porRevisar === 1 ? 'archivo de COA quedó' : 'archivos de COA quedaron'} sin lote. <Link href="/documentos/carga" className="font-medium underline">Revisarlos</Link></p></Aviso>}

      <div className="flex flex-wrap items-center gap-3">
        {puedeAlgo && <button type="button" className="btn-primary" onClick={() => setSubida({ tipo: 'COA' })} data-testid="abrir-subida"><Plus className="h-5 w-5" aria-hidden />Subir documento</button>}
        {puedeCargarCoaEnBloque(roles) && <Link href="/documentos/carga" className="btn-secondary" data-testid="ir-carga-coa"><Upload className="h-5 w-5" aria-hidden />Cargar COA en bloque</Link>}
        {puedeDefinirPerfiles(roles) && <Link href="/documentos/perfiles" className="btn-secondary" data-testid="ir-perfiles">Qué pide cada cliente</Link>}
      </div>

      {subida && <FormSubida key={`${subida.tipo}-${subida.alcance?.id ?? ''}-${subida.reemplaza?.id ?? ''}`} roles={roles} destino={subida} panorama={panorama} onCerrar={() => setSubida(null)} onGuardado={setGuardado} />}
      {guardado && !subida && <Aviso tipo="ok">{guardado}</Aviso>}

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <Buscador id="q-doc" etiqueta="Buscar documentos" ayuda="Por lote, producto, fabricante o nombre de archivo." valor={q} onCambio={setQ} testid="doc-buscar" />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo">
          {TIPOS_DOCUMENTO.map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(tipo === t ? '' : t)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${tipo === t ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid={`doc-filtro-${t}`}>{ETIQUETA_TIPO_DOCUMENTO[t]}</button>
          ))}
          <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-gray-800"><input type="checkbox" className="h-5 w-5" checked={historial} onChange={(e) => setHistorial(e.target.checked)} data-testid="doc-historial" />Incluir versiones reemplazadas</label>
          {(q || tipo || estado) && <button type="button" className="btn-secondary btn-sm" onClick={() => { setQ(''); setTipo(''); setEstado('') }}><X className="h-4 w-4" aria-hidden />Quitar filtros</button>}
        </div>
      </div>

      <p className="text-sm text-gray-700" aria-live="polite" data-testid="doc-conteo">{visibles.length} {visibles.length === 1 ? 'documento' : 'documentos'}</p>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="doc-sin-resultados">
          <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 font-medium text-gray-900">Ningún documento coincide</p><p className="mt-1 text-sm text-gray-600">Prueba con otra palabra o quita los filtros.</p>
        </div>
      ) : (
        <>
          {/* PC y tablet: tabla */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-documentos">
              <caption className="sr-only">Documentos regulatorios</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
                <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Versiones</span></th>
                <th scope="col" className="px-2 py-2 font-medium">Documento</th><th scope="col" className="px-2 py-2 font-medium">De</th>
                <th scope="col" className="px-2 py-2 font-medium">Vence</th><th scope="col" className="px-2 py-2 font-medium">Estado</th><th scope="col" className="px-2 py-2 font-medium">Archivo</th><th scope="col" className="px-2 py-2"><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((d) => {
                  const on = abierto === d.id
                  const tieneHistoria = !!d.reemplazaA || reemplazados.has(d.id)
                  const puedeReemplazar = d.estado !== 'REEMPLAZADO' && !motivoNoPuedeSubir(roles, d.tipo, true)
                  return (
                    <Fragment key={d.id}>
                      <tr className="hover:bg-gray-50" data-testid="fila-documento">
                        <td className="px-2 py-2">{tieneHistoria && <button type="button" aria-expanded={on} onClick={() => setAbierto(on ? null : d.id)} className="inline-flex h-10 w-10 items-center justify-center rounded hover:bg-gray-100" aria-label={`${on ? 'Ocultar' : 'Ver'} versiones de ${d.nombreArchivo}`} data-testid="abrir-historial">{on ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}</button>}</td>
                        <td className="px-2 py-2 font-medium text-gray-900">{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</td>
                        <td className="px-2 py-2 text-gray-900"><span className="tabular">{d.alcance}</span></td>
                        <td className="tabular whitespace-nowrap px-2 py-2 text-gray-800">{fecha(d.vigenteHasta)}</td>
                        <td className="px-2 py-2"><ChipDocumento estado={d.estado} /></td>
                        <td className="px-2 py-2"><Link href={`/documentos/archivo/${d.id}`} target="_blank" className="inline-flex items-center gap-1.5 font-medium text-green-800 underline"><FileText className="h-4 w-4" aria-hidden />{d.nombreArchivo}</Link><span className="block text-xs text-gray-600">{tam(d.bytes)}</span></td>
                        <td className="px-2 py-2 text-right">{puedeReemplazar && <button type="button" className="btn-secondary btn-sm" onClick={() => setSubida({ tipo: d.tipo, alcance: { id: d.alcanceId, etiqueta: d.alcance }, reemplaza: d })} data-testid="reemplazar-documento"><RefreshCw className="h-4 w-4" aria-hidden />Reemplazar</button>}</td>
                      </tr>
                      {on && <tr><td colSpan={7} className="bg-white p-0"><Historial d={d} todos={panorama.documentos} /></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Teléfono: filas compactas */}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lista-documentos-movil">
            {visibles.map((d) => {
              const on = abierto === d.id
              const tieneHistoria = !!d.reemplazaA || reemplazados.has(d.id)
              const puedeReemplazar = d.estado !== 'REEMPLAZADO' && !motivoNoPuedeSubir(roles, d.tipo, true)
              return (
                <li key={d.id} data-testid="fila-documento-movil">
                  <div className="space-y-1.5 px-4 py-3">
                    <div className="flex items-start justify-between gap-2"><p className="font-medium text-gray-900">{ETIQUETA_TIPO_DOCUMENTO[d.tipo]} · <span className="tabular">{d.alcance}</span></p><ChipDocumento estado={d.estado} /></div>
                    <p className="text-sm text-gray-700">{d.vigenteHasta ? `Vence el ${fecha(d.vigenteHasta)}` : 'Sin vencimiento'} · <span className="break-all">{d.nombreArchivo}</span></p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Link href={`/documentos/archivo/${d.id}`} target="_blank" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-green-800 underline"><FileText className="h-4 w-4" aria-hidden />Abrir PDF</Link>
                      {tieneHistoria && <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-gray-800 underline" onClick={() => setAbierto(on ? null : d.id)} aria-expanded={on}>Versiones</button>}
                      {puedeReemplazar && <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-gray-800 underline" onClick={() => { setSubida({ tipo: d.tipo, alcance: { id: d.alcanceId, etiqueta: d.alcance }, reemplaza: d }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Reemplazar</button>}
                    </div>
                  </div>
                  {on && <div className="border-t border-gray-100 bg-gray-50"><Historial d={d} todos={panorama.documentos} /></div>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

