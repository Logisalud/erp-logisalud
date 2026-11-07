import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ClipboardList } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeEditarRegulatorio } from '@/domain/permisos'
import { datosFaltantes, productoCompleto } from '@/domain/regulatorio'

export const metadata = { title: 'Productos por completar — WMS LOGISALUD' }

/** PIL-8: los productos los crea Compras; en el WMS esperan aquí hasta que Sandra o Katia completen sus datos regulatorios. Mientras tanto no se aprueban lotes suyos. */
export default async function ProductosPorCompletar() {
  const ctx = await exigirContexto()
  if (!puedeEditarRegulatorio(ctx.roles)) redirect('/productos')
  const p = await repositorio().panorama()
  const filas = p.productos.filter((x) => !productoCompleto(x.reg)).sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/productos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Productos</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Productos por completar</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Compras crea los productos y llegan aquí solos. Hasta que completes sus datos —registro sanitario y su vencimiento, fabricante, forma farmacéutica, concentración y condición de almacenamiento— figuran «pendientes de Dirección Técnica» y no se aprueban lotes suyos. En la ficha también marcas «sin material de envase».</p>
      </header>
      {filas.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-10 text-center text-green-900" data-testid="por-completar-vacio">
          <CheckCircle2 className="mx-auto h-9 w-9" aria-hidden />
          <p className="mt-3 font-medium">No hay productos por completar</p>
          <p className="mt-1 text-sm">Todos los productos de Compras tienen sus datos regulatorios. Cuando llegue uno nuevo, aparece aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600" data-testid="conteo-por-completar">{filas.length} {filas.length === 1 ? 'producto' : 'productos'} por completar</p>
          <ul className="space-y-3" data-testid="lista-por-completar">
            {filas.map((x) => (
              <li key={x.id}>
                <Link href={`/productos/${x.id}`} className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400" data-testid="fila-por-completar">
                  <p className="font-medium text-gray-900">{x.descripcion}</p>
                  <p className="text-xs text-gray-600">{x.codigo}{x.presentacion ? ` · ${x.presentacion}` : ''}</p>
                  <p className="mt-2 flex items-start gap-2 text-sm text-amber-950"><ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>Falta: {datosFaltantes(x.reg).join(', ')}.</span></p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
