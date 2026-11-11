'use client'

import { useState } from 'react'
import { Hand, Lock, UserCheck, Undo2 } from 'lucide-react'
import { asignarConformidadAccion, soltarConformidadAccion, tomarParaConformidadAccion } from '@/app/acciones-picking'
import { motivoNoPuedeTomar, puedeAsignarConformidad, tomaDeConformidad, type OrdenPickingResumen, type PersonaPicking } from '@/domain/despacho'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/**
 * «Tomar para conformidad»: quién tiene la orden y los botones que le tocan a cada quien. Libre → «Tomarla»; mía → «Soltarla»; de otra persona → bloqueada (el Jefe la reasigna o la suelta).
 * El Jefe además la asigna a una persona. Quien picó no la toma.
 */
export function TomaConformidad({ orden, roles, personaId, personal, compacto = false }: { orden: OrdenPickingResumen; roles: readonly Rol[]; personaId: string; personal: PersonaPicking[]; compacto?: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [persona, setPersona] = useState('')
  const toma = tomaDeConformidad(orden, personaId)
  const noPuede = motivoNoPuedeTomar(roles, personaId, orden)
  const esJefe = puedeAsignarConformidad(roles)
  const candidatos = personal.filter((p) => p.id !== orden.pickerId)

  return (
    <div className={`space-y-2 ${compacto ? 'text-sm' : ''}`} data-testid="toma-conformidad" data-toma={toma}>
      <p className="flex flex-wrap items-center gap-1.5 text-gray-800" data-testid="toma-estado">
        {toma === 'LIBRE' && <><Hand className="h-4 w-4 text-gray-500" aria-hidden />Libre: nadie la tomó</>}
        {toma === 'MIA' && <><UserCheck className="h-4 w-4 text-green-700" aria-hidden /><strong>La tienes tomada</strong></>}
        {toma === 'DE_OTRA' && <><Lock className="h-4 w-4 text-amber-800" aria-hidden />La tomó <strong>{orden.conformidadTomadaNombre ?? 'otra persona'}</strong>{orden.conformidadAsignadaPor ? ' (asignada por el Jefe)' : ''}</>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {toma === 'LIBRE' && !noPuede && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => tomarParaConformidadAccion(orden.id), { exito: 'La tomaste para la conformidad.' })} data-testid="tomar-conformidad">Tomar para conformidad</button>}
        {toma === 'LIBRE' && noPuede && <span className="text-xs text-gray-600" data-testid="toma-no-puede">{noPuede}.</span>}
        {(toma === 'MIA' || (toma === 'DE_OTRA' && esJefe)) && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => soltarConformidadAccion(orden.id), { exito: 'Quedó libre para todos.' })} data-testid="soltar-conformidad"><Undo2 className="h-4 w-4" aria-hidden />Soltarla</button>}
      </div>
      {esJefe && (
        <div className="flex flex-wrap items-center gap-2" data-testid="asignar-conformidad">
          <label className="sr-only" htmlFor={`as-${orden.id}`}>Asignar la conformidad a</label>
          <select id={`as-${orden.id}`} className="campo !min-h-10 max-w-[14rem] text-sm" value={persona} onChange={(e) => setPersona(e.target.value)} data-testid="asignar-persona">
            <option value="">Asignar a…</option>
            {candidatos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button type="button" className="btn-secondary btn-sm" disabled={pendiente || !persona} onClick={() => ejecutar(() => asignarConformidadAccion(orden.id, persona), { exito: 'Conformidad asignada.', alExito: () => setPersona('') })} data-testid="asignar-conformidad-boton">Asignar</button>
        </div>
      )}
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'} testid="toma-mensaje">{mensaje.texto}</Aviso>}
    </div>
  )
}
