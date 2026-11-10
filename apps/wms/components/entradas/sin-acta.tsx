'use client'

import { PackageOpen } from 'lucide-react'
import { iniciarRecepcionAccion } from '@/app/acciones-entradas'
import { explicarSinActa } from '@/domain/entradas'
import type { EstadoSolicitud } from '@/domain/entradas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

/**
 * El acta de una solicitud cuya recepción todavía no empezó: en vez de un error, dice qué falta y ofrece «Iniciar recepción»,
 * que es la misma acción real del paso «por llegar» (verificar línea por línea y armar el acta).
 */
export function SinActa({ solicitudId, estado, puedeRecibir, resaltar }: { solicitudId: string; estado: EstadoSolicitud; puedeRecibir: boolean; resaltar?: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const e = explicarSinActa(estado, puedeRecibir)
  if (!e) return null
  return (
    <div className="mt-3 space-y-3" data-testid="sin-acta">
      <Aviso tipo={resaltar ? 'atencion' : 'info'} testid="sin-acta-explicacion">{e.texto}</Aviso>
      {e.puedeIniciar && (
        <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => iniciarRecepcionAccion(solicitudId), { exito: 'Recepción iniciada. Verifica cada línea; el acta se arma al terminar.' })} data-testid="iniciar-recepcion-acta">
          <PackageOpen className="h-5 w-5" aria-hidden />{pendiente ? 'Iniciando…' : 'Iniciar recepción'}
        </button>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}
