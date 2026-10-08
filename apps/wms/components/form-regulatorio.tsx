'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { editarRegulatorioAccion, type EstadoFormulario } from '@/app/acciones'
import type { Regulatorio } from '@/domain/tipos'

function Guardar() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="btn-primary" data-testid="guardar-regulatorio">{pending ? 'Guardando…' : 'Guardar los cambios'}</button>
}

function Campo({ nombre, etiqueta, valor, error, ayuda }: { nombre: string; etiqueta: string; valor?: string; error?: string; ayuda?: string }) {
  const id = `reg-${nombre}`
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <input id={id} name={nombre} defaultValue={valor ?? ''} className={`campo ${error ? '!border-red-500' : ''}`} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : ayuda ? `${id}-a` : undefined} />
      {error ? <p id={`${id}-e`} role="alert" className="mt-1 text-sm text-red-700">{error}</p> : ayuda ? <p id={`${id}-a`} className="mt-1 text-xs text-gray-600">{ayuda}</p> : null}
    </div>
  )
}

/** Katia o Sandra: editan los datos regulatorios; rige de inmediato y el motivo es obligatorio (D-37). */
export function FormRegulatorio({ productoId, reg }: { productoId: string; reg?: Regulatorio }) {
  const [estado, accion] = useFormState<EstadoFormulario, FormData>(editarRegulatorioAccion, {})
  const e = estado.errores ?? {}
  return (
    <form action={accion} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={productoId} />
      <div className="grid gap-4 md:grid-cols-2">
        <Campo nombre="registroSanitario" etiqueta="Número de registro sanitario" valor={reg?.registroSanitario} error={e.registroSanitario} />
        <Campo nombre="rsVence" etiqueta="Vencimiento del registro" valor={reg?.rsVence} error={e.rsVence} ayuda="30/06/2030, 2030-06-30 o 06/2030." />
        <Campo nombre="formaPresentacion" etiqueta="Forma farmacéutica" valor={reg?.formaPresentacion} error={e.formaPresentacion} />
        <Campo nombre="concentracion" etiqueta="Concentración" valor={reg?.concentracion} error={e.concentracion} />
        <Campo nombre="fabricante" etiqueta="Fabricante" valor={reg?.fabricante} error={e.fabricante} />
        <Campo nombre="condicionAlmacenamiento" etiqueta="Condición de almacenamiento" valor={reg?.condicionAlmacenamiento} error={e.condicionAlmacenamiento} />
      </div>
      <div>
        <label htmlFor="reg-motivo" className="etiqueta">Motivo del cambio <span className="text-red-700">*</span></label>
        <textarea id="reg-motivo" name="motivo" rows={2} className={`campo !min-h-20 py-2 ${e.motivo ? '!border-red-500' : ''}`} placeholder="Por ejemplo: renovación del registro ante DIGEMID." aria-invalid={e.motivo ? true : undefined} />
        {e.motivo && <p role="alert" className="mt-1 text-sm text-red-700">{e.motivo}</p>}
      </div>
      <Guardar />
      {estado.ok === true && estado.mensaje && <p role="status" className="flex items-center gap-2 text-sm font-medium text-green-800" data-testid="mensaje-ok"><CheckCircle2 className="h-4 w-4" aria-hidden />{estado.mensaje}</p>}
      {estado.ok === false && estado.mensaje && !estado.errores?.motivo && <p role="alert" className="flex items-start gap-2 text-sm text-amber-900" data-testid="mensaje-error"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{estado.mensaje}</p>}
    </form>
  )
}
