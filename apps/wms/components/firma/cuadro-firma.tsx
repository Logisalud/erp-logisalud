'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Eraser } from 'lucide-react'

/**
 * Cuadro de firma para pantalla táctil (dedo) y mouse. Reutilizable: lo usa la firma del transportista del acta de recepción
 * y cualquier pantalla que pida una firma dibujada. Dos botones grandes: «Borrar» (empezar de nuevo) y «Listo» (da por buena la firma).
 * Entrega la firma como PNG en data URL con `onListo(imagen)`, o `onListo(null)` si se borra o todavía no hay firma.
 * Se ve completo en 390×844: el lienzo ocupa todo el ancho y los botones se apilan en el teléfono.
 */
export function CuadroFirma({ onListo, alto = 200, descripcion = 'Espacio para la firma: dibuja con el dedo o con el mouse' }: { onListo: (imagen: string | null) => void; alto?: number; descripcion?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const hayTrazo = useRef(false)
  const [conTrazo, setConTrazo] = useState(false)
  const [lista, setLista] = useState(false)

  const preparar = useCallback(() => {
    const c = ref.current
    if (!c) return
    const r = window.devicePixelRatio || 1
    const ancho = c.parentElement?.clientWidth ?? 320
    c.width = Math.floor(ancho * r)
    c.height = Math.floor(alto * r)
    c.style.width = `${ancho}px`
    c.style.height = `${alto}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(r, r)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    hayTrazo.current = false
  }, [alto])

  // Se prepara una sola vez; `onListo` no se vuelve a llamar por cambios de la pantalla.
  useEffect(() => { preparar() }, [preparar])

  const borrar = () => {
    preparar()
    setConTrazo(false)
    setLista(false)
    onListo(null)
  }
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = ref.current!.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lista) return
    e.preventDefault()
    ref.current!.setPointerCapture?.(e.pointerId)
    dibujando.current = true
    const ctx = ref.current!.getContext('2d')
    if (!ctx) return
    const { x, y } = punto(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y + 0.01)
    ctx.stroke()
  }
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = ref.current!.getContext('2d')
    if (!ctx) return
    const { x, y } = punto(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hayTrazo.current = true
  }
  const terminar = () => {
    if (!dibujando.current) return
    dibujando.current = false
    if (hayTrazo.current) setConTrazo(true)
  }
  const listo = () => {
    if (!conTrazo || !ref.current) return
    setLista(true)
    onListo(ref.current.toDataURL('image/png'))
  }

  return (
    <div data-testid="cuadro-firma">
      <div className={`relative overflow-hidden rounded-md border-2 bg-white ${lista ? 'border-green-600' : 'border-dashed border-gray-400'}`}>
        <canvas ref={ref} role="img" aria-label={descripcion} data-testid="lienzo-firma" className="block touch-none"
          onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar} />
        {!conTrazo && <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-gray-600">Firma aquí con el dedo</span>}
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm" data-testid="estado-firma">
        {lista ? <span className="inline-flex items-center gap-1.5 font-medium text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden />Firma lista. Si te equivocaste, pulsa «Borrar».</span>
          : conTrazo ? <span className="text-gray-700">Cuando termines, pulsa «Listo».</span> : <span className="text-gray-600">Dibuja la firma en el cuadro.</span>}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={borrar} disabled={!conTrazo && !lista} data-testid="borrar-firma"
          className="btn-secondary">
          <Eraser className="h-4 w-4" aria-hidden />Borrar
        </button>
        <button type="button" onClick={listo} disabled={!conTrazo || lista} data-testid="firma-lista"
          className="btn-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden />Listo
        </button>
      </div>
    </div>
  )
}
