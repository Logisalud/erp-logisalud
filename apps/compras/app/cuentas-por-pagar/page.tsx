import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarObligaciones } from '@/services/obligaciones'
import { ETIQUETA_ESTADO, ESTADOS_OBLIGACION, type EstadoObligacion } from '@/domain/obligacion'
import { ETIQUETA_ESTADO_PROPUESTA, type EstadoPropuesta } from '@/domain/propuesta'
import { ETIQUETA_ORIGEN, type OrigenObligacion } from '@/domain/reportes'
import {
  CATEGORIAS_ESTADO, ETIQUETA_CATEGORIA, categoriaDeEstado, estaVencida,
  estadosDeCategoria, estadosVisiblesPorDefecto,
  type CategoriaEstado,
} from '@/domain/categorias-estado-obligacion'

export const dynamic = 'force-dynamic'

/**
 * El índice de obligaciones, en tabla y no en tarjetas: son hasta 200 filas
 * de nueve orígenes distintos y lo que se hace acá es ESCANEAR — buscar una
 * fila, comparar montos, ver qué venció. Mismo criterio que "Mis
 * operaciones" y "Pendientes de aprobar".
 *
 * Los filtros van por CATEGORÍA de estado (6) y no por estado técnico (10):
 * nadie recorre diez chips para encontrar "lo que falta pagar". La precisión
 * no se pierde — cada fila muestra su estado exacto, y "Ver todos los
 * estados" despliega los diez para cuando Contabilidad necesite el detalle.
 *
 * Acá NO se paga: el pago vive en la propuesta aprobada, y ofrecerlo por
 * fila haría que armar y aprobar el lote pasen a ser opcionales (regla de
 * oro, sección 4 del documento maestro). La columna "Lote" es el camino
 * hacia donde sí se paga.
 */
export default async function CuentasPorPagar({
  searchParams,
}: {
  searchParams: { estado?: string; categoria?: string; listas?: string; avanzado?: string }
}) {
  const estadoExacto = ESTADOS_OBLIGACION.includes(searchParams.estado as EstadoObligacion)
    ? (searchParams.estado as EstadoObligacion)
    : undefined
  const categoria = CATEGORIAS_ESTADO.includes(searchParams.categoria as CategoriaEstado)
    ? (searchParams.categoria as CategoriaEstado)
    : undefined
  // "Listas para pagar" no es un estado: es estar en una propuesta YA
  // APROBADA y sin pagar. `en_propuesta` por sí solo no dice si el lote pasó
  // la aprobación, así que va como filtro aparte.
  const soloListas = searchParams.listas === '1'
  const verAvanzado = searchParams.avanzado === '1' || !!estadoExacto

  const filtroEstados = soloListas
    ? undefined
    : estadoExacto
      ? estadoExacto
      : categoria
        ? estadosDeCategoria(categoria)
        : estadosVisiblesPorDefecto()

  const todas = await listarObligaciones(soloListas ? undefined : filtroEstados)
  const obligaciones = soloListas
    ? todas.filter((o) => o.propuesta?.estado === 'aprobada' && !o.yaPagada)
    : todas

  const hoy = new Date().toISOString().slice(0, 10)
  const sinFiltro = !soloListas && !estadoExacto && !categoria

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Encabezado titulo="Registros — Cuentas por Pagar" atras={{ href: '/', texto: 'Módulos' }} />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/cuentas-por-pagar/propuestas" className="btn-primary w-full sm:w-auto">
          Propuestas de pago
        </Link>
        {/* Decía "Ver reportes" y llevaba a UN reporte, no al índice — el
            nombre engañaba. Ahora lleva al Dashboard, que es donde quedó ese
            contenido, y se llama igual que allá. */}
        <Link href="/dashboard" className="btn-secondary w-full sm:w-auto">
          Qué necesita atención
        </Link>
        <Link href="/reportes" className="btn-secondary w-full sm:w-auto">
          Ver reportes
        </Link>
      </div>

      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        <Chip etiqueta="💸 Listas para pagar" activo={soloListas} href="/cuentas-por-pagar?listas=1" />
        <Chip etiqueta="Todas" activo={sinFiltro} href="/cuentas-por-pagar" />
        {CATEGORIAS_ESTADO.map((c) => (
          <Chip
            key={c}
            etiqueta={ETIQUETA_CATEGORIA[c]}
            activo={categoria === c}
            href={`/cuentas-por-pagar?categoria=${c}`}
          />
        ))}
      </div>

      {/* El detalle técnico existe pero no estorba: quien lo necesita lo
          abre, y no es la vista por defecto. */}
      {verAvanzado ? (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase text-gray-500">Estados técnicos</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {ESTADOS_OBLIGACION.map((e) => (
              <Chip
                key={e}
                etiqueta={ETIQUETA_ESTADO[e]}
                activo={estadoExacto === e}
                href={`/cuentas-por-pagar?estado=${e}`}
              />
            ))}
          </div>
          <Link href="/cuentas-por-pagar" className="mt-2 inline-block text-xs text-gray-500 underline">
            Ocultar estados técnicos
          </Link>
        </div>
      ) : (
        <div className="mb-4">
          <Link href="/cuentas-por-pagar?avanzado=1" className="text-xs text-gray-500 underline">
            Ver todos los estados
          </Link>
        </div>
      )}

      {sinFiltro ? (
        <p className="mb-3 text-xs text-gray-500">
          No se muestran las rechazadas ni las anuladas — están en el chip &ldquo;No procede&rdquo;.
        </p>
      ) : null}

      {obligaciones.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {soloListas
            ? 'No hay nada listo para pagar: ninguna obligación está en una propuesta aprobada pendiente de desembolso.'
            : 'No hay obligaciones para este filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Proveedor / Beneficiario</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Vencimiento</th>
                <th className="px-3 py-2 font-medium">Lote</th>
                <th className="px-3 py-2 font-medium">Concepto</th>
              </tr>
            </thead>
            <tbody>
              {obligaciones.map((o) => (
                <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/cuentas-por-pagar/${o.id}`} className="font-medium text-logisalud-teal underline">
                      {o.codigo}
                    </Link>
                    {o.numero_factura ? (
                      <span className="block text-xs text-gray-500">{o.numero_factura}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate">
                    {o.proveedor?.razon_social ?? o.beneficiario?.nombre ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {ETIQUETA_ORIGEN[o.origen as OrigenObligacion] ?? o.origen}
                  </td>
                  {/* El estado EXACTO, no la categoría: el filtro agrupa, la
                      fila no pierde precisión. */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <EstadoChip estado={o.estado} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={o.neto_a_pagar} moneda={o.moneda} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Vencimiento
                      fecha={o.fecha_vencimiento_real}
                      vencida={estaVencida(o.fecha_vencimiento_real, o.estado, hoy)}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <CeldaLote propuesta={o.propuesta ?? null} yaPagada={!!o.yaPagada} />
                  </td>
                  <td className="px-3 py-2 max-w-[240px] truncate" title={o.concepto ?? undefined}>
                    {o.concepto ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

/** Tono por categoría, nunca como única señal: siempre acompaña al texto. */
const TONO_POR_CATEGORIA: Record<CategoriaEstado, string> = {
  por_completar: 'border-amber-200 bg-amber-50 text-amber-800',
  en_revision: 'border-amber-200 bg-amber-50 text-amber-800',
  en_camino_a_pago: 'border-sky-200 bg-sky-50 text-sky-800',
  pagada: 'border-green-200 bg-green-50 text-green-800',
  en_cuotas: 'border-gray-200 bg-gray-50 text-gray-700',
  no_procede: 'border-red-200 bg-red-50 text-red-800',
}

function EstadoChip({ estado }: { estado: EstadoObligacion }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONO_POR_CATEGORIA[categoriaDeEstado(estado)]}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

/**
 * El vencido en rojo — pero solo cuando todavía hay algo que pagar (ver
 * `estaVencida`): pintar de rojo una obligación ya pagada entrenaría a
 * ignorar el color.
 */
function Vencimiento({ fecha, vencida }: { fecha: string | null; vencida: boolean }) {
  if (!fecha) return <span className="text-gray-400">—</span>
  return (
    <span className={vencida ? 'font-medium text-red-700' : 'text-gray-600'}>
      {fecha}
      {vencida ? <span className="block text-xs">vencida</span> : null}
    </span>
  )
}

/** En qué lote entró, y si ese lote ya se puede pagar. */
function CeldaLote({
  propuesta,
  yaPagada,
}: {
  propuesta: { id: string; codigo: string; estado: string } | null
  yaPagada: boolean
}) {
  if (!propuesta) return <span className="text-gray-400">—</span>
  const aprobada = propuesta.estado === 'aprobada'
  return (
    <>
      <Link
        href={`/cuentas-por-pagar/propuestas/${propuesta.id}`}
        className={
          aprobada && !yaPagada
            ? 'font-medium text-logisalud-green underline'
            : 'text-logisalud-teal underline'
        }
      >
        {propuesta.codigo}
      </Link>
      <span className="block text-xs text-gray-500">
        {yaPagada
          ? 'pagada'
          : aprobada
            ? 'lista para pagar'
            : ETIQUETA_ESTADO_PROPUESTA[propuesta.estado as EstadoPropuesta]}
      </span>
    </>
  )
}

function Chip({ etiqueta, activo, href }: { etiqueta: string; activo: boolean; href: string }) {
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
