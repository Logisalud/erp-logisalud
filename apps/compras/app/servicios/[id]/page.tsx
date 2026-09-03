import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { StepperOrden, TarjetaSiguientePaso } from '@/components/stepper-orden'
import { Historial } from '@/components/historial'
import { obtenerOS } from '@/services/servicios'
import { obtenerHistorialOS } from '@/services/historial-orden'
import { ETIQUETA_ESTADO_OS } from '@/domain/servicio'
import { PASOS_OS, pasoAlcanzadoOS, siguientePasoOS } from '@/domain/ordenes-unificadas'
import { AccionesOS } from './acciones'
import { FormularioFactura } from './factura-form'
import { FormularioConformidad } from './conformidad-form'
import { VerFactura } from './ver-factura'

export const dynamic = 'force-dynamic'

export default async function DetalleOS({ params }: { params: { id: string } }) {
  const os = await obtenerOS(params.id)
  if (!os) notFound()

  const puedeSubirFacturaODarConformidad = ['aprobada', 'en_ejecucion', 'factura_adjunta', 'facturada'].includes(os.estado)
  const yaDioConformidadPositiva = os.conformidad?.conforme === true
  const historial = await obtenerHistorialOS(os.id)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={os.codigo} atras={{ href: '/servicios', texto: 'Servicios' }} />

      <div className="mb-4 overflow-x-auto">
        <StepperOrden pasos={PASOS_OS} pasoAlcanzado={pasoAlcanzadoOS(os.estado)} />
      </div>

      <TarjetaSiguientePaso texto={siguientePasoOS(os.estado)} />

      <section className="card mt-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-gray-500">Proveedor:</dt><dd>{os.proveedor?.razon_social ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500">Estado:</dt><dd>{ETIQUETA_ESTADO_OS[os.estado]}</dd></div>
          <div className="flex gap-2"><dt className="text-gray-500">Área:</dt><dd>{os.area_solicitante}</dd></div>
          {os.fecha_entrega_estimada ? <div className="flex gap-2"><dt className="text-gray-500">Entrega estimada:</dt><dd>{os.fecha_entrega_estimada}</dd></div> : null}
        </dl>
        <p className="mt-1"><Money valor={os.monto_estimado} moneda={os.moneda} /></p>
        <p className="mt-2 text-sm text-gray-700">{os.descripcion_servicio}</p>

        <AccionesOS osId={os.id} estado={os.estado} />
      </section>

      {os.estado !== 'pendiente_jefe' && os.estado !== 'rechazada_jefe' ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Factura</h2>
          {os.storage_path_factura_proveedor ? (
            <VerFactura storagePath={os.storage_path_factura_proveedor} />
          ) : (
            <p className="text-sm text-gray-500">Todavía no se subió la factura.</p>
          )}
          {!os.storage_path_factura_proveedor && puedeSubirFacturaODarConformidad ? (
            <div className="mt-3"><FormularioFactura osId={os.id} /></div>
          ) : null}
        </section>
      ) : null}

      {os.estado !== 'pendiente_jefe' && os.estado !== 'rechazada_jefe' ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Conformidad</h2>
          {os.conformidad ? (
            <p className="text-sm text-gray-700">
              {os.conformidad.conforme ? 'El área usuaria confirmó que el servicio se cumplió.' : 'El área usuaria marcó que el servicio NO se cumplió.'}
              {os.conformidad.observaciones ? ` — ${os.conformidad.observaciones}` : ''}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Todavía no hay conformidad registrada.</p>
          )}
          {!yaDioConformidadPositiva && puedeSubirFacturaODarConformidad ? (
            <div className="mt-3"><FormularioConformidad osId={os.id} /></div>
          ) : null}
        </section>
      ) : null}

      {os.obligacion ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Obligación</h2>
          <p className="text-sm text-gray-700">
            <Link href={`/cuentas-por-pagar/${os.obligacion.id}`} className="text-logisalud-teal underline">
              {os.obligacion.codigo}
            </Link>
          </p>
        </section>
      ) : os.estado === 'factura_adjunta' ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Obligación</h2>
          <p className="mb-3 text-sm text-gray-600">
            {os.conformidad?.conforme
              ? 'Ya tiene la factura y la conformidad — Contabilidad puede registrar la obligación.'
              : 'Contabilidad puede registrar la obligación con la factura ya subida — igual va a necesitar la conformidad del área usuaria antes de poder darle conformidad a la obligación.'}
          </p>
          <Link href={`/servicios/${os.id}/registrar-obligacion`} className="btn-primary">
            Registrar obligación (Contabilidad)
          </Link>
        </section>
      ) : null}

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Historial</h2>
        <div className="mt-2">
          <Historial eventos={historial} />
        </div>
      </section>
    </main>
  )
}
