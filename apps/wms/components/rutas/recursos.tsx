'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Plus, Save } from 'lucide-react'
import { guardarPersonalAccion, guardarVehiculoAccion } from '@/app/acciones-rutas'
import type { PanoramaRutas, PersonalTransporte, VehiculoVista } from '@/domain/rutas'
import { CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

const chip = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

function FilaPersonal({ p, puedeEditar }: { p: PersonalTransporte; puedeEditar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="fila-personal">
      <span className="min-w-0 flex-1 font-medium text-gray-900">{p.nombre}</span>
      <span className={`${chip} ${p.activo ? CHIP_OK : CHIP_NEUTRO}`}>{p.activo ? 'Disponible' : 'No disponible'}</span>
      {puedeEditar && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => guardarPersonalAccion({ id: p.id, nombre: p.nombre, funcion: p.funcion, activo: !p.activo }))}>{p.activo ? 'Marcar no disponible' : 'Marcar disponible'}</button>}
      {mensaje?.tipo === 'error' && <span className="basis-full text-sm text-red-800">{mensaje.texto}</span>}
    </li>
  )
}

function NuevoPersonal({ funcion }: { funcion: PersonalTransporte['funcion'] }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [nombre, setNombre] = useState('')
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1"><label htmlFor={`np-${funcion}`} className="etiqueta">Agregar {funcion === 'CONDUCTOR' ? 'conductor' : 'auxiliar'}</label><input id={`np-${funcion}`} className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} data-testid={`nuevo-${funcion}`} /></div>
        <button type="button" className="btn-secondary" disabled={pendiente || !nombre.trim()} onClick={() => ejecutar(() => guardarPersonalAccion({ nombre, funcion, activo: true }), { exito: 'Guardado.', alExito: () => setNombre('') })} data-testid={`guardar-${funcion}`}><Plus className="h-5 w-5" aria-hidden />Agregar</button>
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}

function NuevoVehiculo() {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [placa, setPlaca] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [calificado, setCalificado] = useState(false)
  const [frio, setFrio] = useState(false)
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="v-placa" className="etiqueta">Placa</label><input id="v-placa" className="campo tabular uppercase" value={placa} onChange={(e) => setPlaca(e.target.value)} data-testid="vehiculo-placa" aria-invalid={!!mensaje?.errores?.placa} />{mensaje?.errores?.placa && <p className="mt-1 text-sm text-red-800">{mensaje.errores.placa}</p>}</div>
        <div><label htmlFor="v-desc" className="etiqueta">Descripción <span className="font-normal text-gray-600">(opcional)</span></label><input id="v-desc" className="campo" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} data-testid="vehiculo-descripcion" /></div>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={calificado} onChange={(e) => setCalificado(e.target.checked)} data-testid="vehiculo-calificado" />Vehículo calificado</label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-900"><input type="checkbox" className="h-5 w-5" checked={frio} onChange={(e) => setFrio(e.target.checked)} />Apto para cadena de frío</label>
      </div>
      <button type="button" className="btn-secondary" disabled={pendiente || !placa.trim()} onClick={() => ejecutar(() => guardarVehiculoAccion({ placa, descripcion, tipo: 'PROPIO', calificado, aptoCadenaFrio: frio, activo: true }), { exito: 'Vehículo guardado.', alExito: () => { setPlaca(''); setDescripcion(''); setCalificado(false); setFrio(false) } })} data-testid="guardar-vehiculo"><Save className="h-5 w-5" aria-hidden />Guardar vehículo</button>
      {mensaje && !mensaje.errores && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}

function FilaVehiculo({ v, puedeEditar }: { v: VehiculoVista; puedeEditar: boolean }) {
  const { pendiente, ejecutar } = useAccion()
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="fila-vehiculo">
      <div className="min-w-0 flex-1"><span className="tabular font-medium text-gray-900">{v.placa}</span><span className="ml-2 text-sm text-gray-700">{v.descripcion}</span></div>
      {v.calificado && <span className={`${chip} ${CHIP_OK}`}>Calificado</span>}
      {v.aptoCadenaFrio && <span className={`${chip} ${CHIP_OK}`}>Frío</span>}
      <span className={`${chip} ${v.activo ? CHIP_OK : CHIP_NEUTRO}`}>{v.activo ? 'Disponible' : 'No disponible'}</span>
      {puedeEditar && <button type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => guardarVehiculoAccion({ ...v, activo: !v.activo }))}>{v.activo ? 'Marcar no disponible' : 'Marcar disponible'}</button>}
    </li>
  )
}

export function RecursosVista({ panorama, puedeEditar }: { panorama: PanoramaRutas; puedeEditar: boolean }) {
  const grupos: { titulo: string; funcion: PersonalTransporte['funcion'] }[] = [{ titulo: 'Conductores', funcion: 'CONDUCTOR' }, { titulo: 'Auxiliares', funcion: 'AUXILIAR' }]
  return (
    <div className="space-y-6" data-testid="recursos-ruta">
      <Link href="/rutas" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-green-800 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a rutas</Link>
      {grupos.map((g) => (
        <section key={g.funcion} aria-labelledby={`t-${g.funcion}`} className="space-y-2">
          <h2 id={`t-${g.funcion}`} className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">{g.titulo}</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {panorama.personal.filter((p) => p.funcion === g.funcion).map((p) => <FilaPersonal key={p.id} p={p} puedeEditar={puedeEditar} />)}
            {puedeEditar && <li className="list-none"><NuevoPersonal funcion={g.funcion} /></li>}
          </ul>
        </section>
      ))}
      <section aria-labelledby="t-vehiculos" className="space-y-2">
        <h2 id="t-vehiculos" className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">Vehículos</h2>
        <p className="max-w-3xl text-sm text-gray-700">«Calificado» es lo que exigen algunos clientes (por ejemplo, una clínica con cadena de frío). Qué vehículos califican lo define Dirección Técnica con el Jefe de Transporte.</p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {panorama.vehiculos.map((v) => <FilaVehiculo key={v.id} v={v} puedeEditar={puedeEditar} />)}
          {puedeEditar && <li className="list-none"><NuevoVehiculo /></li>}
        </ul>
      </section>
    </div>
  )
}
