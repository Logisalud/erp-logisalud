'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { cerrarConteoAccion } from '@/app/acciones-inventario'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

/** El Jefe cierra el conteo: coincide, se corrigió o se escaló. Con diferencias hay que dejar causa y acción. */
export function CierreConteo({ id, pendientes }: { id: string; pendientes: number }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [causa, setCausa] = useState('')
  const [accion, setAccion] = useState('')
  return (
    <section className="card space-y-3" aria-labelledby="cierre" data-testid="cierre-conteo">
      <h2 id="cierre" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Cerrar el conteo</h2>
      {pendientes > 0 ? <p className="text-sm text-gray-700">Quedan {pendientes} {pendientes === 1 ? 'línea' : 'líneas'} sin resolver: cuéntalas, explica la causa y corrige, ajusta con autorización o escálalas.</p>
        : <p className="text-sm text-gray-700">Todo está resuelto. Si hubo diferencias, deja la causa y la acción; se guarda la fecha, el alcance, quién contó y el resultado.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div><label htmlFor="cierre-causa" className="etiqueta">Causa (si hubo diferencias)</label><input id="cierre-causa" className="campo" value={causa} onChange={(e) => setCausa(e.target.value)} autoComplete="off" data-testid="cierre-causa" /></div>
        <div><label htmlFor="cierre-accion" className="etiqueta">Acción tomada</label><input id="cierre-accion" className="campo" value={accion} onChange={(e) => setAccion(e.target.value)} autoComplete="off" data-testid="cierre-accion" /></div>
      </div>
      <button type="button" className="btn-primary" disabled={pendiente} onClick={() => ejecutar(() => cerrarConteoAccion(id, causa || undefined, accion || undefined), { exito: 'Conteo cerrado.' })} data-testid="cerrar-conteo"><Lock className="h-5 w-5" aria-hidden />{pendiente ? 'Cerrando…' : 'Cerrar el conteo'}</button>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </section>
  )
}
