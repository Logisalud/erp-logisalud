import { Mail } from 'lucide-react'
import { correoAlProveedor } from '@/domain/devolucion-proveedor'
import type { SalidaVista } from '@/domain/despacho'
import { Aviso } from '../entradas/aviso'
import { BotonCopiarAviso } from './boton-copiar-aviso'

/**
 * Devolución al proveedor (D-161): el WMS no envía correos. Deja el texto listo con producto, lote, vencimiento y cantidad, y quien prepara la salida lo copia y lo manda
 * desde su correo. Si la devolución se creó con menos de 3 meses por delante, se muestra el motivo que se escribió para continuar.
 */
export function CorreoProveedor({ salida, guiaNumero }: { salida: SalidaVista; guiaNumero?: string }) {
  const lineas = salida.lineasDetalle.filter((l) => l.estado !== 'CANCELADA').flatMap((l) => (l.asignacion.length ? l.asignacion : []).map((a) => ({ producto: l.producto, productoCodigo: l.productoCodigo, lote: a.lote, vence: a.vence, cantidad: a.cantidad })))
  const correo = correoAlProveedor({ ordenNumero: salida.numero, proveedor: salida.clienteManual?.razonSocial ?? '', lineas, guiaNumero })
  return (
    <section aria-labelledby="h-correo" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4" data-testid="correo-proveedor">
      <h2 id="h-correo" className="flex items-center gap-2 font-heading text-xl font-medium tracking-wide text-gray-900"><Mail className="h-5 w-5 text-gray-700" aria-hidden />Correo al proveedor</h2>
      {salida.devolucionAvisoMotivo && (
        <Aviso tipo="atencion" testid="devolucion-aviso-motivo"><p className="font-medium">Se creó con menos de 3 meses antes del vencimiento.</p><p className="mt-1">Motivo que se escribió: {salida.devolucionAvisoMotivo}</p></Aviso>
      )}
      {correo.texto ? (
        <>
          <p className="text-sm text-gray-800">El WMS no manda correos. Copia este texto, pégalo en tu correo y envíalo a {salida.clienteManual?.razonSocial ?? 'el proveedor'}.</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900" data-testid="correo-proveedor-texto">{correo.texto}</pre>
          <BotonCopiarAviso texto={correo.texto} testid="copiar-correo-proveedor" etiqueta="Copiar correo al proveedor" pegarEn="tu correo" />
        </>
      ) : <p className="text-sm text-gray-700" data-testid="correo-proveedor-vacio">Todavía no hay lotes asignados: cuando la orden tenga lotes, aquí aparece el correo listo para copiar.</p>}
    </section>
  )
}
