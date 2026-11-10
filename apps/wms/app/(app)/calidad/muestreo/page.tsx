import Link from 'next/link'
import { ArrowLeft, CalendarCheck, Ruler } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeMarcarAntecedentes } from '@/domain/liberacion'
import { AYUDA_ANTECEDENTES, type TramoMuestreo } from '@/domain/muestreo'
import { formatoFecha } from '@/domain/fechas'
import { PanelAntecedentes } from '@/components/calidad/panel-antecedentes'

export const metadata = { title: 'Tamaño de muestra — WMS LOGISALUD' }

const rango = (t: TramoMuestreo) => t.hasta == null ? `Más de ${(t.desde - 1).toLocaleString('es-PE')}` : `${t.desde.toLocaleString('es-PE')} a ${t.hasta.toLocaleString('es-PE')}`

function Tramos({ titulo, ayuda, tramos, testid }: { titulo: string; ayuda: string; tramos: readonly TramoMuestreo[]; testid: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid={testid}>
      <div className="border-b border-gray-200 px-4 py-3"><h3 className="font-medium text-gray-900">{titulo}</h3><p className="text-sm text-gray-600">{ayuda}</p></div>
      <table className="w-full text-sm">
        <caption className="sr-only">{titulo}: unidades del lote y unidades de muestra</caption>
        <thead className="bg-gray-50 text-left text-gray-700"><tr><th scope="col" className="px-4 py-2 font-medium">Unidades del lote</th><th scope="col" className="px-4 py-2 text-right font-medium">Unidades de muestra</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{tramos.map((t) => <tr key={t.desde}><td className="tabular px-4 py-2 text-gray-900">{rango(t)}</td><td className="tabular px-4 py-2 text-right font-semibold text-gray-900">{t.muestra.toLocaleString('es-PE')}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export default async function Muestreo() {
  const ctx = await exigirContexto()
  const p = await repositorio().panoramaMuestreo()
  const vigente = p.tablas.find((t) => t.vigente)
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link href="/calidad" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Calidad</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Tamaño de muestra</h1>
        <p className="mt-1 max-w-3xl text-gray-700">En cada evaluación organoléptica, el WMS calcula cuántas unidades se toman con la tabla de Dirección Técnica. La tabla es un parámetro con su código y su vigencia: una versión nueva se carga como otra fila, sin tocar el sistema.</p>
      </header>

      {!vigente ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert" data-testid="sin-tabla">No hay una tabla de muestreo que rija hoy. Mientras tanto no se pueden confirmar ingresos: Dirección Técnica debe cargar la tabla vigente.</div>
      ) : (
        <section aria-labelledby="tabla-vigente" className="space-y-4" data-testid="tabla-muestreo">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="tabla-vigente" className="flex items-center gap-2 font-heading text-lg font-medium uppercase tracking-wide text-gray-800"><Ruler className="h-5 w-5" aria-hidden />Tabla {vigente.codigo}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800"><CalendarCheck className="h-3.5 w-3.5" aria-hidden />Rige hoy · {formatoFecha(vigente.vigenteDesde)}{vigente.vigenteHasta ? ` a ${formatoFecha(vigente.vigenteHasta)}` : ''}</span>
          </div>
          <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-gray-800">
            <li>Lotes de menos de <strong>{vigente.umbralTotal} unidades</strong>: se evalúa el <strong>100 %</strong>. En las <strong>devoluciones</strong> también.</li>
            <li><strong>Simplificada</strong>: la de siempre.</li>
            <li><strong>Normal</strong>: se aplica sola cuando es la primera recepción de un producto o de un proveedor.</li>
            <li><strong>Estricta</strong> (100 %): productos con antecedentes de calidad, que marca Dirección Técnica.</li>
          </ul>
          <div className="grid gap-4 md:grid-cols-2">
            <Tramos titulo="Evaluación simplificada" ayuda="Producto y proveedor conocidos." tramos={vigente.simplificada} testid="tramos-simplificada" />
            <Tramos titulo="Evaluación normal" ayuda="Producto o proveedor nuevo (primera recepción)." tramos={vigente.normal} testid="tramos-normal" />
          </div>
          {vigente.nota && <p className="text-xs text-gray-600">{vigente.nota}</p>}
          {p.tablas.length > 1 && <p className="text-sm text-gray-700">Hay {p.tablas.length - 1} versión(es) anterior(es) o futura(s) guardadas con su vigencia: {p.tablas.filter((t) => t !== vigente).map((t) => `${t.codigo} desde ${formatoFecha(t.vigenteDesde)}`).join('; ')}.</p>}
        </section>
      )}

      <section aria-labelledby="antecedentes" className="space-y-3">
        <div>
          <h2 id="antecedentes" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Productos con antecedentes de calidad</h2>
          <p className="max-w-3xl text-sm text-gray-700">{AYUDA_ANTECEDENTES}</p>
        </div>
        <PanelAntecedentes antecedentes={p.antecedentes} puedeMarcar={puedeMarcarAntecedentes(ctx.roles)} />
      </section>
    </div>
  )
}
