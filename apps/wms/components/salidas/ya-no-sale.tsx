'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageX } from 'lucide-react'
import { yaNoSaleAccion } from '@/app/acciones-salida-manual'
import { textoResultadoYaNoSale, validarMotivoYaNoSale } from '@/domain/ya-no-sale'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * «Ya no sale»: el vendedor avisa que el pedido ya no sale, con la orden ya hecha o ya pickeada. Una sola acción: se cancela la pre-guía, lo pickeado vuelve a su ubicación (lo devuelve un auxiliar y lo verifica
 * otra persona) y la orden se cancela. Nada se borra: queda con su motivo.
 */
export function YaNoSale({ salidaId, numero, preGuia, rutaNumero }: { salidaId: string; numero: string; preGuia?: string; rutaNumero?: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [rehacer, setRehacer] = useState<boolean | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  if (resultado) return <Aviso tipo="ok" testid="ya-no-sale-resultado">{resultado}</Aviso>
  if (!abierto) return <button type="button" className="btn-secondary" onClick={() => setAbierto(true)} data-testid="abrir-ya-no-sale"><PackageX className="h-5 w-5" aria-hidden />Ya no sale</button>
  const errorMotivo = motivo.trim() ? validarMotivoYaNoSale(motivo) : null
  return (
    <div className="w-full max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4" data-testid="ya-no-sale">
      <p className="text-sm font-medium text-gray-900">El pedido de la orden <span className="tabular">{numero}</span> ya no sale. Esto es lo que va a pasar:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">
        {preGuia && <li data-testid="ya-no-sale-pre-guia">La pre-guía <span className="tabular">{preGuia}</span> se cancela y su número no se reutiliza. Quien factura recibe un aviso: no facturar.</li>}
        <li>Lo que ya se pickeó vuelve a su ubicación: un auxiliar lo devuelve y otra persona lo verifica. Mientras tanto la orden queda bloqueada.</li>
        {rutaNumero && <li>El pedido queda marcado «anulado» en la ruta <span className="tabular">{rutaNumero}</span>; su fila no se borra.</li>}
        <li>La orden no se borra: queda cancelada con tu motivo.</li>
      </ul>
      <fieldset className="space-y-1">
        <legend className="etiqueta">¿Qué pasa con el pedido?</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-gray-900"><input type="radio" name="ya-no-sale-pedido" className="mt-0.5 h-5 w-5" checked={rehacer === true} onChange={() => setRehacer(true)} data-testid="ya-no-sale-rehacer" /><span><strong>El pedido sigue.</strong> Hay que rehacer la orden: vuelve a la bandeja para crear una nueva.</span></label>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-gray-900"><input type="radio" name="ya-no-sale-pedido" className="mt-0.5 h-5 w-5" checked={rehacer === false} onChange={() => setRehacer(false)} data-testid="ya-no-sale-cancelar" /><span><strong>El pedido se cancela.</strong> Avisamos al Jefe de Transporte para que el área comercial lo cancele en Pedidos.</span></label>
      </fieldset>
      <div>
        <label htmlFor="motivo-ya-no-sale" className="etiqueta">¿Por qué ya no sale?</label>
        <input id="motivo-ya-no-sale" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" aria-invalid={!!errorMotivo} data-testid="motivo-ya-no-sale" />
        {errorMotivo && <p className="mt-1 text-sm text-red-800" role="alert">{errorMotivo}</p>}
      </div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || rehacer === null || !!validarMotivoYaNoSale(motivo)} data-testid="confirmar-ya-no-sale"
          onClick={() => ejecutar(() => yaNoSaleAccion(salidaId, motivo, rehacer === true), { refrescar: false, alExito: (r) => { setResultado(textoResultadoYaNoSale({ cancelada: r.cancelada, porDevolver: r.porDevolver, preGuia: r.preGuia }, rehacer === true)); router.refresh() } })}>
          {pendiente ? 'Cancelando…' : 'Sí, ya no sale'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setAbierto(false)}>No, volver</button>
      </div>
    </div>
  )
}
