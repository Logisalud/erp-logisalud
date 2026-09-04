import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerSolicitud } from '@/services/solicitudes-gasto'
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from '@/domain/gasto'
import { AccionesSolicitud } from './acciones'
import { FormularioComprobante } from './comprobante-form'
import { VerComprobante } from './ver-comprobante'

export const dynamic = 'force-dynamic'

const ETIQUETA_RESULTADO_LIQUIDACION: Record<string, string> = {
  devolucion_empleado: 'El empleado debe devolver la diferencia',
  reembolso_adicional: 'Se le debe un reembolso adicional',
  sin_diferencia: 'Sin diferencia',
}

export default async function DetalleSolicitud({ params }: { params: { id: string } }) {
  const solicitud = await obtenerSolicitud(params.id)
  if (!solicitud) notFound()

  const comprobantesIniciales = solicitud.comprobantes.filter((c) => c.fase === 'inicial')
  const comprobantesRendicion = solicitud.comprobantes.filter((c) => c.fase === 'rendicion')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={solicitud.codigo} atras={{ href: '/gastos', texto: 'Gastos y Anticipos' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="Tipo" valor={ETIQUETA_TIPO[solicitud.tipo]} />
          <Dato termino="Estado" valor={ETIQUETA_ESTADO[solicitud.estado]} />
          <Dato termino="Categoría" valor={solicitud.categoria?.nombre ?? null} />
          <Dato termino="Área" valor={solicitud.area} />
        </dl>
        <p className="mt-1"><Money valor={solicitud.monto_solicitado} moneda={solicitud.moneda} /></p>
        <p className="mt-2 text-sm text-gray-700">{solicitud.descripcion}</p>
        {solicitud.destino || solicitud.fecha_inicio ? (
          <p className="mt-2 text-sm text-gray-600">
            {solicitud.destino ? `Destino: ${solicitud.destino}. ` : ''}
            {solicitud.fecha_inicio ? `${solicitud.fecha_inicio} al ${solicitud.fecha_fin ?? '—'}` : ''}
          </p>
        ) : null}
        {solicitud.asignadoA ? (
          <p className="mt-1 text-sm text-gray-600">Para: {solicitud.asignadoA}</p>
        ) : null}
        {solicitud.quienAutoriza ? (
          <p className="mt-1 text-sm text-gray-600">Quién autoriza: {solicitud.quienAutoriza}</p>
        ) : null}
        {solicitud.fecha_factura ? (
          <p className="mt-1 text-sm text-gray-600">Fecha del comprobante: {solicitud.fecha_factura}</p>
        ) : null}
        {solicitud.cotizacionStoragePath ? (
          <p className="mt-1 text-sm text-gray-600">
            Cotización adjunta
            <VerComprobante storagePath={solicitud.cotizacionStoragePath} />
          </p>
        ) : null}
        {solicitud.obligacion_id ? (
          <p className="mt-1 text-sm">
            <Link href={`/cuentas-por-pagar/${solicitud.obligacion_id}`} className="text-logisalud-teal underline">
              Ver el pago y el voucher
            </Link>
          </p>
        ) : null}

        <AccionesSolicitud solicitudId={solicitud.id} estado={solicitud.estado} />
      </section>

      {solicitud.estado === 'pendiente_jefe' || solicitud.estado === 'pendiente_contabilidad' || comprobantesIniciales.length > 0 ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Comprobantes</h2>
          {comprobantesIniciales.length > 0 ? (
            <ListaComprobantes comprobantes={comprobantesIniciales} moneda={solicitud.moneda} />
          ) : (
            <p className="text-sm text-gray-500">
              {solicitud.tipo === 'anticipo'
                ? 'Un anticipo no necesita comprobante todavía — se sustenta al rendirlo.'
                : 'Todavía no se subió ningún comprobante.'}
            </p>
          )}
          {solicitud.tipo !== 'anticipo' && (solicitud.estado === 'pendiente_jefe' || solicitud.estado === 'pendiente_contabilidad') ? (
            <div className="mt-3">
              <FormularioComprobante solicitudId={solicitud.id} fase="inicial" />
            </div>
          ) : null}
        </section>
      ) : null}

      {solicitud.tipo === 'anticipo' && (solicitud.estado === 'pendiente_rendicion' || solicitud.estado === 'rendida' || solicitud.estado === 'cerrada') ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Rendición</h2>
          {comprobantesRendicion.length > 0 ? (
            <ListaComprobantes comprobantes={comprobantesRendicion} moneda={solicitud.moneda} />
          ) : (
            <p className="text-sm text-gray-500">Todavía no se subió ningún comprobante de rendición.</p>
          )}
          {solicitud.estado === 'pendiente_rendicion' ? (
            <div className="mt-3">
              <FormularioComprobante solicitudId={solicitud.id} fase="rendicion" />
            </div>
          ) : null}
          {solicitud.liquidacion ? (
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Anticipo</dt><dd><Money valor={solicitud.liquidacion.monto_anticipo} moneda={solicitud.moneda} /></dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Sustentado</dt><dd><Money valor={solicitud.liquidacion.monto_sustentado} moneda={solicitud.moneda} /></dd></div>
              <div className="flex justify-between font-semibold"><dt>Resultado</dt><dd>{ETIQUETA_RESULTADO_LIQUIDACION[solicitud.liquidacion.resultado] ?? solicitud.liquidacion.resultado}</dd></div>
            </dl>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function ListaComprobantes({
  comprobantes, moneda,
}: {
  comprobantes: { id: string; tipo_comprobante: string; numero: string | null; monto: number; sustentable: boolean; storage_path: string | null }[]
  moneda: string
}) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {comprobantes.map((c) => (
        <li key={c.id} className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0">
          <span>
            {c.tipo_comprobante}{c.numero ? ` ${c.numero}` : ''}
            {!c.sustentable ? <span className="ml-2 text-xs text-amber-700">no sustentable</span> : null}
            {c.storage_path ? <VerComprobante storagePath={c.storage_path} /> : null}
          </span>
          <Money valor={c.monto} moneda={moneda} />
        </li>
      ))}
    </ul>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  if (valor === null) return null
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor}</dd>
    </div>
  )
}
