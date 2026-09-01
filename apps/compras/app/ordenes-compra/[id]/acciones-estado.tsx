'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { marcarEnviadaAction, marcarConfirmadaAction, cerrarConSaldoPendienteAction, type EstadoAccionOC } from './actions'

/** "Enviar al proveedor" es manual — no manda correo ni nada automático
 * (decisión explícita). Descargar el PDF y avisar que se cambió el estado
 * son dos botones separados a propósito: descargar no es lo mismo que
 * mandarlo, y no hay que asumir que la persona ya lo hizo. */
export function BotonMarcarEnviada({ ocId }: { ocId: string }) {
  const accion = marcarEnviadaAction.bind(null, ocId)
  const [estado, dispatch] = useFormState<EstadoAccionOC, FormData>(accion, null)
  return (
    <form action={dispatch} className="contents">
      {estado?.error ? <p className="w-full text-sm text-red-700">{estado.error}</p> : null}
      <Boton texto="Ya se lo envié al proveedor" textoEnviando="Guardando…" />
    </form>
  )
}

/** El proveedor aceptó el pedido tal como se le mandó — recién acá Almacén
 * puede empezar a recibir mercadería contra esta OC. */
export function BotonMarcarConfirmada({ ocId }: { ocId: string }) {
  const accion = marcarConfirmadaAction.bind(null, ocId)
  const [estado, dispatch] = useFormState<EstadoAccionOC, FormData>(accion, null)
  return (
    <form action={dispatch} className="contents">
      {estado?.error ? <p className="w-full text-sm text-red-700">{estado.error}</p> : null}
      <Boton texto="El proveedor confirmó el pedido" textoEnviando="Guardando…" />
    </form>
  )
}

/**
 * Cierre manual de una OC con saldo pendiente que ya no se va a completar
 * (0030_oc_cierre_parcial.sql). Acción secundaria y poco frecuente — queda
 * detrás de un "Cerrar con saldo pendiente…" que revela el motivo
 * obligatorio, en vez de un botón que dispara la acción de una sola
 * pulsada (Carta de Simplicidad regla 1: el botón primario de la pantalla
 * sigue siendo "Registrar recepción" mientras la OC pueda recibirse más).
 */
export function BotonCerrarConSaldoPendiente({ ocId }: { ocId: string }) {
  const accion = cerrarConSaldoPendienteAction.bind(null, ocId)
  const [estado, dispatch] = useFormState<EstadoAccionOC, FormData>(accion, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary">
        Cerrar con saldo pendiente…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card w-full space-y-2 border-amber-200">
      <p className="text-sm text-gray-700">
        El proveedor ya no va a entregar el resto de esta orden — contá por qué, para que quede en el
        historial.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo del cierre…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmarCierre />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmarCierre() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Cerrando…' : 'Confirmar cierre'}
    </button>
  )
}

function Boton({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? textoEnviando : texto}
    </button>
  )
}
