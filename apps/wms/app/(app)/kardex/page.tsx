import Link from 'next/link'
import { Download, FileSpreadsheet, History, SearchX } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { filtroDesdeUrl, consultaDe } from '@/lib/filtro-kardex'
import { repositorio } from '@/services/repositorio-actual'
import { totalesKardex } from '@/domain/inventario'
import { formatoFecha } from '@/domain/fechas'

export const metadata = { title: 'Kardex — WMS LOGISALUD' }

export default async function PaginaKardex({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await exigirContexto()
  const repo = repositorio()
  const p = await repo.panorama()
  const filtro = filtroDesdeUrl(searchParams)
  const par = await repo.parametrosInventario()
  const filas = filtro ? await repo.kardex(filtro) : []
  const prod = filtro ? p.productos.find((x) => x.id === filtro.productoId) : undefined
  const lotes = filtro ? p.lotes.filter((l) => l.productoId === filtro.productoId).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })) : []
  const t = totalesKardex(filas)
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  const consulta = filtro ? consultaDe(filtro) : ''

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Kardex</h1>
        <p className="mt-1 text-gray-600">Tarjeta de control de existencias: solo entradas y salidas, con el saldo después de cada una. Sale únicamente del libro mayor.</p>
      </header>

      <form method="get" className="card grid gap-3 md:grid-cols-6 md:items-end" data-testid="filtros-kardex">
        <div className="md:col-span-2">
          <label htmlFor="k-producto" className="etiqueta">Producto</label>
          <select id="k-producto" name="producto" className="campo" defaultValue={filtro?.productoId ?? ''} required>
            <option value="" disabled>Elige un producto…</option>
            {[...p.productos].sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es')).map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="k-lote" className="etiqueta">Lote</label>
          <select id="k-lote" name="lote" className="campo" defaultValue={filtro?.loteId ?? ''}>
            <option value="">Todos los lotes</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="k-prop" className="etiqueta">Propietario</label>
          <select id="k-prop" name="propietario" className="campo" defaultValue={filtro?.propietarioId ?? ''}>
            <option value="">Todos</option>
            {p.propietarios.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="k-desde" className="etiqueta">Desde</label>
          <input id="k-desde" name="desde" type="date" className="campo" defaultValue={filtro?.desde ?? ''} />
        </div>
        <div>
          <label htmlFor="k-hasta" className="etiqueta">Hasta</label>
          <input id="k-hasta" name="hasta" type="date" className="campo" defaultValue={filtro?.hasta ?? ''} />
        </div>
        <div className="md:col-span-6"><button type="submit" className="btn-primary" data-testid="ver-kardex">Ver el Kardex</button></div>
      </form>

      {!filtro ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="kardex-vacio">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Elige un producto para ver su Kardex</p>
          <p className="mt-1 text-sm text-gray-600">Puedes ver todos sus lotes o uno solo, filtrar por propietario y por fechas.</p>
        </div>
      ) : (
        <>
          <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Saldo inicial', t.saldoInicial], ['Entradas', t.entradas], ['Salidas', t.salidas], ['Saldo final', t.saldoFinal]].map(([k, v]) => (
              <div key={String(k)} className="card !p-4"><p className="text-sm text-gray-600">{k}</p><p className="tabular font-heading text-2xl font-semibold text-gray-900" data-testid={`kardex-${String(k).toLowerCase().replace(' ', '-')}`}>{Number(v).toLocaleString('es-PE')}</p></div>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <a className="btn-secondary btn-sm" href={`${prefijo}/kardex/pdf?${consulta}`} target="_blank" rel="noopener" data-testid="pdf-kardex"><Download className="h-4 w-4" aria-hidden />Kardex en PDF</a>
            <a className="btn-secondary btn-sm" href={`${prefijo}/kardex/xlsx?${consulta}`} download data-testid="xlsx-kardex"><Download className="h-4 w-4" aria-hidden />Kardex en Excel</a>
            {filtro.loteId && <Link className="btn-secondary btn-sm" href={`/lotes/${filtro.loteId}`} data-testid="historia-del-lote"><History className="h-4 w-4" aria-hidden />Historia completa del lote</Link>}
            <span className="text-xs text-gray-600">Formato: {par.kardexCodigoFormato}</span>
          </div>

          {filas.filter((f) => !f.esSaldoInicial).length === 0 && !filas.some((f) => f.esSaldoInicial) ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center" data-testid="kardex-sin-filas">
              <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
              <p className="mt-3 font-medium text-gray-900">Todavía no hay entradas ni salidas con esos filtros</p>
              <p className="mt-1 text-sm text-gray-600">{prod ? `${prod.descripcion} no tiene movimientos en el libro mayor para este lote, propietario o rango.` : 'Prueba con otro rango.'}</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
                <table className="w-full min-w-[1100px] text-left text-sm" data-testid="tabla-kardex">
                  <caption className="sr-only">Kardex del producto</caption>
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>{['Documento', 'N° acta', 'Fecha', 'Lote', 'Proveedor / cliente', 'RUC', 'Doc. de referencia', 'Ubicación', 'Entrada', 'Salida', 'Saldo', 'Tipo de ingreso', 'Propietario'].map((c, i) => <th key={c} scope="col" className={`px-3 py-2.5 font-semibold ${i >= 8 && i <= 10 ? 'text-right' : ''}`}>{c}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.map((f, i) => (
                      <tr key={i} className={f.esSaldoInicial ? 'bg-gray-50 font-medium' : f.esReversa ? 'text-red-800' : ''} data-testid={f.esSaldoInicial ? 'fila-saldo-inicial' : 'fila-kardex'}>
                        <td className="px-3 py-2">{f.tipoDocumento}</td>
                        <td className="tabular px-3 py-2">{f.numeroActa ?? '—'}</td>
                        <td className="tabular px-3 py-2">{f.fecha ? formatoFecha(f.fecha.slice(0, 10)) : '—'}</td>
                        <td className="tabular px-3 py-2">{f.lote ?? '—'}</td>
                        <td className="px-3 py-2">{f.contraparte ?? '—'}</td>
                        <td className="tabular px-3 py-2">{f.ruc ?? '—'}</td>
                        <td className="tabular px-3 py-2">{f.tipoDocRef ? `${f.tipoDocRef} ${f.numeroDocRef ?? ''}` : '—'}</td>
                        <td className="tabular px-3 py-2">{f.posicion ?? '—'}</td>
                        <td className="tabular px-3 py-2 text-right">{f.entrada ? f.entrada.toLocaleString('es-PE') : ''}</td>
                        <td className="tabular px-3 py-2 text-right">{f.salida ? f.salida.toLocaleString('es-PE') : ''}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{f.saldo.toLocaleString('es-PE')}</td>
                        <td className="px-3 py-2">{f.tipoIngreso ?? '—'}</td>
                        <td className="px-3 py-2">{f.propietario ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 lg:hidden" data-testid="lista-kardex">
                {filas.map((f, i) => (
                  <li key={i} className={`rounded-lg border bg-white p-3.5 ${f.esSaldoInicial ? 'border-gray-300 bg-gray-50' : 'border-gray-200'}`}>
                    <p className="flex flex-wrap items-baseline justify-between gap-2"><span className={`font-medium ${f.esReversa ? 'text-red-800' : 'text-gray-900'}`}>{f.tipoDocumento}</span><span className="tabular text-sm text-gray-600">{f.fecha ? formatoFecha(f.fecha.slice(0, 10)) : ''}</span></p>
                    {!f.esSaldoInicial && <p className="tabular text-sm text-gray-700">{f.numeroActa ? `Acta ${f.numeroActa} · ` : ''}lote {f.lote} · {f.posicion}{f.contraparte ? ` · ${f.contraparte}` : ''}</p>}
                    <p className="tabular mt-1 text-sm"><span className="text-green-800">{f.entrada ? `+${f.entrada}` : ''}</span> <span className="text-red-800">{f.salida ? `−${f.salida}` : ''}</span> <strong className="ml-2 text-gray-900">Saldo {f.saldo.toLocaleString('es-PE')}</strong></p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
