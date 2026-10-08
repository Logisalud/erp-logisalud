'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { atenderAlertaAccion } from '@/app/acciones-entradas'
import { DESTINATARIO_ALERTA, puedeAtenderAlerta } from '@/domain/entradas'
import type { AlertaVista } from '@/domain/entradas-vistas'
import { formatoFechaHora } from '@/domain/fechas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { ChipAlerta } from '../entradas/chips-entradas'

function Tarjeta({ a, roles }: { a: AlertaVista; roles: Rol[] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nota, setNota] = useState('')
  const puede = a.estado === 'ABIERTA' && puedeAtenderAlerta(roles, a.tipo)
  return (
    <li className="card" data-testid="alerta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2"><ChipAlerta tipo={a.tipo} /><p className="text-gray-900">{a.mensaje}</p>
          <p className="text-xs text-gray-600">{formatoFechaHora(a.creadaEn)} · para {a.destinatario === 'direccion_tecnica' ? 'Dirección Técnica' : 'el Jefe de Almacén'}{a.ingresoId && <> · <Link href={`/entradas/${a.ingresoId}`} className="underline">ver el ingreso</Link></>}{a.loteCodigo && <> · <Link href={`/almacen?capa=estado&buscar=${encodeURIComponent(a.loteCodigo)}`} className="underline" data-testid="alerta-ver-mapa">ver en el mapa</Link></>}{a.productoId && !a.ingresoId && <> · <Link href={`/productos/${a.productoId}`} className="underline">ver el producto</Link></>}</p></div>
        {a.estado === 'ATENDIDA' && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Atendida</span>}
      </div>
      {a.estado === 'ATENDIDA' && <p className="mt-2 text-sm text-gray-600">{a.atendidaPor}, {formatoFechaHora(a.atendidaEn)}{a.nota ? ` · ${a.nota}` : ''}</p>}
      {puede && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1"><label htmlFor={`nota-${a.id}`} className="etiqueta">Qué hiciste (opcional)</label><input id={`nota-${a.id}`} className="campo" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" /></div>
          <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => atenderAlertaAccion(a.id, nota || undefined), { exito: 'Alerta atendida.' })} data-testid="atender-alerta">{pendiente ? 'Guardando…' : 'Marcar como atendida'}</button>
        </div>
      )}
      {a.estado === 'ABIERTA' && !puede && <p className="mt-2 text-xs text-gray-600">La atiende {DESTINATARIO_ALERTA[a.tipo] === 'jefe_almacen' ? 'el Jefe de Almacén' : 'Dirección Técnica'}.</p>}
      {mensaje?.tipo === 'error' && <div className="mt-2"><Aviso tipo="error">{mensaje.texto}</Aviso></div>}
    </li>
  )
}

export function ListaAlertas({ alertas, roles }: { alertas: AlertaVista[]; roles: Rol[] }) {
  return <ul className="space-y-3">{alertas.map((a) => <Tarjeta key={a.id} a={a} roles={roles} />)}</ul>
}
