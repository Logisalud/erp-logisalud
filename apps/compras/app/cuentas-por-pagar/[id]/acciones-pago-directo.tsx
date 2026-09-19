'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { anularPagoDirectoAction, rechazarPagoDirectoAction, type EstadoAccion } from './actions'

/**
 * Las dos salidas hacia atrás de un Pago Directo. Se ven casi iguales a
 * propósito (un botón secundario que revela el motivo obligatorio, nunca una
 * acción de un solo clic), pero dicen cosas distintas:
 *
 *  - Anular: quien lo cargó se equivocó, el registro no debió existir.
 *  - Rechazar: Contabilidad lo revisó y lo devuelve — la contraparte de
 *    "Dar conformidad", y por eso aparece al lado de ese botón.
 */
export function BotonAnularPagoDirecto({
  obligacionId, registro = 'pago directo',
}: { obligacionId: string; registro?: string }) {
  return (
    <CorteConMotivo
      obligacionId={obligacionId}
      accion={anularPagoDirectoAction}
      etiqueta="Anular…"
      explicacion={`Esto anula ${elLa(registro)} por un error de captura — cuenta qué pasó, Contabilidad recibe un aviso con el motivo.`}
      placeholder="Motivo de la anulación…"
      confirmar="Confirmar anulación"
      confirmando="Anulando…"
      pregunta={`¿Seguro que quieres anular ${elLa(registro)}?`}
      advertencia="No se puede deshacer: queda anulado para siempre, con tu nombre y el motivo. Si te equivocas, hay que cargarlo de nuevo."
    />
  )
}

export function BotonRechazarPagoDirecto({
  obligacionId, registro = 'pago directo',
}: { obligacionId: string; registro?: string }) {
  return (
    <CorteConMotivo
      obligacionId={obligacionId}
      accion={rechazarPagoDirectoAction}
      etiqueta="Rechazar…"
      explicacion={`Esto devuelve ${elLa(registro)} sin conformidad — cuenta qué está mal, quien lo registró recibe un aviso con el motivo.`}
      placeholder="Motivo del rechazo…"
      confirmar="Confirmar rechazo"
      confirmando="Rechazando…"
      pregunta={`¿Seguro que quieres rechazar ${elLa(registro)}?`}
      advertencia="No se puede deshacer: vuelve a quien lo registró con tu motivo, y para seguir adelante tiene que cargarlo de nuevo."
    />
  )
}

/** Los tres registros cortables son masculinos ("el pago directo", "el
 * anticipo", "el reembolso"), pero el artículo va acá y no en cada llamada
 * para que agregar un cuarto no obligue a repetirlo. */
function elLa(registro: string): string {
  return `el ${registro}`
}

type AccionCorte = (obligacionId: string, previo: EstadoAccion, form: FormData) => Promise<EstadoAccion>

function CorteConMotivo({
  obligacionId, accion, etiqueta, explicacion, placeholder, confirmar, confirmando,
  pregunta, advertencia,
}: {
  obligacionId: string
  accion: AccionCorte
  etiqueta: string
  explicacion: string
  placeholder: string
  confirmar: string
  confirmando: string
  pregunta: string
  advertencia: string
}) {
  const conId = accion.bind(null, obligacionId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(conId, null)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  // Último paso antes de escribir: "¿estás seguro?". Es un paso aparte y no
  // un `confirm()` del navegador porque el aviso tiene que decir QUÉ no se
  // puede deshacer, y porque un confirm() nativo no se puede testear ni
  // estilar. El motivo ya está escrito cuando aparece.
  const [seguro, setSeguro] = useState(false)

  function cerrar() {
    setAbierto(false)
    setSeguro(false)
    setMotivo('')
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary mt-4">
        {etiqueta}
      </button>
    )
  }

  return (
    <form action={dispatch} className="card mt-4 w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">{explicacion}</p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder={placeholder}
        value={motivo}
        onChange={(e) => {
          setMotivo(e.target.value)
          // Cambiar el motivo después de pedir confirmación vuelve al paso
          // anterior: no se confirma un texto y se manda otro.
          setSeguro(false)
        }}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      {seguro ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-medium text-red-900">{pregunta}</p>
          <p className="mt-1 text-sm text-red-800">{advertencia}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <BotonConfirmar texto={confirmar} textoEnviando={confirmando} />
            <button type="button" onClick={() => setSeguro(false)} className="btn-secondary">
              No, volver
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSeguro(true)}
            disabled={!motivo.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirmar}
          </button>
          <button type="button" onClick={cerrar} className="btn-secondary">
            Cancelar
          </button>
        </div>
      )}
    </form>
  )
}

function BotonConfirmar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit" disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? textoEnviando : texto}
    </button>
  )
}
