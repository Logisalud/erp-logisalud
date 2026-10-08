'use client'

import { useState } from 'react'
import { Ban, CheckCircle2, PackageOpen, UserCheck } from 'lucide-react'
import { anularSolicitudAccion, autorizarSolicitudAccion, iniciarRecepcionAccion } from '@/app/acciones-entradas'
import type { SolicitudDetalle } from '@/domain/entradas-vistas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

/** Los pasos que mueven la solicitud: autorizar, empezar la recepción y anular. */
export function AccionesSolicitud({ solicitud, puedePreparar, puedeRecibir }: { solicitud: SolicitudDetalle; puedePreparar: boolean; puedeRecibir: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const s = solicitud.estado

  return (
    <div className="space-y-3" data-testid="acciones-solicitud">
      {s === 'BORRADOR' && puedePreparar && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Esta solicitud todavía no está autorizada. Al autorizarla queda programada ("por llegar") y lo anunciado ya no se reescribe.</p>
          <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => autorizarSolicitudAccion(solicitud.id), { exito: 'Solicitud autorizada: queda por llegar.' })} data-testid="autorizar-solicitud"><UserCheck className="h-5 w-5" aria-hidden />{pendiente ? 'Autorizando…' : 'Autorizar la solicitud'}</button>
        </div>
      )}
      {s === 'PROGRAMADA' && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Cuando llegue el camión, empieza la recepción: verificas cada línea contra lo que esperamos y se arma el acta.</p>
          {puedeRecibir ? (
            <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => iniciarRecepcionAccion(solicitud.id), { exito: 'Recepción iniciada. Verifica cada línea.' })} data-testid="iniciar-recepcion"><PackageOpen className="h-5 w-5" aria-hidden />{pendiente ? 'Empezando…' : 'Empezar la recepción'}</button>
          ) : <p className="text-sm text-gray-600">La recepción la empieza el personal de almacén.</p>}
        </div>
      )}
      {s === 'CERRADA' && <Aviso tipo="ok" testid="solicitud-cerrada"><span className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4" aria-hidden />Solicitud cerrada</span>El inventario ya existe. Ahora espera su evaluación organoléptica.</Aviso>}
      {s === 'ANULADA' && <Aviso tipo="info" testid="solicitud-anulada">Esta solicitud está anulada. Su número no se reutiliza.</Aviso>}

      {puedePreparar && s !== 'CERRADA' && s !== 'ANULADA' && !solicitud.bloqueadoPorFirmas && (
        <div>
          {!anulando ? (
            <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setAnulando(true)} data-testid="abrir-anular-solicitud"><Ban className="h-4 w-4" aria-hidden />Anular la solicitud…</button>
          ) : (
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-700">Una solicitud anulada se conserva con su motivo. No se borra.</p>
              <div><label htmlFor="motivo-anular-sol" className="etiqueta">Motivo</label><input id="motivo-anular-sol" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" /></div>
              <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => anularSolicitudAccion(solicitud.id, motivo), { exito: 'Solicitud anulada.', alExito: () => setAnulando(false) })} data-testid="confirmar-anular-solicitud">Anular</button><button type="button" className="btn-secondary btn-sm" onClick={() => setAnulando(false)}>No anular</button></div>
            </div>
          )}
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
