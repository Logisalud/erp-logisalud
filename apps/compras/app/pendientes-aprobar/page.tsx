import { Encabezado } from '@/components/nav'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'
import { TablaPendientes } from './tabla'

export const dynamic = 'force-dynamic'

/**
 * La contraparte de "Mis operaciones": lo que espera una decisión MÍA, de
 * las cuatro fuentes con gate de aprobación real (Pago Directo, Anticipo/
 * Reembolso, Reposición de Caja Chica y Orden de Servicio).
 *
 * Prioriza (lo más viejo arriba) y desde 2026-09-14 también deja APROBAR
 * VARIOS JUNTOS, del mismo tipo. Rechazar sigue viviendo solo en el detalle
 * de cada registro: exige motivo y no es una decisión que se tome en lote.
 * El lote llama a la misma función de aprobar que el botón individual, así
 * que respeta exactamente las mismas reglas — ver
 * services/aprobar-en-lote.ts.
 *
 * Las propuestas de pago SÍ entran (quinta fuente): desde la Pieza I las
 * aprueba Contabilidad (rol admin) o Administración, no Gerencia.
 */
export default async function PendientesDeAprobar() {
  const filas = await listarPendientesDeAprobar()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Pendientes de aprobar" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No tienes nada esperando tu aprobación. Cuando alguien cargue algo que dependa de ti, va a
          aparecer aquí con cuánto tiempo lleva esperando.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            {filas.length === 1 ? '1 registro espera' : `${filas.length} registros esperan`} tu
            decisión. Lo que más tiempo lleva esperando va primero.
          </p>
          <TablaPendientes filas={filas} />
        </>
      )}
    </main>
  )
}
