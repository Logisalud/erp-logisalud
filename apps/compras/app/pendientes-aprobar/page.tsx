import { Encabezado } from '@/components/nav'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'
import { TablaPendientes } from './tabla'

export const dynamic = 'force-dynamic'

/**
 * La contraparte de "Mis operaciones": lo que espera una decisión MÍA, de
 * las siete fuentes con gate de aprobación real.
 *
 * Desde 2026-09-19 va partida en DOS SECCIONES, porque son dos preguntas
 * distintas y mezclarlas hacía que una propuesta de S/ 41,900 se leyera
 * igual que un reembolso de taxi:
 *
 *  1. Documentos por aprobar — "¿este documento está bien?". Quién ve cada
 *     fila depende de la fila, no de un rol fijo: Contabilidad ve lo suyo,
 *     el jefe de área lo suyo. Caja Chica aparece una sola vez, en la
 *     sección, y le toca a quien corresponda según su fase.
 *  2. Lotes de pago por aprobar — "¿autorizo que salga esta plata?". Acá sí
 *     hay candado duro: Contabilidad rol admin y Administración.
 *
 * APROBAR puede ser en lote en las dos secciones, llamando a la misma
 * función que el botón individual (ver services/aprobar-en-lote.ts).
 * RECHAZAR y ANULAR son SIEMPRE de a uno — el porqué está en
 * domain/corte.ts y se resume en que un motivo compartido deja de ser un
 * motivo.
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
