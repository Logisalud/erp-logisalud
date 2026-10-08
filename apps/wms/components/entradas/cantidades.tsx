import type { BloqueFisico, SolicitudDetalle } from '@/domain/entradas-vistas'

const num = (n?: number) => (n == null ? '—' : n.toLocaleString('es-PE'))

/**
 * Cada cantidad tiene su dueño y no se mezclan: la OC y la factura son de Compras; la solicitud (inicial y final) es de la operación
 * del almacén; la física confirmada sale del acta firmada; el inventario nace al confirmar. El WMS no toca la OC ni la factura.
 */
export function TablaCantidades({ solicitud }: { solicitud: SolicitudDetalle }) {
  const esCompra = solicitud.tipo === 'COMPRA_LOCAL'
  const cerrada = solicitud.estado === 'CERRADA'
  const registrado = (l: SolicitudDetalle['lineas'][number]) => solicitud.cantidadFisica.find((b: BloqueFisico) => b.ocItemId === l.ocItemId)?.registrado
  const filas = solicitud.lineas.filter((l) => l.cantidad > 0 || (l.inicial ?? 0) > 0)
  if (filas.length === 0) return null
  return (
    <div className="space-y-3" data-testid="tabla-cantidades">
      <p className="text-sm text-gray-700">Cada cantidad tiene su dueño. {esCompra ? 'La orden de compra y la factura son de Compras (solo lectura aquí); ' : ''}la solicitud la prepara Dirección Técnica; lo físico lo confirma el acta firmada.</p>
      <ul className="space-y-2">
        {filas.map((l) => (
          <li key={l.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium text-gray-900">{l.descripcion} <span className="font-normal text-gray-600">· lote {l.lote}</span></p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {esCompra && <div><dt className="text-xs text-gray-600">Orden de compra</dt><dd className="tabular font-medium text-gray-900">{num(l.ocPedida)}</dd></div>}
              {esCompra && <div><dt className="text-xs text-gray-600">Facturada (Compras)</dt><dd className="tabular font-medium text-gray-900" data-testid="cantidad-facturada">{num(l.ocFacturada)}</dd></div>}
              <div><dt className="text-xs text-gray-600">Solicitud inicial</dt><dd className="tabular font-medium text-gray-900">{num(l.inicial)}</dd></div>
              <div><dt className="text-xs text-gray-600">Solicitud final</dt><dd className="tabular font-medium text-gray-900">{num(l.cantidad)}</dd></div>
              <div><dt className="text-xs text-gray-600">Física confirmada</dt><dd className="tabular font-medium text-gray-900">{cerrada ? num(l.fisica) : 'cuando se firme el acta'}</dd></div>
              {esCompra && <div><dt className="text-xs text-gray-600">Registrada en Compras</dt><dd className="tabular font-medium text-gray-900">{cerrada ? num(registrado(l)) : '—'}</dd></div>}
            </dl>
          </li>
        ))}
      </ul>
      {esCompra && <p className="text-xs text-gray-600">La factura la registra Compras: aquí solo se muestra. El WMS no la modifica ni la usa para recibir.</p>}
    </div>
  )
}
