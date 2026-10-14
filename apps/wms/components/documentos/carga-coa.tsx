'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, CircleHelp, Copy, FolderUp, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { asignarItemCoaAccion, cargarCoaArchivoAccion, descartarItemCoaAccion, reintentarItemsCoaAccion } from '@/app/acciones-documentos'
import { validarArchivo, type ItemCoaVista, type ResumenCargaCoa } from '@/domain/documentos'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

function ItemPorRevisar({ it }: { it: ItemCoaVista }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [lote, setLote] = useState('')
  return (
    <li className="space-y-2 px-4 py-3" data-testid="item-por-revisar">
      <p className="font-medium text-gray-900 break-all">{it.nombreArchivo}</p>
      {it.motivo && <p className="text-sm text-gray-700">{it.motivo}</p>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor={`lote-${it.id}`} className="etiqueta">Lote de este COA</label>
          <select id={`lote-${it.id}`} className="campo" value={lote} onChange={(e) => setLote(e.target.value)} data-testid="item-lote">
            <option value="">{it.candidatos.length ? 'Elige el lote…' : 'No hay lotes sugeridos: reintenta cuando existan'}</option>
            {it.candidatos.map((c) => <option key={c.loteId} value={c.loteId}>{c.lote} — {c.producto}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary" disabled={pendiente || !lote} onClick={() => ejecutar(() => asignarItemCoaAccion(it.id, lote), { exito: 'COA asignado.' })} data-testid="item-asignar">Asignar</button>
        <button type="button" className="btn-secondary" disabled={pendiente} onClick={() => ejecutar(() => descartarItemCoaAccion(it.id, 'Descartado en la revisión'), { exito: 'Descartado.' })} data-testid="item-descartar"><Trash2 className="h-4 w-4" aria-hidden />Descartar</button>
      </div>
    </li>
  )
}

/** Carga de una carpeta de COA: cada PDF se relaciona con su lote por el nombre; lo que no se reconoce queda por revisar, sin adivinar. */
export function CargaCoaVista({ items }: { items: ItemCoaVista[] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null)
  const [resumen, setResumen] = useState<ResumenCargaCoa | null>(null)
  const [fallos, setFallos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const porRevisar = items.filter((i) => i.estado === 'POR_REVISAR')

  async function cargar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const archivos = Array.from(lista)
    setSubiendo(true); setResumen(null); setFallos([]); setAvance({ hecho: 0, total: archivos.length })
    const acum: ResumenCargaCoa = { total: 0, importados: 0, porRevisar: 0, duplicados: 0 }
    const malos: string[] = []
    for (const [i, a] of archivos.entries()) {
      const malo = validarArchivo(a.name, a.size)
      if (malo) malos.push(`${a.name}: ${malo}`)
      else {
        const f = new FormData(); f.set('archivo', a)
        try {
          const r = await cargarCoaArchivoAccion(f)
          if (r.ok) { acum.total += r.resumen.total; acum.importados += r.resumen.importados; acum.porRevisar += r.resumen.porRevisar; acum.duplicados += r.resumen.duplicados }
          else malos.push(r.mensaje)
        } catch { malos.push(`${a.name}: no se pudo subir (revisa tu conexión y vuelve a intentar con ese archivo).`) }
      }
      setAvance({ hecho: i + 1, total: archivos.length })
    }
    setResumen(acum); setFallos(malos); setSubiendo(false)
    if (entrada.current) entrada.current.value = ''
    ejecutar(async () => ({ ok: true as const }), { refrescar: true })
  }

  return (
    <div className="space-y-4" data-testid="carga-coa">
      <Link href="/documentos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-green-800 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a documentos</Link>
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Cargar COA en bloque</h2>
        <p className="max-w-2xl text-sm text-gray-700">Elige los PDF (o una carpeta completa). Leemos el nombre de cada archivo y lo relacionamos con su lote, por ejemplo <span className="tabular font-medium">COA_L2501_Lizinopril.pdf</span>. Si el nombre no deja claro de qué lote es, no adivinamos: queda abajo para que lo elijas tú.</p>
        <div className="flex flex-wrap gap-3">
          <label className="btn-primary cursor-pointer"><FolderUp className="h-5 w-5" aria-hidden />Elegir archivos<input ref={entrada} type="file" multiple accept="application/pdf,.pdf" className="sr-only" disabled={subiendo} onChange={(e) => cargar(e.target.files)} data-testid="carga-archivos" /></label>
          <label className="btn-secondary cursor-pointer"><FolderUp className="h-5 w-5" aria-hidden />Elegir una carpeta<input type="file" multiple className="sr-only" disabled={subiendo} onChange={(e) => cargar(e.target.files)} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} data-testid="carga-carpeta" /></label>
        </div>
        {avance && subiendo && <p role="status" className="text-sm text-gray-800" data-testid="carga-avance">Subiendo {avance.hecho} de {avance.total}…</p>}
        {resumen && !subiendo && (
          <Aviso tipo={fallos.length ? 'atencion' : 'ok'} testid="carga-resumen">
            <p className="font-medium">{resumen.total} {resumen.total === 1 ? 'archivo leído' : 'archivos leídos'}.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>{resumen.importados} quedaron como COA vigente de su lote.</li>
              {resumen.porRevisar > 0 && <li>{resumen.porRevisar} necesitan que elijas el lote (abajo).</li>}
              {resumen.duplicados > 0 && <li>{resumen.duplicados} ya estaban cargados (mismo archivo): no se repitieron.</li>}
              {fallos.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </Aviso>
        )}
        {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      </section>

      <section aria-labelledby="titulo-por-revisar" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-por-revisar" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Por revisar <span className="tabular text-gray-600">({porRevisar.length})</span></h2>
          {porRevisar.length > 0 && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => reintentarItemsCoaAccion(), { exito: 'Revisado de nuevo.' })} data-testid="reintentar-items"><RefreshCw className="h-4 w-4" aria-hidden />Volver a leer</button>}
        </div>
        {porRevisar.length === 0
          ? <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-700" data-testid="sin-por-revisar"><CheckCircle2 className="mx-auto mb-1 h-6 w-6 text-green-700" aria-hidden />No hay archivos esperando un lote.</p>
          : <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white" data-testid="lista-por-revisar">{porRevisar.map((it) => <ItemPorRevisar key={it.id} it={it} />)}</ul>}
      </section>

      {items.some((i) => i.estado !== 'POR_REVISAR') && (
        <section aria-labelledby="titulo-ultimas" className="space-y-2">
          <h2 id="titulo-ultimas" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Cargas anteriores</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm" data-testid="lista-cargas">
            {items.filter((i) => i.estado !== 'POR_REVISAR').slice(0, 30).map((i) => {
              const m = { IMPORTADO: { cls: CHIP_OK, Icono: CheckCircle2, t: 'Asignado' }, DUPLICADO: { cls: CHIP_NEUTRO, Icono: Copy, t: 'Ya estaba' }, DESCARTADO: { cls: CHIP_NEUTRO, Icono: Trash2, t: 'Descartado' }, POR_REVISAR: { cls: CHIP_AVISO, Icono: TriangleAlert, t: 'Por revisar' } }[i.estado]
              return <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"><span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{m.t}</span><span className="break-all text-gray-900">{i.nombreArchivo}</span>{i.lote && <span className="tabular text-gray-700">→ lote {i.lote}</span>}</li>
            })}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-1.5 text-xs text-gray-600"><CircleHelp className="h-4 w-4" aria-hidden />Solo se aceptan PDF de hasta 15 MB. Un lote que ya tiene COA vigente lo reemplaza solo Dirección Técnica, desde la lista de documentos.</p>
    </div>
  )
}
