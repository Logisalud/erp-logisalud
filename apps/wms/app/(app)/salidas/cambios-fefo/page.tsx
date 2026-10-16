import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerCambiosFefo } from '@/domain/despacho'

export const metadata = { title: 'Cambios fuera de FEFO — WMS LOGISALUD' }

export default async function CambiosFefo() {
  const ctx = await exigirContexto()
  if (!puedeVerCambiosFefo(ctx.roles)) return <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center"><Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden /><p className="mt-3 text-gray-700">Este reporte es de jefaturas y dirección.</p></div>
  const r = await repositorio().reporteCambiosFefo(undefined, undefined, { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles })
  const filas = r.ok ? r.filas : []
  return (
    <div className="mx-auto max-w-5xl space-y-4" data-testid="cambios-fefo">
      <Link href="/salidas" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Todas las salidas</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Cambios fuera de FEFO</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Quién cambió lotes apartándose del vencimiento más próximo, cuántas veces y cuántas unidades. Cambiar es libre; este reporte solo da visibilidad.</p>
      </header>
      {!r.ok ? <p className="text-red-800">{r.mensaje}</p> : filas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-gray-700" data-testid="cambios-vacio">Nadie se ha apartado del FEFO todavía.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm" data-testid="tabla-cambios-fefo">
            <caption className="sr-only">Cambios fuera de FEFO por persona</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr><th scope="col" className="px-3 py-2 font-medium">Persona</th><th scope="col" className="px-3 py-2 text-right font-medium">Veces</th><th scope="col" className="px-3 py-2 text-right font-medium">Líneas</th><th scope="col" className="px-3 py-2 text-right font-medium">Unidades</th><th scope="col" className="px-3 py-2 font-medium">Última vez</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{filas.map((f) => <tr key={f.personaId}><td className="px-3 py-3 text-gray-900">{f.persona}</td><td className="tabular px-3 py-3 text-right">{f.veces}</td><td className="tabular px-3 py-3 text-right">{f.lineas}</td><td className="tabular px-3 py-3 text-right">{f.unidades.toLocaleString('es-PE')}</td><td className="px-3 py-3 text-gray-700">{new Date(f.ultimaEn).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
