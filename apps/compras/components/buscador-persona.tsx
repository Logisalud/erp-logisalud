'use client'

import { useMemo, useState } from 'react'
import { filtrarPersonas, type OpcionPersona } from '@/domain/buscar-persona'

/**
 * "¿Para quién es el anticipo?" — buscador en vez de <select>.
 *
 * La lista junta a los usuarios y a las personas sin usuario (vendedores,
 * migración 0081): con los vendedores ya no entra cómoda en un <select>.
 * Son pocas decenas, así que viene entera desde el servidor y se filtra en
 * el navegador — no hace falta una búsqueda en el servidor como la de
 * proveedores o productos.
 *
 * Manda UN campo oculto (`name`) con el valor codificado
 * (`usuario:<id>` / `persona:<id>`, ver leerAsignado); vacío = "Para mí".
 */
export function BuscadorPersona({
  name,
  opciones,
  valorInicial = '',
}: {
  name: string
  opciones: readonly OpcionPersona[]
  valorInicial?: string
}) {
  const [valor, setValor] = useState(valorInicial)
  const [termino, setTermino] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)

  const elegida = opciones.find((o) => o.valor === valor) ?? null
  const visibles = useMemo(() => filtrarPersonas(opciones, termino, valor), [opciones, termino, valor])

  function elegir(nuevo: string) {
    setValor(nuevo)
    setTermino('')
    setAbierto(false)
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setResaltado((r) => Math.min(r + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((r) => Math.max(r - 1, 0))
    } else if (e.key === 'Enter') {
      // Enter dentro del buscador elige, no envía el formulario entero.
      if (abierto && visibles[resaltado]) {
        e.preventDefault()
        elegir(visibles[resaltado].valor)
      }
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={valor} />
      {elegida ? (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-gray-300 px-3">
          <span className="text-sm">{elegida.nombre}</span>
          <button type="button" onClick={() => elegir('')} className="shrink-0 text-sm text-logisalud-teal underline">
            Cambiar
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={termino}
            onChange={(e) => { setTermino(e.target.value); setAbierto(true); setResaltado(0) }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            onKeyDown={alTeclear}
            placeholder="Para mí — o escribe un nombre"
            role="combobox"
            aria-expanded={abierto}
            aria-autocomplete="list"
            className="min-h-12 w-full rounded-md border border-gray-300 px-3"
          />
          {abierto ? (
            <ul role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-md">
              {visibles.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">
                  Nadie con ese nombre. Si es un vendedor nuevo, pídele a Contabilidad que lo agregue.
                </li>
              ) : (
                visibles.map((o, i) => (
                  <li key={o.valor} role="option" aria-selected={i === resaltado}>
                    <button
                      type="button"
                      // onMouseDown y no onClick: el blur del input cerraría
                      // la lista antes de que el click llegue.
                      onMouseDown={(e) => { e.preventDefault(); elegir(o.valor) }}
                      className={`block min-h-12 w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${i === resaltado ? 'bg-gray-50' : ''}`}
                    >
                      {o.nombre}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
