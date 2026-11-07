import Link from 'next/link'
import { Boxes, ClipboardList, FilePlus2, SearchX } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeCrearProducto } from '@/domain/permisos'
import { datosFaltantes, productoCompleto, situacionRS, type SituacionRS } from '@/domain/regulatorio'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { puedeEditarRegulatorio } from '@/domain/permisos'
import { puntaje } from '@/domain/busqueda'
import { formatoFecha } from '@/domain/fechas'
import { ChipRS } from '@/components/chips'
import { FiltrosProductos } from '@/components/filtros-productos'

export const metadata = { title: 'Productos — WMS LOGISALUD' }

const RS: SituacionRS[] = ['VENCIDO', 'POR_VENCER', 'VIGENTE', 'SIN_DATO']

export default async function PaginaProductos({
  searchParams,
}: { searchParams: { q?: string; rs?: string; creado?: string } }) {
  const ctx = await exigirContexto()
  const [p, piloto] = await Promise.all([repositorio().panorama(), modoPilotoActivo()])
  const porCompletar = p.productos.filter((x) => !productoCompleto(x.reg)).length
  const q = (searchParams.q ?? '').trim()
  const rs = RS.find((v) => v === searchParams.rs)

  const filas = p.productos
    .map((prod) => ({ prod, sit: situacionRS(prod.reg?.rsVence, p.hoy) }))
    .filter(({ prod, sit }) => {
      if (rs && sit !== rs) return false
      if (q && Math.max(puntaje(q, prod.descripcion), puntaje(q, prod.codigo), puntaje(q, prod.principioActivo ?? ''), puntaje(q, prod.reg?.registroSanitario ?? '')) === 0) return false
      return true
    })
    .sort((a, b) => a.prod.descripcion.localeCompare(b.prod.descripcion, 'es'))

  const hayFiltros = !!(q || rs)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Productos</h1>
          <p className="mt-1 text-gray-600">El maestro es uno solo para todos los propietarios. Aquí se ve su registro sanitario y si Dirección Técnica ya lo validó.</p>
        </div>
        {!piloto && puedeCrearProducto(ctx.roles) && (
          <Link href="/productos/nuevo" className="btn-primary" data-testid="nuevo-producto"><FilePlus2 className="h-5 w-5" aria-hidden />Dar de alta un producto</Link>
        )}
      </header>

      {piloto && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700" data-testid="productos-en-compras">Durante el piloto los productos se crean en Compras: aparecen aquí solos. El WMS solo completa sus datos regulatorios.</p>
      )}
      {porCompletar > 0 && (
        <Link href="/productos/por-completar" className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-950 hover:bg-amber-100" data-testid="ir-por-completar">
          <ClipboardList className="h-5 w-5 shrink-0" aria-hidden />
          <span><strong>{porCompletar} {porCompletar === 1 ? 'producto por completar' : 'productos por completar'}.</strong> Están pendientes de Dirección Técnica: no se aprueban lotes suyos hasta completar sus datos.{puedeEditarRegulatorio(ctx.roles) ? ' Toca para verlos.' : ''}</span>
        </Link>
      )}

      <FiltrosProductos q={q} rs={rs} />

      <p className="text-sm text-gray-600" aria-live="polite" data-testid="conteo-productos">
        {filas.length === p.productos.length ? `${filas.length} productos` : `${filas.length} de ${p.productos.length} productos`}
      </p>

      {filas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="productos-vacio">
          {hayFiltros ? <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden /> : <Boxes className="mx-auto h-9 w-9 text-gray-400" aria-hidden />}
          <p className="mt-3 font-medium text-gray-900">{hayFiltros ? 'Ningún producto coincide con esos filtros' : 'Todavía no hay productos'}</p>
          <p className="mt-1 text-sm text-gray-600">{hayFiltros ? 'Quita algún filtro o busca con otra parte del nombre.' : 'Sandra da de alta el primero desde “Dar de alta un producto”.'}</p>
          {hayFiltros && <Link href="/productos" className="btn-secondary btn-sm mt-4">Quitar filtros</Link>}
        </div>
      ) : (
        <>
          {/* PC y tablet: tabla */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Registro sanitario</th>
                  <th className="px-4 py-3 font-semibold">Vence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map(({ prod, sit }) => (
                  <tr key={prod.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/productos/${prod.id}`} className="font-medium text-gray-900 hover:underline">{prod.descripcion}</Link>{!productoCompleto(prod.reg) && <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900" data-testid="chip-pendiente-dt" title={`Falta: ${datosFaltantes(prod.reg).join(', ')}`}><ClipboardList className="h-3 w-3" aria-hidden />Pendiente de Dirección Técnica</span>}
                      <p className="text-xs text-gray-600">{prod.codigo}{prod.presentacion ? ` · ${prod.presentacion}` : ''}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-gray-800">{prod.reg?.registroSanitario ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="tabular mr-2 text-gray-800">{formatoFecha(prod.reg?.rsVence)}</span>
                      {prod.reg && <ChipRS situacion={sit} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Teléfono: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {filas.map(({ prod, sit }) => (
              <li key={prod.id}>
                <Link href={`/productos/${prod.id}`} className="block rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50">
                  <p className="font-medium text-gray-900">{prod.descripcion}</p>
                  <p className="text-xs text-gray-600">{prod.codigo}{prod.presentacion ? ` · ${prod.presentacion}` : ''}</p>
                  <p className="tabular mt-2 text-sm text-gray-800">RS {prod.reg?.registroSanitario ?? '—'} · vence {formatoFecha(prod.reg?.rsVence)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prod.reg && <ChipRS situacion={sit} />}
                    {!productoCompleto(prod.reg) && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900" data-testid="chip-pendiente-dt" title={`Falta: ${datosFaltantes(prod.reg).join(', ')}`}><ClipboardList className="h-3 w-3" aria-hidden />Pendiente de Dirección Técnica</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
