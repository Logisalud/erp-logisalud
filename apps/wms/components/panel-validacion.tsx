'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { CheckCircle2, MessageSquareWarning, TriangleAlert } from 'lucide-react'
import { decidirProductoAccion, type EstadoFormulario } from '@/app/acciones'

function Botones() {
  const { pending } = useFormStatus()
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" name="decision" value="VALIDADO" disabled={pending} className="btn-primary" data-testid="validar-producto">
        <CheckCircle2 className="h-5 w-5" aria-hidden />{pending ? 'Guardando…' : 'Validar producto'}
      </button>
      <button type="submit" name="decision" value="OBSERVADO" disabled={pending} className="btn-secondary" data-testid="observar-producto">
        <MessageSquareWarning className="h-5 w-5" aria-hidden />Devolver con observación
      </button>
    </div>
  )
}

/** Solo Dirección Técnica: valida el registro sanitario o lo devuelve diciendo qué falta. */
export function PanelValidacion({ productoId }: { productoId: string }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(decidirProductoAccion, {})
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={productoId} />
      <div>
        <label htmlFor="observacion" className="etiqueta">Observación (obligatoria si lo devuelves)</label>
        <textarea id="observacion" name="observacion" rows={3} className="campo !min-h-24 py-2" placeholder="Por ejemplo: el vencimiento no coincide con el certificado." />
      </div>
      <Botones />
      {estado.ok === true && estado.mensaje && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-green-800" data-testid="mensaje-ok"><CheckCircle2 className="h-4 w-4" aria-hidden />{estado.mensaje}</p>
      )}
      {estado.ok === false && estado.mensaje && (
        <p role="alert" className="flex items-start gap-2 text-sm text-amber-900" data-testid="mensaje-error"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{estado.mensaje}</p>
      )}
    </form>
  )
}
