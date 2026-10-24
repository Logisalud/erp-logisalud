'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'

const CLAVE = 'wms-recorrido-visto'
const PANTALLAS = [
  { titulo: 'Tu Inicio es tu lista de trabajo', texto: 'En «Mis tareas» ves lo que te toca ahora, con un botón que te lleva directo. Si no hay nada, lo dice.' },
  { titulo: 'Cada orden dice dónde va y qué sigue', texto: 'Una Orden de Salida o un ingreso muestra sus pasos (hecho, actual, pendiente), quién hace el siguiente y el botón para hacerlo.' },
  { titulo: 'Quien hace una cosa no la revisa', texto: 'El picking lo hace una persona y la conformidad otra; en un ingreso, quien recibe no firma el acta. Si no te toca, la pantalla te dice a quién.' },
  { titulo: 'Después de cada acción te contamos qué pasó', texto: 'Verás un mensaje con lo que se hizo y lo que sigue. Si algo no se puede, te explica por qué y qué hacer.' },
  { titulo: 'Nada se borra', texto: 'Una guía o un acta se anula con motivo y queda la historia. Para corregir se registra la corrección, no se tapa el error.' },
] as const

/** Recorrido de bienvenida: se abre solo la primera vez en este navegador y se puede volver a ver cuando quieras. No bloquea la pantalla. */
export function Recorrido() {
  const [abierto, setAbierto] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => {
    try { if (!window.localStorage.getItem(CLAVE)) setAbierto(true) } catch { /* sin almacenamiento: no se abre solo */ }
  }, [])
  const cerrar = () => {
    setAbierto(false)
    setI(0)
    try { window.localStorage.setItem(CLAVE, '1') } catch { /* no pasa nada */ }
  }
  if (!abierto) {
    return <button type="button" className="btn-secondary btn-sm" onClick={() => { setI(0); setAbierto(true) }} data-testid="ver-recorrido"><Compass className="h-4 w-4" aria-hidden />Ver el recorrido</button>
  }
  const p = PANTALLAS[i]
  const ultima = i === PANTALLAS.length - 1
  return (
    <section aria-labelledby="recorrido-t" className="rounded-lg border border-gray-300 bg-white p-4" data-testid="recorrido">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">Recorrido · {i + 1} de {PANTALLAS.length}</p>
        <button type="button" className="btn-secondary btn-sm" onClick={cerrar} aria-label="Cerrar el recorrido" data-testid="cerrar-recorrido"><X className="h-4 w-4" aria-hidden />Cerrar</button>
      </div>
      <h2 id="recorrido-t" className="mt-1 font-heading text-xl font-medium tracking-wide text-gray-900">{p.titulo}</h2>
      <p className="mt-1 max-w-prose text-gray-800">{p.texto}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft className="h-4 w-4" aria-hidden />Anterior</button>
        {ultima
          ? <button type="button" className="btn-primary btn-sm" onClick={cerrar} data-testid="terminar-recorrido">Entendido</button>
          : <button type="button" className="btn-primary btn-sm" onClick={() => setI(i + 1)} data-testid="siguiente-recorrido">Siguiente<ArrowRight className="h-4 w-4" aria-hidden /></button>}
      </div>
    </section>
  )
}
