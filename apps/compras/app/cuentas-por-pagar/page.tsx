import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarVistaCuentasPorPagar } from '@/services/obligaciones'
import { TablaObligaciones } from '@/components/tabla-obligaciones'
import {
  nombreDelRecorte, querystringDeFiltro, resolverFiltroCuentasPorPagar,
} from '@/domain/filtros-cuentas-por-pagar'
import { ETIQUETA_ESTADO, ESTADOS_OBLIGACION } from '@/domain/obligacion'
import { CATEGORIAS_ESTADO, ETIQUETA_CATEGORIA } from '@/domain/categorias-estado-obligacion'

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
  // El filtro se resuelve en el dominio para que la descarga a Excel baje
  // exactamente estas filas y no una reconstrucción parecida.
  const filtro = resolverFiltroCuentasPorPagar(searchParams)
  const { estadoExacto, categoria, soloListas, verAvanzado, sinFiltro } = filtro

  const obligaciones = await listarVistaCuentasPorPagar(filtro)
  const hoy = new Date().toISOString().slice(0, 10)

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
        {/* Baja lo que se está viendo, con los filtros puestos — mismas
            columnas que la tabla, no un recorte distinto. */}
        <a
          href={`/cuentas-por-pagar/descargar${querystringDeFiltro(filtro)}`}
          className="btn-secondary w-full sm:w-auto"
        >
          Exportar a Excel
        </a>
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
        <TablaObligaciones filas={obligaciones} hoy={hoy} />
      )}
    </main>
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
