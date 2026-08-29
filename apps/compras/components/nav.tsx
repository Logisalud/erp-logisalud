'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { usePilaNavegacion } from './pila-navegacion-provider'
import { pasoAnterior } from '@/lib/pila-navegacion'

/**
 * Cabecera común. "Atrás" nunca depende del historial del navegador ni de
 * una ruta fija — usa la pila de pasos en memoria (lib/pila-navegacion.ts,
 * ver ADDENDUM — patrón de navegación "Atrás"): el botón nativo del
 * navegador, después de un redirect() de Server Action, puede caer en 404
 * (basePath + rewrite entre proyectos Vercel distintos). "Módulos" es la
 * única excepción real — es la salida del módulo entero, no un paso de la
 * pila, así que sigue siendo un link de verdad.
 *
 * `atras` queda como el paso "lógico" de la pantalla (para cuando la pila
 * está vacía — primera carga de la sesión, deep link directo) — pero la
 * navegación real, si hay historia en la pila, siempre pasa por ahí.
 */
export function Encabezado({ titulo, atras }: { titulo: string; atras?: { href: string; texto: string } }) {
  const router = useRouter()
  const pathname = usePathname()
  const { pila, registrarPaso, retroceder } = usePilaNavegacion()

  useEffect(() => {
    registrarPaso({ href: pathname, texto: titulo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, titulo])

  const anterior = pasoAnterior(pila)
  const destino = anterior ?? atras

  function irAtras() {
    if (anterior) {
      retroceder()
      router.push(anterior.href)
    } else if (atras) {
      router.push(atras.href)
    }
  }

  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {destino ? (
          <button
            type="button"
            onClick={irAtras}
            className="border-0 bg-transparent p-0 text-sm text-logisalud-teal underline"
          >
            &larr; {destino.texto}
          </button>
        ) : (
          <a href="/" className="text-sm text-logisalud-teal underline">
            &larr; Módulos
          </a>
        )}
        <h1 className="font-heading mt-1 text-2xl">{titulo}</h1>
      </div>
      <BotonCerrarSesion />
    </header>
  )
}
