import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligaciones } from '@/services/obligaciones'
import { ETIQUETA_ESTADO, ESTADOS_OBLIGACION, type EstadoObligacion } from '@/domain/obligacion'

export const dynamic = 'force-dynamic'

export default async function CuentasPorPagar({
  searchParams,
}: { searchParams: { estado?: string } }) {
  const estado = ESTADOS_OBLIGACION.includes(searchParams.estado as EstadoObligacion)
    ? (searchParams.estado as EstadoObligacion)
    : undefined
  const obligaciones = await listarObligaciones(estado)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Registros — Cuentas por Pagar" atras={{ href: '/', texto: 'Módulos' }} />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/cuentas-por-pagar/propuestas" className="btn-primary w-full sm:w-auto">
          Propuestas de pago
        </Link>
        <Link href="/cuentas-por-pagar/reportes" className="btn-secondary w-full sm:w-auto">
          Ver reportes
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <FiltroEstado etiqueta="Todas" activo={!estado} href="/cuentas-por-pagar" />
        {ESTADOS_OBLIGACION.map((e) => (
          <FiltroEstado key={e} etiqueta={ETIQUETA_ESTADO[e]} activo={estado === e} href={`/cuentas-por-pagar?estado=${e}`} />
        ))}
      </div>

      {obligaciones.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay obligaciones para este filtro.</p>
      ) : (
        <ul className="space-y-2">
          {obligaciones.map((o) => (
            <li key={o.id}>
              <Link href={`/cuentas-por-pagar/${o.id}`} className="card block transition hover:shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{o.codigo}{o.numero_factura ? ` · ${o.numero_factura}` : ''}</span>
                  <Money valor={o.neto_a_pagar} moneda={o.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? o.observaciones ?? 'sin proveedor ni beneficiario'} · {ETIQUETA_ESTADO[o.estado]}
                  {o.fecha_vencimiento_real ? ` · vence ${o.fecha_vencimiento_real}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function FiltroEstado({ etiqueta, activo, href }: { etiqueta: string; activo: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${
        activo ? 'border-logisalud-teal bg-logisalud-teal/10 text-logisalud-teal' : 'border-gray-200 text-gray-600'
      }`}
    >
      {etiqueta}
    </Link>
  )
}
