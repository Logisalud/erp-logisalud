'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

const OPCIONES = [
  { href: '/ordenes-compra/nueva', emoji: '🛒', titulo: 'Compra de mercadería', descripcion: 'Productos que compramos para revender.' },
  { href: '/ordenes-compra/nueva-bien', emoji: '💼', titulo: 'Compra de un bien', descripcion: 'Equipos, muebles u otros bienes que no son para revender.' },
  { href: '/servicios/nueva', emoji: '🤝', titulo: 'Contratar un servicio', descripcion: 'Servicios prestados por un proveedor.' },
]

/** Cada opción reutiliza el flujo de creación que ya existe — este menú solo elige entre ellos. */
export function NuevaOrdenMenu() {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function alHacerClickAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClickAfuera)
    return () => document.removeEventListener('mousedown', alHacerClickAfuera)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto((v) => !v)} className="btn-primary w-full sm:w-auto" aria-haspopup="true" aria-expanded={abierto}>
        + Nueva orden
      </button>
      {abierto ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-2 shadow-lg sm:left-0 sm:right-auto">
          {OPCIONES.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className="block rounded-md p-3 hover:bg-gray-50"
              onClick={() => setAbierto(false)}
            >
              <span className="font-medium">{o.emoji} {o.titulo}</span>
              <span className="mt-0.5 block text-sm text-gray-600">{o.descripcion}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
