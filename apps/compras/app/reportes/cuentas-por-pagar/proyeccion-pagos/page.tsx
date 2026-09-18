import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerProyeccionPagos } from '@/services/reportes-cuentas-por-pagar-detalle'
import { ETIQUETA_ORIGEN, type OrigenObligacion } from '@/domain/reportes'
import {
  esUrgente, etiquetaDiasParaVencer, ETIQUETA_VENTANA, ordenarProyeccion, resolverOrden,
  resumenPorVentana, totalesPorMoneda, VENTANAS_PROYECCION,
  type ColumnaOrden, type DireccionOrden, type VentanaProyeccion,
} from '@/domain/proyeccion-pagos'

export const dynamic = 'force-dynamic'

type SearchParams = { periodo?: string; orden?: string; dir?: string }

/**
 * Proyección de pagos: UNA tabla, no tarjetas por periodo.
 *
 * El formato de tarjetas (una por ventana) obligaba a comparar montos entre
 * cuatro listas con columnas implícitas, y no dejaba ordenar por nada. Ahora
 * es la misma tabla que el resto del módulo, con el periodo como columna: se
 * puede ordenar por vencimiento —el orden natural de este reporte, y el que
 * trae por defecto— o por cualquier otra columna sin perder la clasificación.
 *
 * LOS TOTALES VAN EN DOS LUGARES, y es a propósito:
 *
 * - Arriba, uno por periodo, calculado siempre sobre TODAS las filas. Es a la
 *   vez el subtotal del periodo y la forma de filtrar por él, así que tiene
 *   que seguir mostrando los cuatro números aunque estés viendo uno solo.
 * - Al pie, el total de lo que estás viendo.
 *
 * Se descartó la fila de subtotal antes de cada grupo: solo tiene sentido si
 * la tabla está siempre agrupada por periodo, y eso pelea con poder ordenar
 * por vencimiento o por monto. Con el resumen de arriba el subtotal por
 * periodo no se pierde en ningún orden.
 *
 * Nunca se mezclan monedas, ni arriba ni abajo — mismo criterio que el resto
 * de los reportes.
 */
export default async function ReporteProyeccionPagos({ searchParams }: { searchParams: SearchParams }) {
  const { filas } = await obtenerProyeccionPagos()
  const orden = resolverOrden(searchParams.orden, searchParams.dir)

  const periodo = (VENTANAS_PROYECCION as readonly string[]).includes(searchParams.periodo ?? '')
    ? (searchParams.periodo as VentanaProyeccion)
    : undefined

  const resumen = resumenPorVentana(filas)
  const visibles = ordenarProyeccion(
    periodo ? filas.filter((f) => f.ventana === periodo) : filas,
    orden.columna,
    orden.direccion
  )
  const totalVisible = totalesPorMoneda(visibles)

  function hrefOrden(columna: ColumnaOrden): string {
    const invertida: DireccionOrden = orden.columna === columna && orden.direccion === 'asc' ? 'desc' : 'asc'
    const params = new URLSearchParams()
    if (periodo) params.set('periodo', periodo)
    params.set('orden', columna)
    params.set('dir', invertida)
    return `?${params.toString()}`
  }

  function hrefPeriodo(v: VentanaProyeccion | null): string {
    const params = new URLSearchParams()
    if (v) params.set('periodo', v)
    params.set('orden', orden.columna)
    params.set('dir', orden.direccion)
    return `?${params.toString()}`
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Encabezado titulo="Proyección de pagos" atras={{ href: '/reportes', texto: 'Ver reportes' }} />

      {/* Total por periodo y filtro, en el mismo lugar: el número y la forma
          de ir a ver de dónde sale. */}
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        {resumen.map((r) => {
          const activo = periodo === r.ventana
          return (
            <Link
              key={r.ventana}
              href={hrefPeriodo(activo ? null : r.ventana)}
              className={`card transition hover:shadow-sm ${activo ? 'border-2 border-logisalud-green' : ''}`}
            >
              <p className="font-heading text-sm">{ETIQUETA_VENTANA[r.ventana]}</p>
              <div className="mt-1 space-y-0.5 text-sm tabular-nums">
                {r.totales.length === 0 ? (
                  <span className="text-gray-500">sin pagos</span>
                ) : (
                  r.totales.map((t) => (
                    <p key={t.moneda}><Money valor={t.total} moneda={t.moneda} /></p>
                  ))
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {r.cantidad} obligación(es){activo ? ' · filtrando' : ''}
              </p>
            </Link>
          )
        })}
      </div>

      {periodo ? (
        <p className="mb-3 text-sm text-gray-600">
          Mostrando solo <strong>{ETIQUETA_VENTANA[periodo]}</strong>.{' '}
          <Link href={hrefPeriodo(null)} className="text-logisalud-teal underline">Ver todos los periodos</Link>
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <p className="card text-sm text-gray-600">Nada que pagar en este periodo.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <Th columna="codigo" orden={orden} href={hrefOrden('codigo')}>Código</Th>
                <Th columna="origen" orden={orden} href={hrefOrden('origen')}>Origen</Th>
                <Th columna="quien" orden={orden} href={hrefOrden('quien')}>A quién</Th>
                <th className="px-3 py-2 font-medium">N° factura</th>
                <Th columna="vencimiento" orden={orden} href={hrefOrden('vencimiento')}>Vencimiento</Th>
                <Th columna="vencimiento" orden={orden} href={hrefOrden('vencimiento')}>Días</Th>
                <Th columna="monto" orden={orden} href={hrefOrden('monto')} alineacion="text-right">Monto</Th>
                <Th columna="periodo" orden={orden} href={hrefOrden('periodo')}>Periodo</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/cuentas-por-pagar/${f.id}`} className="font-medium text-logisalud-teal underline">
                      {f.codigo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {ETIQUETA_ORIGEN[f.origen as OrigenObligacion] ?? f.origen}
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={f.quien}>{f.quien}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{f.numeroFactura ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{f.fechaVencimiento ?? '—'}</td>
                  {/* Vencido en rojo: es el único caso que ya no es proyección
                      sino algo que había que pagar y no se pagó. */}
                  <td className={`px-3 py-2 whitespace-nowrap ${esUrgente(f.diasVencido) ? 'font-medium text-red-700' : 'text-gray-600'}`}>
                    {etiquetaDiasParaVencer(f.diasVencido)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={f.netoAPagar} moneda={f.moneda} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{ETIQUETA_VENTANA[f.ventana]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                <td className="px-3 py-2" colSpan={6}>
                  Total de lo que estás viendo ({visibles.length} obligación(es))
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totalVisible.map((t) => (
                    <p key={t.moneda}><Money valor={t.total} moneda={t.moneda} /></p>
                  ))}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  )
}

/** Encabezado que ordena. La flecha dice por cuál columna se está ordenando. */
function Th({
  columna, orden, href, children, alineacion,
}: {
  columna: ColumnaOrden
  orden: { columna: ColumnaOrden; direccion: DireccionOrden }
  href: string
  children: React.ReactNode
  alineacion?: string
}) {
  const activa = orden.columna === columna
  return (
    <th className={`px-3 py-2 font-medium ${alineacion ?? ''}`}>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-gray-900">
        {children}
        <span aria-hidden className={activa ? 'text-logisalud-green' : 'text-gray-300'}>
          {activa ? (orden.direccion === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </Link>
    </th>
  )
}
