import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligaciones } from '@/services/obligaciones'
import { ETIQUETA_ESTADO, ESTADOS_OBLIGACION, type EstadoObligacion } from '@/domain/obligacion'
import { ETIQUETA_ESTADO_PROPUESTA, type EstadoPropuesta } from '@/domain/propuesta'

export const dynamic = 'force-dynamic'

export default async function CuentasPorPagar({
  searchParams,
}: { searchParams: { estado?: string; listas?: string } }) {
  const estado = ESTADOS_OBLIGACION.includes(searchParams.estado as EstadoObligacion)
    ? (searchParams.estado as EstadoObligacion)
    : undefined
  // "Listas para pagar" no es un estado de la obligación: es estar dentro de
  // una propuesta YA APROBADA y todavía sin pagar. Por eso es un filtro
  // aparte y no un chip más — el estado propio de la fila sigue siendo
  // `en_propuesta`, que por sí solo no dice si el lote pasó la aprobación.
  const soloListas = searchParams.listas === '1'
  const todas = await listarObligaciones(soloListas ? undefined : estado)
  const obligaciones = soloListas
    ? todas.filter((o) => o.propuesta?.estado === 'aprobada' && !o.yaPagada)
    : todas

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
        <FiltroEstado
          etiqueta="💸 Listas para pagar"
          activo={soloListas}
          href="/cuentas-por-pagar?listas=1"
        />
        <FiltroEstado etiqueta="Todas" activo={!estado && !soloListas} href="/cuentas-por-pagar" />
        {ESTADOS_OBLIGACION.map((e) => (
          <FiltroEstado key={e} etiqueta={ETIQUETA_ESTADO[e]} activo={!soloListas && estado === e} href={`/cuentas-por-pagar?estado=${e}`} />
        ))}
      </div>

      {obligaciones.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {soloListas
            ? 'No hay nada listo para pagar: ninguna obligación está en una propuesta aprobada pendiente de desembolso.'
            : 'No hay obligaciones para este filtro.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {obligaciones.map((o) => (
            <li key={o.id} className="card transition hover:shadow-sm">
              <Link href={`/cuentas-por-pagar/${o.id}`} className="block">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{o.codigo}{o.numero_factura ? ` · ${o.numero_factura}` : ''}</span>
                  <Money valor={o.neto_a_pagar} moneda={o.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">
                  {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? o.observaciones ?? 'sin proveedor ni beneficiario'} · {ETIQUETA_ESTADO[o.estado]}
                  {o.fecha_vencimiento_real ? ` · vence ${o.fecha_vencimiento_real}` : ''}
                </p>
              </Link>
              {/* El link a la propuesta va FUERA del link a la ficha: un <a>
                  no puede anidar otro. Es el camino a la pantalla donde se
                  paga — acá no se paga (ver ObligacionListada.propuesta). */}
              <EnQuePropuesta propuesta={o.propuesta ?? null} yaPagada={!!o.yaPagada} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/**
 * En qué lote entró la obligación, y si ese lote ya se puede pagar. Antes el
 * listado decía "en propuesta" sin decir en cuál ni si estaba aprobada, así
 * que Tesorería no tenía forma de llegar a la pantalla del pago.
 */
function EnQuePropuesta({
  propuesta,
  yaPagada,
}: {
  propuesta: { id: string; codigo: string; estado: string } | null
  yaPagada: boolean
}) {
  if (!propuesta) return null
  if (yaPagada) {
    return (
      <p className="mt-1.5 text-xs text-gray-500">
        Pagada — lote{' '}
        <Link href={`/cuentas-por-pagar/propuestas/${propuesta.id}`} className="text-logisalud-teal underline">
          {propuesta.codigo}
        </Link>
      </p>
    )
  }
  const aprobada = propuesta.estado === 'aprobada'
  return (
    <p className="mt-1.5 text-xs">
      <Link
        href={`/cuentas-por-pagar/propuestas/${propuesta.id}`}
        className={aprobada ? 'font-medium text-logisalud-green underline' : 'text-logisalud-teal underline'}
      >
        {aprobada ? `Lista para pagar en ${propuesta.codigo} →` : `En el lote ${propuesta.codigo}`}
      </Link>
      {!aprobada ? <span className="text-gray-500"> · {ETIQUETA_ESTADO_PROPUESTA[propuesta.estado as EstadoPropuesta]}</span> : null}
    </p>
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
