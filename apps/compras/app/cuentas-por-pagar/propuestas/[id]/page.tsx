import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerPropuesta } from '@/services/propuestas'
import { obtenerProveedor } from '@/services/proveedores'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'
import { AccionesPropuesta } from './acciones'
import { FormularioPago } from './pago'

export const dynamic = 'force-dynamic'

export default async function DetallePropuesta({ params }: { params: { id: string } }) {
  const propuesta = await obtenerPropuesta(params.id)
  if (!propuesta) notFound()

  const aprobada = propuesta.estado === 'aprobada'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={propuesta.codigo} atras={{ href: '/cuentas-por-pagar/propuestas', texto: 'Propuestas' }} />

      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">{propuesta.periodo}</span>
        <span className="text-sm font-medium">{ETIQUETA_ESTADO_PROPUESTA[propuesta.estado]}</span>
      </div>

      <AccionesPropuesta propuestaId={propuesta.id} estado={propuesta.estado} />

      <ul className="mt-4 space-y-2">
        {await Promise.all(
          propuesta.detalle.map(async (d) => {
            const puedePagar = aprobada && !d.yaPagada && d.proveedorId
            const cuentas = puedePagar ? (await obtenerProveedor(d.proveedorId!))?.cuentas ?? [] : []
            return (
              <li key={d.obligacionId} className="card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{d.codigo}{d.numeroFactura ? ` · ${d.numeroFactura}` : ''}</span>
                  <Money valor={d.montoAPagar} moneda={d.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{d.proveedor?.razon_social ?? 'proveedor no legible'}</p>
                {d.yaPagada ? (
                  <span className="mt-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Pagada</span>
                ) : puedePagar ? (
                  <FormularioPago propuestaId={propuesta.id} obligacionId={d.obligacionId} cuentas={cuentas} />
                ) : null}
              </li>
            )
          })
        )}
      </ul>
    </main>
  )
}
