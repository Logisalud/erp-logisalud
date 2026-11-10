'use client'

import { useState } from 'react'
import { CalendarClock, Search } from 'lucide-react'
import { marcarProveedorVencimientoAccion } from '@/app/acciones-entradas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

type Proveedor = { ruc: string; nombre: string; soloMesAnio: boolean }

function Fila({ p, puedeMarcar }: { p: Proveedor; puedeMarcar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const nuevo = !p.soloMesAnio
  return (
    <li className="py-3" data-testid="fila-proveedor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{p.nombre}</p>
          <p className="tabular text-sm text-gray-600">RUC {p.ruc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.soloMesAnio
            ? <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900" data-testid="marca-solo-mes-anio"><CalendarClock className="h-3.5 w-3.5" aria-hidden />Vencimiento solo mes y año</span>
            : <span className="text-sm text-gray-600">Imprime la fecha completa</span>}
          {puedeMarcar && !abierto && <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(true)} data-testid="cambiar-marca">{nuevo ? 'Marcar «solo mes y año»' : 'Quitar la marca'}</button>}
        </div>
      </div>
      {abierto && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <label htmlFor={`motivo-${p.ruc}`} className="etiqueta">Motivo <span className="text-red-700">*</span></label>
          <textarea id={`motivo-${p.ruc}`} rows={2} className="campo !min-h-20 py-2" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: sus envases solo traen mes y año." />
          {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pendiente} data-testid="guardar-marca"
              onClick={() => ejecutar(() => marcarProveedorVencimientoAccion(p.ruc, p.nombre, nuevo, motivo), { alExito: () => { setAbierto(false); setMotivo('') } })}>{pendiente ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </li>
  )
}

export function ListaProveedores({ proveedores, puedeMarcar }: { proveedores: Proveedor[]; puedeMarcar: boolean }) {
  const [q, setQ] = useState('')
  const filtrados = proveedores.filter((p) => `${p.nombre} ${p.ruc}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <section className="card" aria-label="Lista de proveedores">
      <div className="relative">
        <label htmlFor="buscar-proveedor" className="etiqueta">Buscar por nombre o RUC</label>
        <Search className="pointer-events-none absolute bottom-3.5 left-3 h-4 w-4 text-gray-500" aria-hidden />
        <input id="buscar-proveedor" className="campo pl-9" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {proveedores.length === 0 ? (
        <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" data-testid="proveedores-vacio">Todavía no hay proveedores: aparecen cuando Compras tiene órdenes de compra.</p>
      ) : filtrados.length === 0 ? (
        <p className="mt-4 text-sm text-gray-700" data-testid="proveedores-sin-resultados">Ningún proveedor coincide con «{q}».</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100" data-testid="lista-proveedores">{filtrados.map((p) => <Fila key={p.ruc} p={p} puedeMarcar={puedeMarcar} />)}</ul>
      )}
    </section>
  )
}
