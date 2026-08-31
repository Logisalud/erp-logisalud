import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { ChipEstado } from '@/components/chip-estado'
import { obtenerOrdenesUnificadas, listarProveedoresParaFiltro } from '@/services/ordenes-unificadas'
import { colorEstadoFila, ETIQUETA_TIPO_ORDEN, type TipoOrdenUnificada } from '@/domain/ordenes-unificadas'
import { ESTADOS_OC, ETIQUETA_ESTADO } from '@/domain/orden-compra'
import { ESTADOS_OS, ETIQUETA_ESTADO_OS } from '@/domain/servicio'
import { BuscadorOrdenes } from './buscador'
import { NuevaOrdenMenu } from './nueva-orden-menu'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  tipo?: string
  estado?: string
  proveedorId?: string
  desde?: string
  hasta?: string
  pendientes?: string
  pagina?: string
}

const TIPOS_VALIDOS: TipoOrdenUnificada[] = ['mercaderia', 'bien', 'servicio']

export default async function OrdenesUnificadas({ searchParams }: { searchParams: SearchParams }) {
  const tipo = TIPOS_VALIDOS.includes(searchParams.tipo as TipoOrdenUnificada)
    ? (searchParams.tipo as TipoOrdenUnificada)
    : undefined
  const estadosDisponibles = tipo === 'servicio' ? ESTADOS_OS : tipo ? ESTADOS_OC : [...ESTADOS_OC, ...ESTADOS_OS]
  const estado = estadosDisponibles.includes(searchParams.estado as never) ? searchParams.estado : undefined
  const pagina = Math.max(1, Number(searchParams.pagina) || 1)
  const soloPendientes = searchParams.pendientes === '1'

  const filtros = {
    busqueda: searchParams.q,
    tipo,
    estado,
    proveedorId: searchParams.proveedorId,
    fechaDesde: searchParams.desde,
    fechaHasta: searchParams.hasta,
    soloPendientes,
  }

  let resultado: Awaited<ReturnType<typeof obtenerOrdenesUnificadas>> | null = null
  let error: string | null = null
  try {
    resultado = await obtenerOrdenesUnificadas(filtros, pagina)
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }
  const proveedores = await listarProveedoresParaFiltro()

  const hayFiltrosActivos = !!(
    searchParams.q || searchParams.tipo || searchParams.estado || searchParams.proveedorId ||
    searchParams.desde || searchParams.hasta || searchParams.pendientes
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Encabezado titulo="Órdenes de compra y servicio" atras={{ href: '/', texto: 'Compras y Pagos' }} />
      <p className="-mt-4 mb-4 text-sm text-gray-600">Encuentra una orden, revisa su avance o crea una nueva.</p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1"><BuscadorOrdenes valorInicial={searchParams.q ?? ''} /></div>
        <NuevaOrdenMenu />
      </div>

      <form className="card mb-4 grid gap-3 sm:grid-cols-5" method="get">
        <input type="hidden" name="q" value={searchParams.q ?? ''} />
        <label className="block text-sm">
          <span className="text-gray-600">Tipo</span>
          <select name="tipo" defaultValue={searchParams.tipo ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todas</option>
            {TIPOS_VALIDOS.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO_ORDEN[t]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Estado</span>
          <select name="estado" defaultValue={searchParams.estado ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todos</option>
            {tipo !== 'servicio' ? ESTADOS_OC.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>) : null}
            {tipo !== 'mercaderia' && tipo !== 'bien' ? ESTADOS_OS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_OS[e]}</option>) : null}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Proveedor</span>
          <select name="proveedorId" defaultValue={searchParams.proveedorId ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 bg-white px-3">
            <option value="">Todos</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Desde</span>
          <input type="date" name="desde" defaultValue={searchParams.desde ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Hasta</span>
          <input type="date" name="hasta" defaultValue={searchParams.hasta ?? ''} className="mt-1 min-h-12 w-full rounded-md border border-gray-300 px-3" />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="pendientes" value="1" defaultChecked={soloPendientes} className="h-5 w-5" />
          Solo pendientes
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-3 sm:justify-end">
          <button type="submit" className="btn-secondary">Filtrar</button>
          {hayFiltrosActivos ? (
            <Link href="/ordenes" className="btn-secondary">Limpiar filtros</Link>
          ) : null}
          {tipo !== 'servicio' ? (
            <Link href="/reportes/ordenes-compra" className="btn-secondary">
              Ver reporte de OC
            </Link>
          ) : null}
        </div>
      </form>

      {error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">
          <p>No pudimos cargar la información. Intenta nuevamente.</p>
        </div>
      ) : !resultado || resultado.filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {hayFiltrosActivos ? 'No encontramos resultados con esos filtros.' : 'Aún no hay órdenes registradas.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">N° de orden</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium">RUC</th>
                  <th className="px-3 py-2 font-medium">Resumen</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Siguiente paso</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {resultado.filas.map((f) => (
                  <tr key={`${f.tipo}-${f.id}`} className="relative border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link href={f.href} className="font-medium text-logisalud-teal underline">
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{ETIQUETA_TIPO_ORDEN[f.tipo]}</td>
                    <td className="px-3 py-2">{f.fecha}</td>
                    <td className="px-3 py-2">{f.proveedor}</td>
                    <td className="px-3 py-2">{f.ruc ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate">{f.resumen}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><Money valor={f.total} moneda={f.moneda} /></td>
                    <td className="px-3 py-2"><ChipEstado texto={f.estadoEtiqueta} color={colorEstadoFila(f.tipo, f.estado)} /></td>
                    <td className="px-3 py-2 text-gray-600">{f.siguientePaso}</td>
                    <td className="px-3 py-2">
                      <Link href={f.href} className="text-logisalud-teal underline">Ver detalle</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacion pagina={pagina} totalPaginas={resultado.totalPaginas} total={resultado.total} searchParams={searchParams} />
        </>
      )}
    </main>
  )
}

function Paginacion({
  pagina, totalPaginas, total, searchParams,
}: { pagina: number; totalPaginas: number; total: number; searchParams: SearchParams }) {
  function hrefPagina(p: number) {
    const params = new URLSearchParams(searchParams as Record<string, string>)
    params.set('pagina', String(p))
    return `/ordenes?${params.toString()}`
  }
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
      <span>{total} orden(es) en total</span>
      <div className="flex gap-2">
        {pagina > 1 ? <Link href={hrefPagina(pagina - 1)} className="btn-secondary">Anterior</Link> : null}
        <span className="self-center">Página {pagina} de {totalPaginas}</span>
        {pagina < totalPaginas ? <Link href={hrefPagina(pagina + 1)} className="btn-secondary">Siguiente</Link> : null}
      </div>
    </div>
  )
}
