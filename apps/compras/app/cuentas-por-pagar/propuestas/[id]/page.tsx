import Link from 'next/link'
import { notFound } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { obtenerPropuesta } from '@/services/propuestas'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'
import { puedeAprobarPropuesta, puedeVerPropuestas, totalesDeLote } from '@/domain/propuesta-permisos'
import { AccionesPropuesta } from './acciones'
import { TablaLote } from './tabla-lote'

export const dynamic = 'force-dynamic'

export default async function DetallePropuesta({ params }: { params: { id: string } }) {
  const perfil = await perfilActual()
  if (!puedeVerPropuestas(perfil)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Propuesta de pago" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />
        <p className="card text-sm text-gray-600">
          Esta pantalla es de Contabilidad y Tesorería.
        </p>
      </main>
    )
  }

  const propuesta = await obtenerPropuesta(params.id)
  if (!propuesta) notFound()

  const aprobada = propuesta.estado === 'aprobada'
  // Tesorería ve el panel pero no decide: su momento es ejecutar el pago,
  // ya aprobado. Sin este gate el botón le aparecía a cualquiera (Pieza I).
  const puedeAprobar = puedeAprobarPropuesta(perfil)
  const totales = totalesDeLote(
    propuesta.detalle.map((d) => ({ moneda: d.moneda, montoAPagar: d.montoAPagar, yaPagada: d.yaPagada }))
  )

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Encabezado titulo={propuesta.codigo} atras={{ href: '/cuentas-por-pagar/propuestas', texto: 'Propuestas' }} />

      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">{propuesta.periodo}</span>
        <span className="text-sm font-medium">{ETIQUETA_ESTADO_PROPUESTA[propuesta.estado]}</span>
      </div>

      {/* No se gatea el componente entero: "Enviar a aprobación" es de
          Tesorería, que arma el lote. Lo que se gatea es aprobar/rechazar. */}
      <AccionesPropuesta propuestaId={propuesta.id} estado={propuesta.estado} puedeAprobar={puedeAprobar} />
      {!puedeAprobar && propuesta.estado === 'pendiente_aprobacion' ? (
        <p className="card mb-4 text-sm text-gray-600">
          Esperando la aprobación de Contabilidad. Cuando la aprueben, Tesorería registra cada pago
          desde &ldquo;Pagos por ejecutar&rdquo;.
        </p>
      ) : null}

      <TablaLote propuesta={propuesta} conPago={false} />

      {/* El pago no se registra acá: se registra en "Pagos por ejecutar",
          que es la bandeja de Tesorería. Tener el formulario también en esta
          pantalla hacía que se llegara al mismo sitio por dos caminos
          distintos sin saber cuál era el bueno. */}
      {aprobada && totales.pendiente.length > 0 ? (
        <Link href={`/pagos-por-ejecutar/${propuesta.id}`} className="btn-primary mt-4 inline-flex">
          Ir a registrar los pagos
        </Link>
      ) : null}
    </main>
  )
}
