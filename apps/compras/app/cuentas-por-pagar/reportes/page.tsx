import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerReporteCuentasPorPagar, type ObligacionResumen } from '@/services/reportes-cuentas-por-pagar'

export const dynamic = 'force-dynamic'

/** Reportes vs Registros (Fase 1.5): esto es la vista agregada de "qué
 * necesita atención ahora". El listado crudo, filtrable, sigue viviendo en
 * /cuentas-por-pagar (Registros) — este reporte enlaza ahí para el detalle. */
export default async function ReportesCuentasPorPagar() {
  const reporte = await obtenerReporteCuentasPorPagar()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Reportes — Cuentas por Pagar" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />

      <section className="card">
        <h2 className="font-heading text-lg">Total pendiente de pago</h2>
        {reporte.pendientesPorMoneda.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No hay obligaciones pendientes.</p>
        ) : (
          <dl className="mt-2 space-y-1 text-sm">
            {reporte.pendientesPorMoneda.map((t) => (
              <div key={t.moneda} className="flex justify-between">
                <dt className="text-gray-500">{t.moneda}</dt>
                <dd className="font-semibold"><Money valor={t.total} moneda={t.moneda} /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <GrupoLoop
        titulo="Vencidas"
        vacio="No hay obligaciones vencidas."
        obligaciones={reporte.vencidas}
        tono="rojo"
      />

      <GrupoLoop
        titulo="Vencen en los próximos 7 días"
        vacio="Nada vence en los próximos 7 días."
        obligaciones={reporte.vencenEn7Dias}
        tono="ambar"
      />

      <GrupoLoop
        titulo="Observadas — necesitan revisión de Contabilidad"
        vacio="No hay obligaciones observadas."
        obligaciones={reporte.observadas}
        tono="ambar"
      />

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Pagado este mes</h2>
        {reporte.pagadoEsteMesPorMoneda.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Todavía no se pagó nada este mes.</p>
        ) : (
          <dl className="mt-2 space-y-1 text-sm">
            {reporte.pagadoEsteMesPorMoneda.map((t) => (
              <div key={t.moneda} className="flex justify-between">
                <dt className="text-gray-500">{t.moneda}</dt>
                <dd className="font-semibold"><Money valor={t.total} moneda={t.moneda} /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <Link href="/cuentas-por-pagar" className="mt-4 inline-block text-sm text-logisalud-teal underline">
        Ver todos los registros
      </Link>
    </main>
  )
}

const TONO = {
  rojo: 'border-red-200 bg-red-50 text-red-900',
  ambar: 'border-amber-200 bg-amber-50 text-amber-900',
} as const

function GrupoLoop({
  titulo, vacio, obligaciones, tono,
}: { titulo: string; vacio: string; obligaciones: ObligacionResumen[]; tono: keyof typeof TONO }) {
  if (obligaciones.length === 0) {
    return (
      <section className="card mt-4">
        <h2 className="font-heading text-lg">{titulo}</h2>
        <p className="mt-2 text-sm text-gray-600">{vacio}</p>
      </section>
    )
  }
  return (
    <section className={`card mt-4 border-2 ${TONO[tono]}`}>
      <h2 className="font-heading text-lg">{titulo} ({obligaciones.length})</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {obligaciones.map((o) => (
          <li key={o.id}>
            <Link href={`/cuentas-por-pagar/${o.id}`} className="flex items-baseline justify-between gap-3 underline">
              <span>
                {o.codigo} · {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? 'sin proveedor ni beneficiario'}
                {o.fecha_vencimiento_real ? ` · vence ${o.fecha_vencimiento_real}` : ''}
              </span>
              <Money valor={o.neto_a_pagar} moneda={o.moneda} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
