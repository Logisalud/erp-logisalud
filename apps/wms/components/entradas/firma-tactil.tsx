'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/** Lienzo de firma para pantalla táctil (y mouse). Entrega la firma como PNG en data URL, o null si está vacío. */
export function FirmaTactil({ onCambio, alto = 160 }: { onCambio: (imagen: string | null) => void; alto?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const hayTrazo = useRef(false)
  const [vacio, setVacio] = useState(true)

  const preparar = useCallback(() => {
    const c = ref.current
    if (!c) return
    const r = window.devicePixelRatio || 1
    const ancho = c.parentElement?.clientWidth ?? 320
    c.width = Math.floor(ancho * r)
    c.height = Math.floor(alto * r)
    c.style.width = `${ancho}px`
    c.style.height = `${alto}px`
    const ctx = c.getContext('2d')!
    ctx.scale(r, r)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    hayTrazo.current = false
    setVacio(true)
    onCambio(null)
  }, [alto, onCambio])

  useEffect(() => { preparar() }, [preparar])

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = ref.current!.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    ref.current!.setPointerCapture(e.pointerId)
    dibujando.current = true
    const ctx = ref.current!.getContext('2d')!
    const { x, y } = punto(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y + 0.01)
    ctx.stroke()
  }
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = ref.current!.getContext('2d')!
    const { x, y } = punto(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hayTrazo.current = true
  }
  const terminar = () => {
    if (!dibujando.current) return
    dibujando.current = false
    if (hayTrazo.current) {
      setVacio(false)
      onCambio(ref.current!.toDataURL('image/png'))
    }
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-md border-2 border-dashed border-gray-300 bg-white">
        <canvas ref={ref} role="img" aria-label="Espacio para la firma del transportista: dibuja con el dedo" data-testid="lienzo-firma"
          className="block touch-none" onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar} />
        {vacio && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-500">Firma aquí con el dedo</span>}
      </div>
      <button type="button" onClick={preparar} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100"><Eraser className="h-4 w-4" aria-hidden />Borrar y firmar de nuevo</button>
    </div>
  )
}
