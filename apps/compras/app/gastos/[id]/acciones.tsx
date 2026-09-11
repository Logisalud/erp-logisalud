'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  aprobarPorContabilidadAction, rechazarPorContabilidadAction,
  liquidarAnticipoAction, anularSolicitudAction, type EstadoAccion,
} from './actions'
import { puedeAnularseSolicitud, type EstadoSolicitud } from '@/domain/gasto'

/**
 * Un par de botones por estado, nunca todos juntos — cada rol ve solo lo que
 * le toca decidir ahora.
 *
 * Pieza A: ya no hay botones de "jefe de área". En Reembolso y Gasto directo
 * el dinero ya salió de la empresa cuando la solicitud se crea, y en
 * Anticipo la decisión real la toma Contabilidad al generar la obligación —
 * las solicitudes nacen en `pendiente_contabilidad`.
 */
export function AccionesSolicitud({ solicitudId, estado }: { solicitudId: string; estado: EstadoSolicitud }) {
  const [pending, startTransition] = useTransition()

  const ejecutar = (accion: (id: string) => Promise<{ error: string } | null>) =>
    startTransition(async () => {
      const resultado = await accion(solicitudId)
      if (resultado?.error) alert(resultado.error)
    })

  if (estado === 'pendiente_contabilidad') {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => ejecutar(aprobarPorContabilidadAction)} className="btn-primary">
          {pending ? 'Guardando…' : 'Aprobar (Contabilidad)'}
        </button>
        <BotonRechazar solicitudId={solicitudId} />
        <BotonAnular solicitudId={solicitudId} />
      </div>
    )
  }

  // `pendiente_contabilidad` ya salió arriba con su propio bloque; acá
  // queda el resto donde anular sigue siendo posible (ej. `pendiente_jefe`
  // de una solicitud vieja, anterior a que ese paso quedara vestigial).
  if (puedeAnularseSolicitud(estado)) {
    return <div className="mt-4"><BotonAnular solicitudId={solicitudId} /></div>
  }

  if (estado === 'pendiente_rendicion') {
    return (
      <button
        type="button" disabled={pending}
        onClick={() => ejecutar(liquidarAnticipoAction)}
        className="btn-primary mt-4"
      >
        {pending ? 'Liquidando…' : 'Liquidar con los comprobantes subidos'}
      </button>
    )
  }

  return null
}

/**
 * Motivo obligatorio (Pieza D/K, sesión 2026-09-09) — antes "Rechazar" no
 * pedía por qué, así que quien creó la solicitud (o Contabilidad revisando
 * después) no tenía forma de saber la razón. Mismo patrón que el "Anular…"
 * de OC/OS/Pago Directo: detrás de un botón secundario que revela el motivo.
 */
function BotonRechazar({ solicitudId }: { solicitudId: string }) {
  const accion = rechazarPorContabilidadAction.bind(null, solicitudId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(accion, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary">
        Rechazar…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">Contá por qué se rechaza — quien la pidió recibe un aviso con el motivo.</p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo del rechazo…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmarRechazo />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function BotonConfirmarRechazo() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
      {pending ? 'Rechazando…' : 'Confirmar rechazo'}
    </button>
  )
}

/**
 * Anular por error de captura (Pieza G) — distinto de "Rechazar", que es la
 * decisión de Contabilidad sobre una solicitud bien cargada. Esto es quien
 * la pidió corrigiéndose, y el servicio solo lo permite mientras
 * Contabilidad no la haya revisado todavía.
 */
function BotonAnular({ solicitudId }: { solicitudId: string }) {
  const accion = anularSolicitudAction.bind(null, solicitudId)
  const [estado, dispatch] = useFormState<EstadoAccion, FormData>(accion, null)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary">
        Anular…
      </button>
    )
  }

  return (
    <form action={dispatch} className="card w-full space-y-2 border-red-200">
      <p className="text-sm text-gray-700">
        Esto anula la solicitud por un error de captura — contá qué pasó. Si ya la revisó
        Contabilidad, vas a tener que pedirle a ella que la rechace.
      </p>
      {estado?.error ? <p className="text-sm text-red-700">{estado.error}</p> : null}
      <textarea
        name="motivo" required rows={2} placeholder="Motivo de la anulación…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <BotonConfirmarAnulacion />
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">Cancelar</button>
      </div>
    </form>
  )
}

function BotonConfirmarAnulacion() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
      {pending ? 'Anulando…' : 'Confirmar anulación'}
    </button>
  )
}
