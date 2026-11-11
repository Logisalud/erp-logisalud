'use client'

import { Hand, Lock, UserCheck, Undo2 } from 'lucide-react'
import { soltarConformidadAccion, tomarParaConformidadAccion } from '@/app/acciones-picking'
import { motivoNoPuedeTomar, puedeSoltarConformidadAjena, tomaDeConformidad, type OrdenPickingResumen } from '@/domain/despacho'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * «Tomar para conformidad»: quién tiene la orden y los botones que le tocan a cada quien. Libre → «Tomarla»; mía → «Soltarla»; de otra persona → bloqueada (el Jefe la reasigna o la suelta).
 * El Jefe NO la asigna: cada quien toma la suya. Quien picó no la toma.
 */
export function TomaConformidad({ orden, roles, personaId, compacto = false }: { orden: OrdenPickingResumen; roles: readonly Rol[]; personaId: string; compacto?: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const toma = tomaDeConformidad(orden, personaId)
  const noPuede = motivoNoPuedeTomar(roles, personaId, orden)
  const puedeSoltarAjena = puedeSoltarConformidadAjena(roles)

  return (
    <div className={`space-y-2 ${compacto ? 'text-sm' : ''}`} data-testid="toma-conformidad" data-toma={toma}>
      <p className="flex flex-wrap items-center gap-1.5 text-gray-800" data-testid="toma-estado">
        {toma === 'LIBRE' && <><Hand className="h-4 w-4 text-gray-500" aria-hidden />Libre: nadie la tomó</>}
        {toma === 'MIA' && <><UserCheck className="h-4 w-4 text-green-700" aria-hidden /><strong>La tienes tomada</strong></>}
        {toma === 'DE_OTRA' && <><Lock className="h-4 w-4 text-amber-800" aria-hidden />La tomó <strong>{orden.conformidadTomadaNombre ?? 'otra persona'}</strong></>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {toma === 'LIBRE' && !noPuede && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => tomarParaConformidadAccion(orden.id), { exito: 'La tomaste para la conformidad.' })} data-testid="tomar-conformidad">Tomar para conformidad</button>}
        {toma === 'LIBRE' && noPuede && <span className="text-xs text-gray-600" data-testid="toma-no-puede">{noPuede}.</span>}
        {(toma === 'MIA' || (toma === 'DE_OTRA' && puedeSoltarAjena)) && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => soltarConformidadAccion(orden.id), { exito: 'Quedó libre para todos.' })} data-testid="soltar-conformidad"><Undo2 className="h-4 w-4" aria-hidden />Soltarla</button>}
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid="toma-mensaje">{mensaje.texto}</Aviso>}
    </div>
  )
}
