import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarExcepcionesConciliacion } from '@/services/facturas-pendientes'
import { AccionExcepcion } from './fila-accion'

export const dynamic = 'force-dynamic'

/**
 * Vista con acción real para Contabilidad (Carta de Simplicidad regla 4: el
 * sistema sugiere — acá, el monto ya verificado y registrado — la persona
 * confirma). La obligación por el monto verificado YA existe (regla de
 * negocio 5: la excepción nunca bloqueó su creación); esta pantalla es
 * dónde queda visible ese "algo no cuadró" para que alguien lo revise, con
 * un link directo a la obligación real.
 */
export default async function ExcepcionesConciliacion() {
  let filas: Awaited<ReturnType<typeof listarExcepcionesConciliacion>> = []
  let error: string | null = null
  try {
    filas = await listarExcepcionesConciliacion()
  } catch (e) {
    error = e instanceof Error ? e.message : 'No pudimos cargar la información.'
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo="Excepciones de conciliación" atras={{ href: '/facturas-pendientes', texto: 'Facturas por conciliar' }} />

      {error ? (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">No pudimos cargar la información. Intenta nuevamente.</div>
      ) : filas.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay ninguna excepción de conciliación pendiente de revisión.</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((f) => (
            <li key={f.id} className="card border-amber-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {f.oc?.codigo ?? '—'} · {f.oc?.proveedor?.razon_social ?? '—'} · {f.numero_factura ?? 'sin número'}
                  </p>
                  <p className="mt-1 text-sm text-amber-800">{f.motivo_excepcion}</p>
                  {f.obligacion ? (
                    <p className="mt-1 text-sm text-gray-600">
                      Obligación registrada por el monto verificado:{' '}
                      <Link href={`/cuentas-por-pagar/${f.obligacion.id}`} className="text-logisalud-teal underline">
                        {f.obligacion.codigo}
                      </Link>{' '}
                      — <Money valor={f.obligacion.neto_a_pagar} />
                    </p>
                  ) : null}
                </div>
                <AccionExcepcion facturaPendienteId={f.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
