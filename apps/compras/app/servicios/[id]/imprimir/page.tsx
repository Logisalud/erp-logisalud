import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { crearClienteServidor } from '@logisalud/auth/server'
import { obtenerOS } from '@/services/servicios'
import { BotonImprimir } from '@/app/ordenes-compra/[id]/imprimir/boton-imprimir'

export const dynamic = 'force-dynamic'

/**
 * La OS lista para mandarle al proveedor — la contraparte de
 * app/ordenes-compra/[id]/imprimir, que existía desde antes; Servicios no
 * tenía ninguna vista imprimible.
 *
 * Mismo patrón, a propósito: se imprime desde el navegador ("Guardar como
 * PDF") en vez de generar el PDF en el servidor, y el `print:hidden` esconde
 * los botones. Se reusa el mismo BotonImprimir en vez de duplicarlo.
 *
 * Una OS no tiene líneas como una OC: es un servicio descrito en prosa con un
 * monto estimado. Por eso acá no hay tabla de ítems ni desglose de IGV — el
 * IGV real recién se conoce con la factura del proveedor, que se registra
 * después (ver registrarObligacionDesdeOS). Mostrar un "IGV 18%" calculado
 * sobre el estimado sería inventar un número que el documento no tiene.
 */
export default async function ImprimirOS({ params }: { params: { id: string } }) {
  const os = await obtenerOS(params.id)
  if (!os) notFound()

  const proveedor = await datosDelProveedor(os.proveedor?.id ?? null)

  const simbolo = os.moneda === 'USD' ? '$' : 'S/'
  const importe = (n: number) =>
    `${simbolo} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <main className="mx-auto max-w-[820px] bg-white p-8 print:p-0">
      <div className="mb-6 flex gap-2 print:hidden">
        <BotonImprimir />
        <Link href={`/servicios/${os.id}`} className="btn-secondary">Volver</Link>
      </div>

      <header className="flex items-start justify-between border-b-2 border-logisalud-green pb-4">
        <div>
          <Image
            src="/brand/logisalud-color-horizontal.png"
            alt="Logisalud"
            width={1798}
            height={358}
            style={{ height: '32px', width: 'auto' }}
            priority
          />
          <p className="mt-1 text-xs text-gray-600">Orden de servicio</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-xl">{os.codigo}</p>
          <p className="text-xs text-gray-600">Emisión: {os.created_at.slice(0, 10)}</p>
          {os.fecha_entrega_estimada ? (
            <p className="text-xs text-gray-600">Entrega: {os.fecha_entrega_estimada}</p>
          ) : null}
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Proveedor</p>
          <p className="mt-1 font-medium">{proveedor?.razon_social ?? os.proveedor?.razon_social ?? '—'}</p>
          <p className="text-gray-700">RUC {proveedor?.ruc ?? '—'}</p>
          {proveedor?.contacto_nombre ? <p className="text-gray-700">{proveedor.contacto_nombre}</p> : null}
          {proveedor?.contacto_email ? <p className="text-gray-700">{proveedor.contacto_email}</p> : null}
          {proveedor?.direccion_fiscal ? (
            <p className="text-gray-700">{proveedor.direccion_fiscal}</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Condiciones</p>
          <p className="mt-1 text-gray-700">Moneda: {os.moneda}</p>
          <p className="text-gray-700">
            Pago:{' '}
            {os.condiciones_pago_dias != null
              ? os.condiciones_pago_dias === 0
                ? 'contado'
                : `${os.condiciones_pago_dias} días`
              : '—'}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase text-gray-500">Área solicitante</p>
          <p className="text-gray-700">{os.area_solicitante ?? '—'}</p>
        </div>
      </section>

      <section className="mt-6 text-sm">
        <p className="text-xs font-semibold uppercase text-gray-500">Servicio solicitado</p>
        <p className="mt-1 whitespace-pre-line text-gray-800">{os.descripcion_servicio}</p>
      </section>

      <div className="mt-6 ml-auto w-72 text-sm">
        <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
          <span>Monto estimado</span>
          <span className="tabular-nums">{importe(Number(os.monto_estimado))}</span>
        </div>
        <p className="mt-1 text-right text-xs text-gray-500">
          {os.monto_incluye_igv == null
            ? 'No se indicó si incluye IGV'
            : os.monto_incluye_igv
              ? 'Incluye IGV'
              : 'No incluye IGV'}
        </p>
      </div>

      <footer className="mt-10 border-t border-gray-200 pt-3 text-xs text-gray-500">
        Documento generado por el ERP de Logisalud. {os.codigo}.
      </footer>
    </main>
  )
}

type ProveedorImpresion = {
  razon_social: string
  ruc: string | null
  contacto_nombre: string | null
  contacto_email: string | null
  direccion_fiscal: string | null
}

/**
 * `obtenerOS` solo trae id y razón social del proveedor, que alcanza para la
 * ficha en pantalla pero no para un documento que sale de la empresa. Una
 * consulta más acá, en vez de engordar OSDetalle para todas las pantallas.
 */
async function datosDelProveedor(id: string | null): Promise<ProveedorImpresion | null> {
  if (!id) return null
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('servicios')
    .from('proveedores_servicio')
    .select('razon_social, ruc, contacto_nombre, contacto_email, direccion_fiscal')
    .eq('id', id)
    .maybeSingle()
  return (data as ProveedorImpresion | null) ?? null
}
