'use client'

import { CheckCircle2, ShieldAlert, TriangleAlert } from 'lucide-react'
import { validarProductoAccion } from '@/app/acciones'
import { useAccion } from './usar-accion'

/**
 * D-196: un producto que da de alta o edita el Administrador queda «por validar». Hasta que Dirección Técnica (o su asistente) lo valida, sus lotes no se pueden aprobar.
 * Aquí se ve el aviso para todos y el botón solo para quien valida.
 */
export function PanelValidarProducto({ productoId, puedeValidar }: { productoId: string; puedeValidar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  return (
    <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-labelledby="validar-titulo" data-testid="producto-por-validar">
      <h2 id="validar-titulo" className="flex items-center gap-2 font-medium"><ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />Falta que Dirección Técnica valide este producto</h2>
      <p className="mt-1 text-sm">Mientras no esté validado, el producto se puede recibir y guardar, pero sus lotes no se pueden aprobar.</p>
      {puedeValidar ? (
        <div className="mt-3">
          <button type="button" className="btn-primary" disabled={pendiente} data-testid="validar-producto"
            onClick={() => ejecutar(() => validarProductoAccion(productoId), { exito: 'Listo. El producto quedó validado y sus lotes ya se pueden aprobar.' })}>
            <CheckCircle2 className="h-5 w-5" aria-hidden />{pendiente ? 'Validando…' : 'Validar este producto'}
          </button>
        </div>
      ) : <p className="mt-2 text-sm">Sigue: Dirección Técnica revisa los datos regulatorios y lo valida.</p>}
      {mensaje && (
        <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={`mt-3 flex items-center gap-2 text-sm ${mensaje.tipo === 'error' ? 'text-red-800' : 'text-green-900'}`} data-testid="validar-mensaje">
          {mensaje.tipo === 'error' ? <TriangleAlert className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}{mensaje.texto}
        </p>
      )}
    </section>
  )
}
