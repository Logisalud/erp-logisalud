'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { marcarEnviadaAction, marcarConfirmadaAction, type EstadoAccionOC } from './actions'

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

function Boton({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? textoEnviando : texto}
    </button>
  )
}
