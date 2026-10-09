import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { cargarFilas } from '@/lib/reportes-datos'
import { repositorio } from '@/services/repositorio-actual'
import { REPORTES, esIdReporte, filtrosDeUrl, opcionesDe, puedeVerReporte } from '@/domain/reportes'
import { ReporteTabla } from '@/components/reportes/reporte-tabla'

export const metadata = { title: 'Reporte — WMS LOGISALUD' }

export default async function PaginaReporte({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirContexto()
  const id = decodeURIComponent(params.id).toUpperCase()
  if (!esIdReporte(id)) notFound()
  if (!puedeVerReporte(id, ctx.roles)) redirect('/reportes')
  const def = REPORTES[id]
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const [filas, vistas] = await Promise.all([cargarFilas(id, actor), repositorio().listarVistas(id, actor)])
  const opciones = Object.fromEntries(def.filtros.filter((f) => f.tipo === 'seleccion').map((f) => [f.clave, opcionesDe(filas, (f as { campo: string }).campo)]))
  return (
    <div className="space-y-4">
      <Link href="/reportes" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Reportes</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-reporte">{def.titulo}</h1>
        <p className="mt-1 text-gray-600">{def.descripcion} {def.uso}</p>
      </header>
      <ReporteTabla id={id} filas={filas} vistas={vistas} opciones={opciones} filtrosIniciales={filtrosDeUrl(def, searchParams)} />
    </div>
  )
}
